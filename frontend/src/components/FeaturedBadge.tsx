import type { Product } from "@/types/product";

/** Бейдж NEW / % на карточке товара по флагам МойСклад. Приоритет распродажи:
 *  если стоят оба флага — показываем «%» (спецпредложение). Ничего, если флагов нет. */
export default function FeaturedBadge({ product }: { product: Product }) {
  if (!product.is_sale && !product.is_new) return null;
  const sale = !!product.is_sale;
  return (
    <span className={`pcard__promo pcard__promo--${sale ? "sale" : "new"}`}
      aria-label={sale ? "Спецпредложение" : "Новинка"}>
      {sale ? "%" : "NEW"}
    </span>
  );
}
