# 02. Обмен с МойСклад (CommerceML)

Файл: [backend/app/api/v1/endpoints/exchange.py](../backend/app/api/v1/endpoints/exchange.py)

Это самая «протокольная» часть проекта. МойСклад общается с магазином по стандарту
1С/CommerceML — серия HTTP-запросов на один адрес `/api/v1/1c/exchange` в строгом порядке.

## ⭐ Только ОДИН логин/пароль — обмена

Интеграция работает **только через CommerceML**. Пароль/токен от аккаунта МойСклад
**не нужен и не хранится** (REST API убран). Остаётся одна учётка — **обмена**.

### Логин/пароль обмена (двунаправленный)

Это то, чем **МойСклад стучится в наш магазин** — и чтобы залить каталог, и чтобы
забрать заказы. В МойСклад вписывается на экране «Онлайн-торговля → Адрес магазина».
В нашей БД хранится в `ShopSettings` под ключами `exchange_login` / `exchange_password`.

- Можно придумать **любую пару** — главное, чтобы она совпадала в двух местах:
  в МойСклад и в нашей админке.
- Наш сайт сверяет присланное с сохранённым (функция `_basic_auth_ok`).

> Раньше был второй набор — REST-креды аккаунта (`moysklad_login`/`moysklad_password`)
> для картинок и отправки заказов. После перехода на чистый CommerceML он удалён: картинки
> приходят файлами обмена, заказы МойСклад забирает сам.

## Протокол: каталог вниз (`type=catalog`)

МойСклад делает эти запросы один за другим. Все — на `/api/v1/1c/exchange`.

| Шаг | Запрос | Что наш код делает | Ответ |
|-----|--------|--------------------|-------|
| 1 | `GET ?mode=checkauth` | проверяет логин/пароль обмена, выдаёт токен сессии | `success\nsession\n<токен>` |
| 2 | `GET ?mode=init` | сообщает параметры (zip, размер файла) | `zip=no\nfile_limit=10485760` |
| 3 | `POST ?mode=file&filename=import.xml` | кладёт сырой XML каталога в Redis | `success` |
| 4 | `POST ?mode=file&filename=offers.xml` | кладёт сырой XML цен/остатков в Redis | `success` |
| 5 | `POST ?mode=file&filename=<uuid>_imageid.png` | **файл картинки** → медиа-хранилище (том) | `success` |
| 6 | `GET ?mode=import&filename=import.xml` | парсит оба XML, пишет в БД, чистит Redis | `success\nИмпортировано: ...` |

## Протокол: заказы вверх (`type=sale`)

Те же `checkauth`/`init`, затем МойСклад **сам забирает** заказы:

| Запрос | Что наш код делает | Ответ |
|--------|--------------------|-------|
| `GET ?type=sale&mode=query` | отдаёт неэкспортированные заказы CommerceML-XML (`commerceml_orders`) | XML заказов |
| `GET ?type=sale&mode=success` | помечает отданные заказы `exported_at` | `success` |

Подробнее про выгрузку заказов — в [05-заказы.md](05-заказы.md).

Стандарт 1С требует, чтобы ответ на `checkauth` был **ровно три строки**:
`success`, имя куки (`session`), значение куки (токен). Поэтому код возвращает строку
именно в таком формате.

## Как устроена аутентификация в коде

### `checkauth` (шаг 1)

```python
if mode == "checkauth":
    exp_login, exp_pass = _get_exchange_credentials(db)
    if exp_login and exp_pass:
        if not _basic_auth_ok(request, exp_login, exp_pass):
            return "failure\nНеверный логин или пароль обмена"
        token = secrets.token_hex(16)
        redis_client.set(_SESSION_KEY, token, ex=_TTL)   # запоминаем выданный токен
        return f"success\nsession\n{token}"
    # Мягкий режим: пара не задана — пускаем (как раньше)
    return "success\nsession\ncommerceml-session"
```

При успехе генерируется случайный токен `secrets.token_hex(16)`, кладётся в Redis на
час (`_TTL = 3600`), и отдаётся МойСклад. Дальше МойСклад присылает его как куку
`session=<токен>` на каждом следующем шаге.

