"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";
import QtyField from "@/components/QtyField";
import type { Product } from "@/types/product";

/** Кнопка «В корзину» для карточки каталога с выбором количества (− n +). */
export default function AddToCartCard({ product }: { product: Product }) {
  const { items, setItemQuantity } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const outOfStock = !product.is_active || !product.available;

  if (outOfStock) {
    return <button className="btn btn--sm btn--outline btn--block" disabled>Нет в наличии</button>;
  }

  function handleAdd() {
    const existing = items.find((i) => i.id === product.id)?.quantity ?? 0;
    setItemQuantity(
      { id: product.id, name: product.name, article: product.article, price: product.price,
        chestnyZnak: product.chestnyZnak },
      existing + qty,
    );
    setAdded(true);
    setQty(1);
    setTimeout(() => setAdded(false), 1300);
  }

  const inCart = items.find((i) => i.id === product.id)?.quantity ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
      {inCart > 0 && (
        <span style={{ alignSelf: "flex-end", fontSize: 12, fontWeight: 700, color: "var(--stock, #16794a)" }}>
          ✓ В корзине: {inCart} шт
        </span>
      )}
      <div className="qty qty--sm" style={{ alignSelf: "flex-end" }}>
        <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Меньше">−</button>
        <QtyField value={qty} onCommit={setQty} />
        <button onClick={() => setQty((q) => q + 1)} aria-label="Больше">+</button>
      </div>
      <button className="btn btn--sm btn--primary btn--block" onClick={handleAdd}>
        {added ? "✓ Добавлено" : inCart > 0 ? "Добавить ещё" : "В корзину"}
      </button>
    </div>
  );
}
