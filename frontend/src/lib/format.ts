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
