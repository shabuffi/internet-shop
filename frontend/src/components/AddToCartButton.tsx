"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";
import type { Product } from "@/types/product";

export default function AddToCartButton({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  if (!product.is_active || product.stock === 0) {
    return <button className="btn btn-buy" disabled>Нет в наличии</button>;
  }

  function handleClick() {
    addItem({ id: product.id, name: product.name, article: product.article, price: product.price });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <button className="btn btn-buy" onClick={handleClick} style={{ width: "100%", justifyContent: "center" }}>
      {added ? "✓ Добавлено в корзину" : "Добавить в корзину"}
    </button>
  );
}
