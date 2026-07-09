// Базовый публичный URL сайта — нужен для абсолютных ссылок в SEO/OG (sitemap, og:image).
// Используется только в серверном коде (metadata/sitemap/robots), поэтому обычная env-переменная
// SITE_URL (без NEXT_PUBLIC_). Задать в .env.prod: SITE_URL=https://shop.example.ru (или пока IP).
// Без домена — фолбэк на localhost; OG-превью полноценно заработают после установки домена.
export const SITE_URL = (process.env.SITE_URL || "http://localhost").replace(/\/+$/, "");
export const SITE_NAME = "ТД «ИНЖЕНЕР»";
export const SITE_DESCRIPTION = "Оптовый интернет-магазин товаров для дома, дачи и семьи.";

// Минимальная сумма заказа (руб). Должна совпадать с MIN_ORDER_AMOUNT на бэкенде (config.py).
export const MIN_ORDER_AMOUNT = 5000;
