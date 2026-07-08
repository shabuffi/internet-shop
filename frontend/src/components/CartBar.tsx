"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/format";

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/** Липкая панель корзины снизу (бланк заказа). Показывается в любом режиме каталога,
 *  пока в корзине есть товары. Резервирует отступ снизу, чтобы не перекрывать контент. */
export default function CartBar() {
  const { items, totalItems, totalAmount } = useCart();
  const positions = items.length;

  // Резервируем место под липкую панель в самом футере (он синий) — чтобы панель
  // не перекрывала нижнюю строку футера и НЕ возникало белой полосы под ним.
  useEffect(() => {
    const f = document.querySelector(".footer") as HTMLElement | null;
    if (f) f.style.paddingBottom = totalItems > 0 ? "76px" : "";
    return () => { if (f) f.style.paddingBottom = ""; };
  }, [totalItems]);

  if (totalItems === 0) return null;
  return (
    <div className="cartbar">
      <div className="cartbar__inner">
        <div className="cartbar__info">
          Выбрано <b>{positions}</b> {plural(positions, "позиция", "позиции", "позиций")}
          {" · "}<b>{totalItems}</b> {plural(totalItems, "штука", "штуки", "штук")}
          {" · "}<b>{formatPrice(totalAmount)}</b>
        </div>
        <Link href="/cart" className="cartbar__btn">Оформить →</Link>
      </div>
    </div>
  );
}
