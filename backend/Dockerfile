FROM python:3.12-slim

WORKDIR /app

# Устанавливаем зависимости отдельным слоем — Docker кешируeт этот шаг
# и не перекачивает библиотеки при каждом изменении кода
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код приложения
COPY . .

EXPOSE 8000
