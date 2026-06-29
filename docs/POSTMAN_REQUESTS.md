# Postman запросы для API

## 🔍 Основные запросы к товарам

### Получить все товары
```
GET http://155.212.144.63/api/v1/products
```

**Параметры:**
- `page` - номер страницы (по умолчанию 1)
- `page_size` - количество товаров на странице (по умолчанию 20)
- `q` - поиск по названию

**Пример с параметрами:**
```
GET http://155.212.144.63/api/v1/products?page=1&page_size=10
```

**Ответ:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Товар 1",
      "price": 100.00,
      "stock": 50,
      "description": "Описание",
      "moysklad_id": "ms-id",
      "code": "SKU123",
      "article": "ART001"
    }
  ],
  "total": 42,
  "page": 1,
  "page_size": 20,
  "pages": 3
}
```

---

### Получить товар по ID
```
GET http://155.212.144.63/api/v1/products/{product_id}
```

**Пример:**
```
GET http://155.212.144.63/api/v1/products/550e8400-e29b-41d4-a716-446655440000
```

---

### Получить категории
```
GET http://155.212.144.63/api/v1/products/categories
```

**Ответ:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Категория 1",
      "description": "Описание категории"
    }
  ],
  "total": 5
}
```

---

### Поиск товаров
```
GET http://155.212.144.63/api/v1/products?q=название
```

---

## 📦 МойСклад интеграция

### Проверка аутентификации
```
GET http://155.212.144.63/api/v1/1c/exchange?mode=checkauth
```

**Ответ (если успешно):**
```
success
```

---

### Инициализация обмена
```
GET http://155.212.144.63/api/v1/1c/exchange?mode=init
```

**Ответ:**
```
zip=no
file_limit=10485760
```

---

### Загрузка каталога (import.xml)
```
POST http://155.212.144.63/api/v1/1c/exchange?mode=file&filename=import.xml
```

**Body:** XML файл (отправить как файл)

---

### Загрузка предложений (offers.xml)
```
POST http://155.212.144.63/api/v1/1c/exchange?mode=file&filename=offers.xml
```

**Body:** XML файл (отправить как файл)

---

### Импорт каталога
```
GET http://155.212.144.63/api/v1/1c/exchange?mode=import&filename=import.xml
```

---

### Импорт предложений
```
GET http://155.212.144.63/api/v1/1c/exchange?mode=import&filename=offers.xml
```

---

## 🛒 Заказы

### Создать заказ
```
POST http://155.212.144.63/api/v1/orders
```

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "customer_name": "Иван Иванов",
  "customer_email": "ivan@example.com",
  "customer_phone": "+7 900 123 45 67",
  "items": [
    {
      "product_id": "550e8400-e29b-41d4-a716-446655440000",
      "quantity": 2,
      "price": 100.00
    },
    {
      "product_id": "550e8400-e29b-41d4-a716-446655440001",
      "quantity": 1,
      "price": 250.00
    }
  ],
  "total": 450.00,
  "notes": "Срочный заказ"
}
```

**Ответ:**
```json
{
  "id": "uuid",
  "order_number": "ORD-001",
  "status": "pending",
  "created_at": "2026-06-04T23:50:00",
  "total": 450.00
}
```

---

### Получить все заказы
```
GET http://155.212.144.63/api/v1/orders
```

---

### Получить заказ по ID
```
GET http://155.212.144.63/api/v1/orders/{order_id}
```

---

## 📊 Admin endpoints

### Информация о магазине
```
GET http://155.212.144.63/api/v1/admin/store-info
```

**Ответ:**
```json
{
  "name": "Мой магазин",
  "description": "Описание",
  "total_products": 42,
  "total_orders": 15,
  "revenue": 5000.00
}
```

---

### Dashboard (требует аутентификации)
```
GET http://155.212.144.63/api/v1/admin/dashboard
```

**Headers:**
```
Authorization: Bearer {token}
```

---

### Проверить авторизацию
```
GET http://155.212.144.63/api/v1/admin/me
```

**Headers:**
```
Authorization: Bearer {token}
```

**Ответ (если не авторизован):**
```json
{
  "detail": "Unauthorized"
}
```

---

## ✅ Коды ответов

| Код | Значение |
|-----|----------|
| 200 | Успешно |
| 201 | Создано |
| 400 | Ошибка валидации |
| 401 | Не авторизован |
| 404 | Не найдено |
| 500 | Ошибка сервера |

---

## 🚀 Быстрый тест

Скопируй в Postman и запусти по порядку:

1. **Проверь API:**
   ```
   GET http://155.212.144.63/api/v1/products
   ```

2. **Проверь МойСклад:**
   ```
   GET http://155.212.144.63/api/v1/1c/exchange?mode=checkauth
   ```

3. **Получи категории:**
   ```
   GET http://155.212.144.63/api/v1/products/categories
   ```

4. **Получи информацию о магазине:**
   ```
   GET http://155.212.144.63/api/v1/admin/store-info
   ```

Все должны вернуть `200 OK`.