### Проверка на остальных шагах: `_is_authorized`

```python
def _is_authorized(request, db) -> bool:
    exp_login, exp_pass = _get_exchange_credentials(db)
    if not exp_login or not exp_pass:
        return True                       # ← мягкий режим: креды не заданы → пускаем
    if _basic_auth_ok(request, exp_login, exp_pass):
        return True                       # ← валидный Basic Auth
    cookie = request.cookies.get("session")
    if not cookie:
        return False
    stored = redis_client.get(_SESSION_KEY)
    return bool(stored and secrets.compare_digest(cookie, stored.decode()))  # ← валидная кука
```

Пускаем, если выполнено хотя бы одно:
- креды обмена не заданы (мягкий режим), **или**
- пришёл правильный Basic Auth, **или**
- пришла кука с токеном, который мы сами выдали на checkauth.

`secrets.compare_digest` — сравнение, устойчивое к атакам по времени (не «сливает»
по скорости, какой символ совпал).

### `_basic_auth_ok` — разбор заголовка Authorization

```python
def _basic_auth_ok(request, exp_login, exp_pass) -> bool:
    if not exp_login or not exp_pass:
        return False                       # пустые ожидаемые креды никогда не валидны
    header = request.headers.get("Authorization", "")
    if not header.startswith("Basic "):
        return False
    login, _, password = base64.b64decode(header[6:]).decode().partition(":")
    return (secrets.compare_digest(login, exp_login)
            and secrets.compare_digest(password, exp_pass))
```

Basic Auth — это `base64("логин:пароль")` в заголовке. Раскодировали, разбили по
первому `:`, сравнили обе половины.

## 🛡️ «Мягкий режим» — почему так

Если в админке логин/пароль обмена **не заданы**, проверка пропускает всех (как было
до доработки). Это сделано специально: чтобы доработка безопасности **не сломала уже
работающий обмен**. Как только клиент впишет пару в админку — проверка включается
сама. Минус: пока пара пустая, обмен открыт для всех, кто знает URL. Поэтому задать
пару — обязательный шаг перед боем.

## Состояние обмена живёт в Redis, а не в памяти

Раньше промежуточные данные обмена (токен, сырые XML) лежали в глобальных переменных
процесса. Это ломалось при перезапуске backend и при нескольких воркерах. Теперь всё
в Redis ([core/redis_client.py](../backend/app/core/redis_client.py)):

```python
_SESSION_KEY = "exchange:session_token"        # токен сессии
_FILE_KEY = "exchange:file:{name}"             # сырой import.xml / offers.xml
_TTL = 3600                                     # 1 час — потом ключи сами протухают
```

- Шаг 3-4 (`file`): сырой XML кладётся в Redis. Принимаются **только** имена
  `import.xml` и `offers.xml` (whitelist — чтобы нельзя было засорять Redis любыми ключами).
- Шаг 5 (`import`): достаём `import.xml` из Redis → парсим в каталог → достаём
  `offers.xml` → применяем цены/остатки → `upsert_catalog()` → удаляем ключи.

```python
if mode == "import":
    import_xml = redis_client.get(_file_key("import.xml"))
    if not import_xml:
        return "failure\nНет данных для импорта"
    catalog = parse_import_xml(import_xml)
    offers_xml = redis_client.get(_file_key("offers.xml"))
    if offers_xml:
        parse_offers_xml(offers_xml, catalog)        # дописывает цены/остатки в catalog
    log = upsert_catalog(db, catalog, source="commerceml")
    redis_client.delete(_file_key("import.xml"), _file_key("offers.xml"))
    return f"success\nИмпортировано: {log.products_created} новых, {log.products_updated} обновлено"
```

Важная деталь: парсинг перенесён на шаг `import` (а не на момент приёма файла). Так
endpoint полностью **stateless** — любой воркер на шаге 5 возьмёт данные из общего Redis.

## Нюанс про XML без namespace

МойСклад шлёт CommerceML **без** объявления `xmlns`. Парсер это сам определяет
(`_detect_ns`) и умеет работать и с namespace, и без. Подробно — в [03-импорт-и-каталог.md](03-импорт-и-каталог.md).
