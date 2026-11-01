FROM python:3.12-slim

WORKDIR /app

# Не больше 2 malloc-арен glibc на процесс. По умолчанию каждый поток threadpool FastAPI
# получает свою арену, и освобождённая память в них не возвращается системе: замер на
# реальных фото — копии картинок (Pillow) в 40 потоках раздували процесс до ~1 GB и
# держали; с MALLOC_ARENA_MAX=2 — ~120 MB (пик ~175 MB). Лимит backend на проде 1 GB.
ENV MALLOC_ARENA_MAX=2

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
