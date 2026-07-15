FROM node:26-alpine

WORKDIR /app

# Сначала копируем только package.json — Docker кеширует установку зависимостей
COPY package.json package-lock.json* ./
RUN npm install

# Копируем остальной код
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
