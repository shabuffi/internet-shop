# Rollback — полный откат security-релиза (Stages 1–3)

Инструкция отката релиза **`9947863`** (security Stages 1–3), задеплоенного 2026-07-14, к предыдущему состоянию **`0574788`**.

> ⚠️ Это план на случай проблем. На момент написания откат НЕ требуется (пост-деплой проверки зелёные). Ничего здесь не выполнено.

## Опорные точки

| Что | Значение |
|---|---|
| Задеплоенный security-коммит | `9947863` |
| Doc-коммит (на origin, прод не тянул) | `cc60a77` |
| Предыдущий (целевой для отката) коммит | `0574788` |
| Alembic сейчас | `d6e7f8a9b0c1` |
| Alembic целевой (после отката) | `1567fb6768ce` |
| Миграции релиза (в порядке отката) | `d6e7f8a9b0c1` → `d5e6f7a8b9c0` → (`1567fb6768ce`) |
| Бэкап БД до миграций | `backups/backup_2026-07-14_180955.sql` (снят `./deploy.sh` ПЕРЕД миграциями) |
| Prod-путь | `/opt/internet-shop` |
| Compose-префикс | `docker compose --env-file .env.prod -f docker-compose.prod.yml` |

Что делали миграции релиза (важно для выбора способа отката БД):
- `d5e6f7a8b9c0` — создала SEQUENCE `order_number_seq` (данных не трогает).
- `d6e7f8a9b0c1` — создала UNIQUE INDEX `ix_users_phone` (данных не трогает).

→ **Оба объекта — только схема, без изменения данных.** Поэтому основной способ отката БД — `alembic downgrade` (без потери данных). Восстановление из бэкапа — крайняя мера (теряются данные, записанные после 18:09).

---

## ВАЖНО про порядок

Downgrade БД надо делать, **пока файлы миграций `d5e6`/`d6e7` ещё в дереве** (alembic downgrade читает их). Поэтому порядок такой:
**(0) свежий бэкап → (1) downgrade БД → (2) откат кода → (3) redeploy → (4) проверки.**

Если сделать наоборот (сначала убрать файлы миграций через revert), alembic не найдёт ревизию `d6e7f8a9b0c1` и не сможет откатиться.

---

## Шаг 0. Свежий бэкап (чтобы можно было и откатить, и вернуться)

```bash
cd /opt/internet-shop
./backup-db.sh            # снимет backups/backup_<дата>.sql
```

## Шаг 1. Откат БД — вариант A (рекомендуемый, без потери данных)

`alembic downgrade` до `1567fb6768ce` — дропает `ix_users_phone` и `order_number_seq`, пользовательские данные не трогает:

```bash
cd /opt/internet-shop
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend \
  alembic downgrade 1567fb6768ce
# проверить:
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend alembic current
#   ожидаем: 1567fb6768ce
```

> ⚠️ После downgrade новый код (`_next_order_number` → `nextval('order_number_seq')`) сломается на оформлении заказа, т.к. sequence удалён. Поэтому СРАЗУ выполнить Шаг 2 (откат кода). В идеале — между Шагом 1 и 3 не принимать заказы (короткое окно) либо сделать Шаги 1–3 подряд.

## Шаг 2. Откат кода (git) — предпочтительно `revert` (без force-push)

```bash
cd /opt/internet-shop
git log --oneline -3     # убедиться, что HEAD = 9947863
# создаём revert-коммиты (обратимо, история сохраняется):
git revert --no-edit 9947863
git push origin main
```
Revert вернёт `main.py`/`exchange.py`/`nginx.prod.conf`/`orders.py`/… к состоянию `0574788` и удалит из дерева файлы миграций `d5e6`/`d6e7` (они уже откачены в БД на Шаге 1 — ок).

> Альтернатива (если нужно жёстко и НЕ жаль историю): `git reset --hard 0574788` — но тогда origin/main впереди; НЕ делать force-push в общий `main` (есть Codex-хук и другие сессии). `revert` безопаснее.

## Шаг 3. Пересборка/перезапуск

```bash
cd /opt/internet-shop
git pull origin main       # подтянуть revert-коммит (если Шаг 2 делался локально — пропустить)
./deploy.sh
```
`deploy.sh` снимет бэкап и выполнит `alembic upgrade head`. После revert head = `1567fb6768ce`, БД уже там → upgrade будет no-op. ✅

## Шаг 1-бис. Откат БД — вариант B (крайняя мера, восстановление из бэкапа)

Только если схема/данные повреждены и `alembic downgrade` невозможен.
**⚠️ Потеряются все данные, записанные после 18:09 2026-07-14** (заказы/регистрации). Бэкап — plain `pg_dump` без `--clean`, поэтому восстанавливать в чистую БД:

```bash
cd /opt/internet-shop
# 1) остановить приложение (чтобы не писало в БД во время восстановления)
docker compose --env-file .env.prod -f docker-compose.prod.yml stop backend worker beat
# 2) пересоздать БД (ОПАСНО — стирает текущую!)
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db \
  psql -U shop_user -d postgres -c "DROP DATABASE shop_db;" -c "CREATE DATABASE shop_db OWNER shop_user;"
# 3) залить дамп
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db \
  psql -U shop_user -d shop_db < backups/backup_2026-07-14_180955.sql
# 4) поднять приложение
docker compose --env-file .env.prod -f docker-compose.prod.yml start backend worker beat
```
После этого код тоже откатить (Шаги 2–3), т.к. дамп соответствует схеме `1567fb6768ce`.

---

## Шаг 4. Проверки после отката

```bash
# alembic на 1567fb6768ce
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend alembic current
# health
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend \
  python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=5).read())"
# контейнеры
docker ps --format "{{.Names}}: {{.Status}}"
# сайт
curl -s -o /dev/null -w "%{http_code}\n" https://td-engineer.ru/
# целостность данных (сверить с ожидаемым)
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db \
  psql -U shop_user -d shop_db -tc "select (select count(*) from users) users, (select count(*) from orders) orders;"
```

**Ожидаемая обратная сторона отката (это нормально, релиз откатывается):**
- `/docs`, `/openapi.json`, `/redoc` снова станут **доступны** (старый код без DEBUG-гейта).
- Security-заголовки в ответах nginx **исчезнут** (H-3 откатан).
- Обмен CommerceML вернётся к прежней логике (fail-open в «мягком режиме», если креды не заданы; т.к. креды заданы — по-прежнему требует auth).
- Номер заказа снова считается `COUNT(*)+1`; уникальность телефона на уровне БД снята.

## Откат «вперёд» (re-deploy security после устранения причины)
`git revert` самих revert-коммитов **или** `git pull` уже содержащего `9947863` состояния + `./deploy.sh` (миграции применятся заново `1567 → d5e6 → d6e7`).
