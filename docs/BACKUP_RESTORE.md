# Бэкап на Яндекс Диск и восстановление

Каждую ночь (03:30 МСК) сервер отправляет на Яндекс Диск, в **зашифрованную** папку `td-engineer-backup`:

| Что | Где на диске (внутри шифрования) | Сколько хранится |
|---|---|---|
| База (товары, заказы, покупатели, настройки) | `db/shop_<дата>.dump` | 30 дней |
| `.env.prod` (все ключи и пароли сайта) | `config/env.prod` (+ `config/old/`) | текущий + прежние |
| Фото товаров (оригиналы) | `media/` | всё; удалённые — 30 дней в `media-old/` |

Код не бэкапится — он на GitHub. Копии фото «для сайта» (`_v/`) не бэкапятся — их заново делает prewarm.

Скрипт — `scripts/offsite-backup.sh`, расписание — `scripts/systemd/offsite-backup.timer`.
На Яндекс Диске файлы видны с зашифрованными именами — это нормально: прочитать их можно только через rclone с паролем.

> ⚠️ **Пароль шифрования — единственный ключ к бэкапу.** Без него восстановиться невозможно.
> Храните его в менеджере паролей (не только на сервере — сервер может пропасть, как в ноябре 2026).

## Объём

Фото ~9 ГБ и растут. Бесплатного места на Яндекс Диске на это не хватит — нужен тариф Яндекс 360 со 100+ ГБ.

Пока места нет, фото не бэкапятся: на сервере `/etc/default/offsite-backup` содержит `BACKUP_MEDIA=0`.
После покупки места — поменять на `BACKUP_MEDIA=1` (первый прогон фото — несколько часов).

## Разовая настройка (делает владелец, ~10 минут)

Токен Яндекса и пароль шифрования видит только владелец: всё делается в его терминале на Mac.

1. Установить rclone: `brew install rclone`
2. Подключить Яндекс Диск (откроется браузер — войти в Яндекс и разрешить доступ):
   `rclone config create yadisk yandex`
3. Создать зашифрованную папку поверх него: `rclone config` и ответить:
   - `n` (новый remote) → имя `yacrypt`
   - тип: `crypt`
   - remote: `yadisk:td-engineer-backup`
   - filename_encryption: `standard` (Enter), directory_name_encryption: `true` (Enter)
   - password: `y` → ввести **свой пароль** дважды (сохранить в менеджер паролей!)
   - password2 (соль): `n` — без неё (меньше секретов, которые нельзя потерять)
   - advanced config: `n` → `y` (сохранить) → `q` (выйти)
4. Проверка: `rclone mkdir yacrypt:test && rclone lsd yacrypt:` (видна папка `test`), затем `rclone rmdir yacrypt:test`
5. Отправить настройки на сервер:
   `scp ~/.config/rclone/rclone.conf root@<IP сервера>:/root/.config/rclone/rclone.conf`

После этого сервер бэкапит сам. Проверить: `ssh root@<IP> 'cat /var/lib/offsite-backup/last_ok; journalctl -u offsite-backup -n 20 --no-pager'`.

## Восстановление на новом сервере

1. Новый сервер (Ubuntu 24.04), Docker, `git clone` репозитория в `/opt/internet-shop`.
2. `apt install rclone`, положить тот же `rclone.conf` в `/root/.config/rclone/` (он же есть на Mac владельца).
3. Настройки: `rclone copyto yacrypt:config/env.prod /opt/internet-shop/.env.prod && chmod 600 /opt/internet-shop/.env.prod`
4. База: поднять только БД, залить свежий дамп:
   ```
   cd /opt/internet-shop
   C="docker compose --env-file .env.prod -f docker-compose.prod.yml"
   $C up -d db
   rclone lsl yacrypt:db/                      # выбрать последний дамп
   rclone copyto yacrypt:db/shop_<дата>.dump /tmp/shop.dump
   $C exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < /tmp/shop.dump
   ```
5. Фото: создать том и залить:
   ```
   docker volume create --label com.docker.compose.project=internet-shop --label com.docker.compose.volume=media_data internet-shop_media_data
   rclone sync yacrypt:media "$(docker volume inspect -f '{{.Mountpoint}}' internet-shop_media_data)" --transfers 8
   chown -R 1000:1000 "$(docker volume inspect -f '{{.Mountpoint}}' internet-shop_media_data)"
   ```
6. Сертификат HTTPS — выпустить заново (certbot), запустить всё: `$C up -d --build`.
7. Копии фото: `$C run --rm --no-deps -T backend python3 -m app.services.media_variants prewarm` (~30–40 мин; сайт работает и без них).
8. Перевести A-запись домена на новый IP, в МойСклад ничего менять не нужно (адрес сайта тот же).
