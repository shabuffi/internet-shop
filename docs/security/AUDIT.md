# Security Audit — internet-shop

Реестр подтверждённых проблем безопасности. Ведётся инкрементально: правим статус/уровень, не переписываем целиком.

**Легенда статуса:** 🔴 open · 🟡 in progress · ✅ fixed (в коде, ждёт деплоя) · 🚀 deployed · ⚪ won't-fix/accepted

Последнее обновление: **2026-08-04** — безопасная смена email (B-3/B-4) **задеплоена на прод** (commit `d945eed`, alembic head `b3c4d5e6f7a8`). Stages 1–3 **задеплоены на прод** 2026-07-14 (commit `9947863`, alembic head `d6e7f8a9b0c1`).

## Область

Статический + динамический аудит кода, конфигураций, Docker, локального стека (3 прохода: аудит → ре-верификация → pre-release). Прод-хост (`td-engineer.ru`) по SSH **не проверялся** — раздел «сервер» вне охвата.

> Финальный review (2026-07-14): все фиксы Stage 1 + Stage 3 подтверждены прогоном тестов (**162 зелёных**), миграции проверены (линейный head, downgrade/upgrade). Итоговая сводка — `FINAL_REPORT.md`.

## Подтверждённые находки

| ID | Проблема | Уровень | Файл/место | Статус |
|----|----------|---------|------------|--------|
| C-1 | Секреты `MOYSKLAD_LOGIN/PASSWORD` открытым текстом (личный пароль); код их не читает, в git не коммитились | 🟠 High | `.env` | 🔴 open (нужна ротация + ручное удаление) |
| H-1 | Fail-open обмена CommerceML: при пустых кредах пускал всех; `mode=query` отдаёт ПДн, `mode=import` перезаписывает каталог | 🟠 High | `api/v1/endpoints/exchange.py` | 🚀 deployed 2026-07-14 (9947863) |
| H-2 | Swagger/OpenAPI/Redoc открыты на проде | 🟡 Medium | `main.py`, `nginx.prod.conf` | 🚀 deployed 2026-07-14 (9947863) |
| H-3 | Нет security-заголовков на проде (HSTS/X-Frame-Options/nosniff/Referrer-Policy) | 🟡 Medium | `nginx/nginx.prod.conf` | 🚀 deployed 2026-07-14 (9947863) |
| M-1 | `docker.sock` смонтирован в контейнер `autoheal` (`:latest`) — root на хосте при компрометации | 🟡 Medium | `docker-compose.prod.yml` | 🔴 open (отложено) |
| M-2 | Нет rate-limit на `/orders`, `/leads` | 🟡 Medium | `api/v1/endpoints/orders.py`, `leads.py` | 🚀 deployed 2026-07-14 (9947863) |
| M-4 | `COOKIE_SECURE` дефолт `False`; отсутствует в `.env.prod.example` | 🟡 Medium | `core/config.py`, `.env.prod.example` | ✅ verified on prod 2026-07-14 (`.env.prod`: `COOKIE_SECURE=true`, `DEBUG=false`, `ALLOWED_ORIGINS`=боевые HTTPS, `SECRET_KEY` задан) — на бою не проблема |
| M-5 | `/admin/setup` создавал первого админа без аутентификации | 🟢 Low | `api/v1/endpoints/admin.py` | 🚀 deployed 2026-07-14 (9947863, доработан) |
| B-1 | Race condition в номере заказа (`COUNT(*)+1`, `number` unique → 500 при гонке) | 🟢 Low | `api/v1/endpoints/orders.py` | 🚀 deployed 2026-07-14 (9947863) |
| B-2 | `users.phone` не уникален на уровне БД (TOCTOU при регистрации) | 🟢 Low | `db/models/user.py` | 🚀 deployed 2026-07-14 (9947863) |
| B-3 | TOCTOU при регистрации: `users.email`/`phone` проверяются `select`-ом, вставка без гарда — гонка двух регистраций даёт 500 от unique-индекса | 🟢 Low | `api/v1/endpoints/auth.py` | 🚀 deployed 2026-08-04 (d945eed) |
| B-4 | Смена email как вектор захвата аккаунта (email = логин): реализована 2026-08-03 сразу с защитой — текущий пароль на заявку, подтверждение владения новым ящиком, письмо-сигнал на старый адрес, rate-limit по IP и по аккаунту | 🟢 Low | `api/v1/endpoints/auth.py` | 🚀 deployed 2026-08-04 (d945eed) |

## Проверено — уязвимости НЕТ (ложные для проекта)

SQL Injection · XSS / DOM XSS · IDOR · RCE · SSRF · CSRF (защита SameSite=Lax + CORS-список) · Path Traversal / LFI / Zip-Slip · Email Header Injection · Mass Assignment · Open Redirect · Response Splitting / Request Smuggling · Prototype Pollution · ReDoS · Host-header reset poisoning (ссылка из `ALLOWED_ORIGINS`, не из `Host`) · Секреты в истории Git / в Docker-образах.

Понижены после ре-верификации: XXE / entity-DoS — libxml2 блокирует оба вектора (внешние сущности + amplification, проверено тестом) → только hardening-рекомендация (не эксплуатируется).

## Прод-хост — аудит выполнен 2026-07-14 (SSH `root@31.129.110.22`, только чтение)

**Признаков компрометации НЕТ.** Майнера из инцидента 13.07 нет; `/tmp`,`/var/tmp`,`/dev/shm` чисты; `/etc/ld.so.preload` отсутствует (нет руткит-preload); топ CPU — штатные процессы (<3%); backend/frontend под uid 1000 (non-root); cron чист (certbot/e2scrub/sysstat).

**Защита держится:** SSH эффективно key-only (`sshd -T`: `passwordauthentication no`, `permitrootlogin without-password`); fail2ban (jail sshd) активен; блок C2 `51.158.248.123` жив (iptables DOCKER-USER+OUTPUT DROP) + `block-c2.service` enabled+active; наружу слушают только 22/80/443, БД/redis/backend не опубликованы; все 8 контейнеров healthy/up.

**Мелкие замечания (defense-in-depth, требуют подтверждения владельца):**
- ⚠️ `authorized_keys` root — **3 ключа** (отпечатки: `JVLH…`, `02gR…`, `lzUz… ED25519`); владельцу подтвердить, что все три свои.
- ⚠️ Успешный root-вход с **`176.124.216.176`** (13.07 15:56) — IP не из известных (`5.165.139.212`=владелец, `185.155.118.1`=beget); подтвердить, что это был владелец.
- `ufw` **inactive** (хостового фаервола нет; наружу и так только 22/80/443 — активной экспозиции нет, но включить ufw allow 22/80/443 = плюс к защите).
- ~39 800 неудачных SSH-попыток (брутфорс-шум; безвреден при key-only+fail2ban; можно ограничить :22 по IP).
- Косметика: в основном `/etc/ssh/sshd_config` остались строки `PasswordAuthentication yes`/`PermitRootLogin yes` — перекрыты drop-in'ом (эффективно hardened), но лучше убрать для ясности.
