FROM python:3.14-slim

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

EXPOSE 8000
