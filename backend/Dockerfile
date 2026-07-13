FROM python:3.12-slim

WORKDIR /app

# Устанавливаем зависимости отдельным слоем — Docker кешируeт этот шаг
# и не перекачивает библиотеки при каждом изменении кода
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Dev/test зависимости (pytest) — чтобы `make test` работал в контейнере
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt

# Копируем код приложения
COPY . .

# Запуск под непривилегированным пользователем (uid 1000) — чтобы возможный RCE
# в backend не давал root ни в контейнере, ни на хосте (инцидент 13.07.2026).
# Код /app остаётся root:root и только читается; писать нужно лишь в /app/media
# (том media_data) — его владельца меняем на appuser на хосте при деплое.
RUN useradd -u 1000 -m appuser \
    && mkdir -p /app/media \
    && chown appuser:appuser /app/media
USER appuser

EXPOSE 8000
