/** «Честный знак»: товары с обязательной госмаркировкой помечены префиксом «ЧЗ»
 *  в начале названия. Проверяем по СЫРОМУ имени (до очистки). */
export function isChestnyZnak(name: string): boolean {
  return /^\s*ЧЗ([\s.:\-]|$)/iu.test(name);
}

/** Убирает технический префикс «ЧЗ» и код склада «с1/с2 …» (кириллическая «с»)
 *  в начале названия товара: «ЧЗ с2 Швабра…» → «Швабра…».
 *  Префикс «ЧЗ» показывается отдельным бейджем (см. isChestnyZnak). */
export function cleanProductName(name: string): string {
  const out = name
    .replace(/^\s*ЧЗ[\s.:\-]+\s*/iu, "")
    .replace(/^[сcСC]\s?\d+[.\s]+\s*/u, "")
    .trim();
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
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₽";
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

// Как называем поле для покупателя (доп. поле МойСклад «Минимальная единица отгрузки»).
export const MIN_ORDER_QTY_LABEL = "Минимальное количество для заказа";

/** Значение поля «Минимальное количество для заказа» из характеристик товара
 *  (доп. поле МойСклад). Число, если задано, иначе null. */
export function minOrderQty(attributes?: { name: string; value: string }[] | null): number | null {
  if (!attributes) return null;
  const a = attributes.find((x) => /минимальн.*(единиц.*отгрузк|количеств)/iu.test(x.name || ""));
  if (!a) return null;
  const n = parseInt(String(a.value).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Текст значения для показа: «N шт.» если задано, иначе «—». */
export function minOrderQtyText(attributes?: { name: string; value: string }[] | null): string {
  const n = minOrderQty(attributes);
  return n ? `${n} шт.` : "—";
}
