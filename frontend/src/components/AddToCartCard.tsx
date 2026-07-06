"use client";

import { useCart } from "@/context/CartContext";
import QtyField from "@/components/QtyField";
import type { Product } from "@/types/product";

/** Степпер количества на карточке каталога: 0 по умолчанию, «−/+» и ввод сразу меняют
 *  количество в корзине (как в «бланке заказа»). Отдельной кнопки «В корзину» нет —
 *  плюс добавляет товар в корзину напрямую. */
export default function AddToCartCard({ product }: { product: Product }) {
  const { items, setItemQuantity } = useCart();
  const qty = items.find((i) => i.id === product.id)?.quantity ?? 0;
  const outOfStock = !product.is_active || !product.available;

  if (outOfStock) {
    return <button className="btn btn--sm btn--outline btn--block" disabled>Нет в наличии</button>;
  }

  const item = {
    id: product.id, name: product.name, article: product.article,
    price: product.price, chestnyZnak: product.chestnyZnak,
  };
  const commit = (n: number) =>
    setItemQuantity(item, Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

  return (
    <div className="qty qty--sm" style={{ width: "100%", justifyContent: "space-between" }}>
      <button type="button" onClick={() => commit(qty - 1)} disabled={qty <= 0} aria-label="Меньше">−</button>
      <QtyField value={qty} min={0} onCommit={commit} />
      <button type="button" onClick={() => commit(qty + 1)} aria-label="Больше">+</button>
    </div>
  );
}
