"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";
import type { Product } from "@/types/product";

/** Блок покупки на карточке товара (PDP): степпер количества + кнопка «В корзину». */
export default function AddToCartButton({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const outOfStock = !product.is_active || !product.available;

  function handleAdd() {
    for (let i = 0; i < qty; i++) {
      addItem({ id: product.id, name: product.name, article: product.article, price: product.price,
        chestnyZnak: product.chestnyZnak });
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div className="pdp__buy">
      <div className="qty">
        <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1 || outOfStock} aria-label="Меньше">−</button>
        <input type="text" inputMode="numeric" value={qty} disabled={outOfStock} aria-label="Количество"
          onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); setQty(Number.isNaN(n) ? 1 : Math.max(1, Math.min(9999, n))); }}
          onFocus={(e) => e.target.select()} />
        <button onClick={() => setQty((q) => q + 1)} disabled={outOfStock} aria-label="Больше">+</button>
      </div>
      <button className="btn btn--primary btn--lg" style={{ flex: 1 }} disabled={outOfStock} onClick={handleAdd}>
        {outOfStock ? "Нет в наличии" : added ? "✓ Добавлено" : "В корзину"}
      </button>
    </div>
  );
}
