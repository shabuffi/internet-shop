import type { Product } from "@/types/product";

/** Бейдж на карточке товара по флагам МойСклад. Приоритет: убойные цены → спецпредложение →
 *  новинка (если стоят несколько — показываем самый «сильный»). Ничего, если флагов нет. */
export default function FeaturedBadge({ product }: { product: Product }) {
  const kind = product.is_hot ? "hot" : product.is_sale ? "sale" : product.is_new ? "new" : null;
  if (!kind) return null;
  const label = kind === "hot" ? "🔥" : kind === "sale" ? "%" : "NEW";
  const aria = kind === "hot" ? "Убойные цены" : kind === "sale" ? "Спецпредложение" : "Новинка";
  return <span className={`pcard__promo pcard__promo--${kind}`} aria-label={aria}>{label}</span>;
}
