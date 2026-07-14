# Security Fixes — internet-shop

Что и как исправлено, по этапам. Дополняется, не переписывается.

---

## Stage 1 — 2026-07-14 (в коде, НЕ задеплоено)

- **H-1** `exchange.py` — fail-open → fail-closed: `_is_authorized` возвращает `False` при пустых кредах обмена; ветка `checkauth` отдаёт `failure` вместо статичной сессии. Безопасно: на проде креды заданы → поведение настроенного обмена не изменилось.
- **H-2** `main.py` — `docs_url`/`redoc_url`/`openapi_url` = `None` при `not settings.DEBUG`. Проверено: DEBUG=false → 404, DEBUG=true → 200.
- **H-3** `nginx/nginx.prod.conf` — добавлены заголовки на 443-server: `Strict-Transport-Security`, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`. CSP намеренно не добавлялся (чтобы не сломать Next.js). Заголовки на уровне `server`, ни одна `location` их не перекрывает.
- **M-2** `orders.py`, `leads.py` — `rate_limit(...limit=10, window_sec=600)` по IP через существующий механизм. Fail-open при недоступности Redis.
- **M-5** `admin.py` — `/admin/setup` закрыт. Итоговая реализация (после правки заказчика, НЕ через DEBUG): требуется `settings.SETUP_TOKEN` (пустой → 403), верный одноразовый токен в теле `setup_token` или заголовке `X-Setup-Token` (constant-time `hmac.compare_digest`, иначе 401), и отсутствие уже созданного админа (иначе 400). Добавлено поле `SETUP_TOKEN` в `core/config.py`.

Проверка Stage 1: backend reload без ошибок; `/health` 200; обмен по-прежнему auth-gated; rate-limit не даёт 500; `nginx -t` — только ожидаемая ошибка отсутствующего локально TLS-сертификата; все 6 путей `/admin/setup` возвращают ожидаемые коды.

---

## Stage 2 — 2026-07-14 (проверка, без изменений кода)

- **Прод-конфиг:** `.env.prod` в рабочем каталоге отсутствует → фактические значения не проверить. По коду: `DEBUG` дефолт `False` (ок), `ALLOWED_ORIGINS` не wildcard (ок), `COOKIE_SECURE` дефолт `False` и **отсутствует в `.env.prod.example`** (M-4, требует проверки на сервере), JWT — `HS256`+срок зашиты, `SECRET_KEY` обязателен (в проде точно задан). httpOnly/SameSite=Lax гарантированы кодом.
- **Секреты MOYSKLAD:** подтверждены мёртвыми — вхождения только в `.env` и `.env.example`; в `Settings` полей нет + `extra="ignore"`; ни `os.getenv`, ни `settings.MOYSKLAD` в коде. Предложено удалить блок из `.env` вручную и сменить пароль. `SYNC_INTERVAL_SECONDS` — тоже не читается.

Изменений кода не потребовалось.

---

## Stage 3 — 2026-07-14 (в коде + 2 миграции, НЕ задеплоено)

- **B-1** Номер заказа — race-free через Postgres SEQUENCE.
  - Миграция `d5e6f7a8b9c0_add_order_number_sequence.py`: `CREATE SEQUENCE order_number_seq`, `setval` = максимальный существующий номер (nextval стартует с max+1, без пересечения).
  - `orders.py` `_next_order_number` теперь `SELECT nextval('order_number_seq')` → `ORD-{n:04d}` (было `COUNT(*)+1`). Импорт `func`→`text`.
  - Почему устранено: `nextval` атомарен и не блокирует; при нескольких воркерах/параллельных запросах номера не дублируются (раньше два одновременных заказа брали одинаковый `COUNT+1` → второй падал на unique-constraint 500). Возможны пропуски при откате — номерам нужна только уникальность.
  - Проверка: `nextval` дважды → 16, 17 (последовательно, атомарно); `_next_order_number` → `ORD-0016`/`ORD-0017`; sequence возвращён на 15 (следующий реальный заказ = ORD-0016). Backend reload чистый, `/health` 200.

- **B-2** Уникальность `users.phone` на уровне БД.
  - Модель `db/models/user.py`: `phone` → `unique=True, index=True` (было без ограничения).
  - Миграция `d6e7f8a9b0c1_unique_user_phone.py`: гард — если есть дубли телефонов, миграция ОСТАНАВЛИВАЕТСЯ с сообщением и НЕ удаляет записи; иначе `CREATE UNIQUE INDEX ix_users_phone`.
  - Почему устранено: устраняет TOCTOU-гонку (две одновременные регистрации с одним телефоном проходили проверку в коде и создавали 2 аккаунта); теперь второй INSERT отклоняется БД.
  - Проверка: локально дублей нет (12 юзеров) → миграция прошла; unique-индекс создан; попытка вставить дубль телефона → `duplicate key ... ix_users_phone` (в откаченной транзакции, данные не изменены).
  - ⚠️ **Перед деплоем на прод** проверить дубли: `SELECT phone, COUNT(*) FROM users GROUP BY phone HAVING COUNT(*)>1;` — если есть, миграция намеренно упадёт (устранить вручную, записи не удаляются автоматически).

---

## Финальный review — 2026-07-14 (регрессии в собственных изменениях устранены)

Полный прогон тестов выявил 3 регрессии, внесённые предыдущими этапами; все исправлены (только тестовый слой + dialect-фолбэк, боевое поведение не менялось):
1. **`nextval` на SQLite** (Stage 3): тестовая БД — SQLite, где sequence нет → падал `test_orders.py`. Фикс: `_next_order_number` сделан dialect-aware (Postgres → `nextval`; иначе → `MAX+1`). Прод-гарантия race-free сохранена.
2. **Тесты обмена под старый soft-mode** (Stage 1 fail-closed): 5 тестов (`test_commerceml_orders.py` ×3, `test_media_exchange.py` ×2) гоняли обмен без кред. Фикс: autouse-фикстура `_authorize_exchange` (monkeypatch `_is_authorized→True`) — авторизация покрыта отдельно в `test_exchange_auth.py`. Плюс `test_is_authorized_soft_mode_when_no_creds` переписан в `test_is_authorized_fail_closed_when_no_creds` (ожидает `False`).
3. **Rate-limit исчерпывался в тестах** (Stage 1): 13 order-POST в `test_orders.py` > лимита 10 → 429. Фикс: autouse `_no_rate_limit` (monkeypatch `rate_limit→no-op`) — тот же паттерн, что уже был в `test_auth_customer.py`.

Итог: **162 теста зелёные**. Миграции: единый линейный head `d6e7f8a9b0c1`, downgrade→upgrade цикл проходит, конфликтов нет. Лишних импортов/мёртвого кода в изменённых файлах нет (`func` удалён из `orders.py`, остальные импорты используются).
