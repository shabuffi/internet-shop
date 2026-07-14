"use client";

import { useCart } from "@/context/CartContext";
import QtyField from "@/components/QtyField";
import { IconMinus, IconPlus } from "@/components/icons";
import { minOrderQty } from "@/lib/format";
import type { Product } from "@/types/product";

/** Степпер количества на карточке каталога: 0 по умолчанию, «−/+» и ввод сразу меняют
 *  количество в корзине (как в «бланке заказа»). Если задано «Минимальное количество
 *  для заказа» (N > 1) — товар кладётся партиями: «+» добавляет N, шаг N, минимум N. */
export default function AddToCartCard({ product }: { product: Product }) {
  const { items, setItemQuantity } = useCart();
  const step = minOrderQty(product.attributes) ?? 1;   // размер партии (шаг/минимум)
  const qty = items.find((i) => i.id === product.id)?.quantity ?? 0;
  const outOfStock = !product.is_active || !product.available;

  if (outOfStock) {
    return <button className="btn btn--sm btn--outline btn--block" disabled>Нет в наличии</button>;
  }

  const item = {
    id: product.id, name: product.name, article: product.article,
    price: product.price, chestnyZnak: product.chestnyZnak,
  };
  // Приводим к кратному партии (минимум — одна партия); 0 или меньше — убираем из корзины.
  const commit = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) { setItemQuantity(item, 0); return; }
    setItemQuantity(item, Math.max(step, Math.round(n / step) * step));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "stretch" }}>
      <div className="qty qty--sm" style={{ width: "100%", justifyContent: "space-between" }}>
        <button type="button" onClick={() => commit(qty - step)} disabled={qty <= 0} aria-label="Меньше"><IconMinus /></button>
        <QtyField value={qty} min={0} onCommit={commit} />
        <button type="button" onClick={() => commit(qty === 0 ? step : qty + step)} aria-label="Больше"><IconPlus /></button>
      </div>
      {/* Слот подписи резервируем всегда (даже пустой) — чтобы цена/количество в соседних
          карточках были на одном уровне. */}
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", textAlign: "center", minHeight: 15, lineHeight: "15px" }}>
        {step > 1 ? `кратно ${step} шт.` : " "}
      </span>
    </div>
  );
}
