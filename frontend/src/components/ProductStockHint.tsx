"use client";

import { useCart } from "@/context/CartContext";
import StockWarningHint from "@/components/StockWarningHint";
import type { Product } from "@/types/product";

/**
 * Обёртка подсказки для карточек каталога (серверные компоненты не имеют доступа к корзине).
 * Количество берём из корзины: степпер каталога (`AddToCartCard`) кладёт товар сразу в корзину,
 * поэтому «в корзине» = «выбранное количество». Подсказка загорается, когда оно > остатка.
 */
export default function ProductStockHint({ product }: { product: Product }) {
  const { items } = useCart();
  const qty = items.find((i) => i.id === product.id)?.quantity ?? 0;
  const over = product.available && product.stock > 0 && qty > product.stock;
  return <StockWarningHint over={over} />;
}
