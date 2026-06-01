"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";

export default function CartPage() {
  const { items, totalAmount, removeItem, updateQuantity } = useCart();

  if (items.length === 0) {
    return (
      <div className="catalog-page">
        <h1 className="catalog-title">Корзина</h1>
        <p className="empty">Корзина пуста</p>
        <Link href="/" className="btn" style={{ display: "inline-block", marginTop: "1rem" }}>
          Перейти в каталог
        </Link>
      </div>
    );
  }

  return (
    <div className="catalog-page">
      <h1 className="catalog-title">Корзина</h1>

      <div className="cart-list">
        {items.map((item) => (
          <div key={item.id} className="cart-item">
            <div className="cart-item-info">
              <p className="product-name">{item.name}</p>
              {item.article && <p className="product-article">Арт. {item.article}</p>}
              <p className="product-price">{Number(item.price).toFixed(2)} ₽</p>
            </div>

            <div className="cart-item-controls">
              <button className="qty-btn" onClick={() => updateQuantity(item.id, item.quantity - 1)}>−</button>
              <span className="qty-value">{item.quantity}</span>
              <button className="qty-btn" onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
              <button className="remove-btn" onClick={() => removeItem(item.id)}>✕</button>
            </div>

            <p className="cart-item-subtotal">
              {(Number(item.price) * item.quantity).toFixed(2)} ₽
            </p>
          </div>
        ))}
      </div>

      <div className="cart-footer">
        <p className="cart-total">Итого: <strong>{totalAmount.toFixed(2)} ₽</strong></p>
        <Link href="/checkout" className="btn">Оформить заказ</Link>
      </div>
    </div>
  );
}
