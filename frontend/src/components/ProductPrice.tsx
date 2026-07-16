import { formatPrice } from "@/lib/format";
import type { Product } from "@/types/product";

/** Единый показ цены во всех местах витрины (каталог, главная, промо-страницы, карточка):
 *  текущая цена — основная и заметная; старая — зачёркнутая рядом, если пришла готовой к показу
 *  (backend отдаёт old_price только когда её нужно показывать). Нет старой — только текущая. */
export default function ProductPrice({
  p,
  className = "",
  // Класс текущей цены. По умолчанию витринный `.price`; карточка товара передаёт "",
  // чтобы цена унаследовала свой крупный размер от `.pdp__price`.
  priceClassName = "price",
}: {
  p: Product;
  className?: string;
  priceClassName?: string;
}) {
  const hasPrice = Number(p.price) > 0;
  const oldPrice = p.old_price && Number(p.old_price) > Number(p.price) ? p.old_price : null;
  return (
    <span className={`price-box ${className}`.trim()}>
      <span className={priceClassName}>{hasPrice ? formatPrice(p.price) : "—"}</span>
      {oldPrice && <span className="price price--old">{formatPrice(oldPrice)}</span>}
    </span>
  );
}
