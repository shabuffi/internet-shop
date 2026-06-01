"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";

export default function CartIcon() {
  const { totalItems } = useCart();

  return (
    <Link href="/cart" className="cart-icon">
      🛒
      {totalItems > 0 && (
        <span className="cart-badge">{totalItems}</span>
      )}
    </Link>
  );
}
