/** Форматирует цену в рублях: 8900 → "8 900 ₽", 24.9 → "24,9 ₽". */
export function formatPrice(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽";
}
