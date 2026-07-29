"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";
import QtyField from "@/components/QtyField";
import ProductPrice from "@/components/ProductPrice";
import StockWarningHint from "@/components/StockWarningHint";
import { IconMinus, IconPlus } from "@/components/icons";
import { minOrderQty } from "@/lib/format";
import type { Product } from "@/types/product";

/** Блок покупки на карточке товара (PDP): степпер количества + кнопка «В корзину».
 *  Кратность (партия N) из «Минимального количества для заказа»: шаг/минимум = N. */
export default function AddToCartButton({ product }: { product: Product }) {
  const { addItem, items } = useCart();
  const step = minOrderQty(product.attributes) ?? 1;
  const [qty, setQty] = useState(step);
  const [added, setAdded] = useState(false);
  const outOfStock = !product.is_active || !product.available;
  const inCart = items.find((i) => i.id === product.id)?.quantity ?? 0;
  // Подсказка о заказе сверх остатка. Считаем ИТОГ: что уже лежит в корзине + что набрано
  // в степпере (кнопка добавляет к имеющемуся) — иначе при полной корзине и маленьком
  // значении степпера предупреждение не показывалось бы.
  const overStock = product.available && product.stock > 0 && inCart + qty > product.stock;

  const setQtyRounded = (n: number) => setQty(Math.max(step, Math.round(n / step) * step));

  function handleAdd() {
    for (let i = 0; i < qty; i++) {
      addItem({ id: product.id, name: product.name, article: product.article, price: product.price,
        chestnyZnak: product.chestnyZnak, stock: product.stock });
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div>
      {/* Цена и значок-предупреждение — в одной строке (значок рядом с ценой, не под ней). */}
      <div className="pdp__price" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <ProductPrice p={product} priceClassName="" />
        <StockWarningHint over={overStock} />
      </div>
      <div className="pdp__buy">
        <div className="qty">
          <button onClick={() => setQty((q) => Math.max(step, q - step))} disabled={qty <= step || outOfStock} aria-label="Меньше"><IconMinus /></button>
          <QtyField value={qty} min={step} onCommit={setQtyRounded} disabled={outOfStock} />
          <button onClick={() => setQty((q) => q + step)} disabled={outOfStock} aria-label="Больше"><IconPlus /></button>
        </div>
        <button className="btn btn--primary btn--lg" style={{ flex: 1 }} disabled={outOfStock} onClick={handleAdd}>
          {outOfStock ? "Нет в наличии" : added ? "✓ Добавлено" : inCart > 0 ? "Добавить ещё" : "В корзину"}
        </button>
      </div>
      {step > 1 && (
        <p style={{ margin: "var(--s-3) 0 0", fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--accent)" }}>
          Продаётся кратно {step} шт. — добавляется партиями по {step}.
        </p>
      )}
      {inCart > 0 && (
        <p style={{ margin: "var(--s-2) 0 0", fontSize: "var(--t-sm)", fontWeight: 700, color: "var(--stock, #16794a)" }}>
          ✓ В корзине: {inCart} шт
        </p>
      )}
    </div>
  );
}
