/** Убирает код склада в начале названия товара: «с2 Швабра…» → «Швабра…».
 *  МойСклад в этом каталоге шлёт префикс «с1/с2/с3/с4 » (кириллическая «с»). */
export function cleanProductName(name: string): string {
  const out = name.replace(/^[сcСC]\s?\d+[.\s]+\s*/u, "").trim();
  return out || name;
}

/** Убирает числовой код-префикс в начале названия категории:
 *  «00001.00. Лето» → «Лето», «001.10.01 Перчатки…» → «Перчатки…».
 *  Требуем точку в коде, чтобы не срезать настоящие названия вроде «100 мелочей». */
export function cleanCategoryName(name: string): string {
  const out = name.replace(/^\d[\d.]*\.[\d.]*\s+/u, "").trim();
  return out || name;
}

/** Форматирует цену в рублях: 8900 → "8 900 ₽", 24.9 → "24,9 ₽". */
export function formatPrice(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽";
}

/** Дата-время по Москве. Бэкенд отдаёт наивный UTC (без зоны) — добавляем «Z»,
 *  затем форматируем в Europe/Moscow, чтобы не зависеть от зоны сервера/браузера. */
export function formatMsk(iso: string | null | undefined): string {
  if (!iso) return "—";
  const hasTz = iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso);
  const d = new Date(hasTz ? iso : iso + "Z");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
}
