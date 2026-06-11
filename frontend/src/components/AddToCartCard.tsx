"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";
import type { Product } from "@/types/product";

/** Маленькая кнопка «В корзину» для карточки в каталоге (добавляет 1 шт). */
export default function AddToCartCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const outOfStock = !product.is_active || !product.available;

  if (outOfStock) {
    return <button className="btn btn--sm btn--outline btn--block" disabled>Нет в наличии</button>;
  }

  function handleAdd() {
    addItem({ id: product.id, name: product.name, article: product.article, price: product.price });
    setAdded(true);
    setTimeout(() => setAdded(false), 1300);
  }

  return (
    <button className="btn btn--sm btn--primary btn--block" onClick={handleAdd}>
      {added ? "✓ В корзине" : "В корзину"}
    </button>
  );
}
