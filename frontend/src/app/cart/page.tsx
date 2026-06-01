"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";

export default function CartPage() {
  const { items, totalAmount, removeItem, updateQuantity } = useCart();

  if (items.length === 0) {
    return (
      <div className="cart-page">
        <div className="container">
          <h1 className="catalog-title" style={{ marginBottom: 40 }}>Корзина</h1>
          <div className="empty-state">
            <div className="empty-state-icon">🛒</div>
            <p className="empty-state-title">Корзина пуста</p>
            <p className="empty-state-body">Добавьте товары из каталога</p>
            <Link href="/" className="btn btn-primary">Перейти в каталог</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <div className="container">
        <h1 className="catalog-title" style={{ marginBottom: 32 }}>Корзина</h1>

        <div className="cart-list">
          {items.map((item) => (
            <div key={item.id} className="cart-item">
              <div className="cart-item-info">
                <p className="product-name">{item.name}</p>
                {item.article && <p className="product-article">Арт. {item.article}</p>}
                <p className="product-price" style={{ fontSize: 15, color: "var(--ink-secondary)" }}>
                  {Number(item.price).toFixed(2)} ₽ × {item.quantity}
                </p>
              </div>

              <div className="cart-item-controls">
                <button className="qty-btn" onClick={() => updateQuantity(item.id, item.quantity - 1)}>−</button>
                <span className="qty-value">{item.quantity}</span>
                <button className="qty-btn" onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <p className="cart-item-subtotal">{(Number(item.price) * item.quantity).toFixed(2)} ₽</p>
                <button className="remove-btn" onClick={() => removeItem(item.id)} title="Удалить">✕</button>
              </div>
            </div>
          ))}
        </div>

        <div className="cart-summary">
          <div>
            <p className="cart-total-label">Итого</p>
            <p className="cart-total-amount">{totalAmount.toFixed(2)} ₽</p>
          </div>
          <Link href="/checkout" className="btn btn-buy" style={{ fontSize: 16, padding: "14px 32px" }}>
            Оформить заказ
          </Link>
        </div>
      </div>
    </div>
  );
}
