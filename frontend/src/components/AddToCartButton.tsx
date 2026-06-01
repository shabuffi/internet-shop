"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";
import type { Product } from "@/types/product";

export default function AddToCartButton({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  if (!product.is_active || product.stock === 0) {
    return <button className="btn" disabled>Нет в наличии</button>;
  }

  function handleClick() {
    addItem({
      id: product.id,
      name: product.name,
      article: product.article,
      price: product.price,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <button className="btn" onClick={handleClick}>
      {added ? "✓ Добавлено" : "Добавить в корзину"}
    </button>
  );
}
