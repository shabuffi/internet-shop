"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/format";

export default function CartPage() {
  const { items, totalItems, totalAmount, removeItem, updateQuantity } = useCart();

  if (items.length === 0) {
    return (
      <div className="container">
        <div className="empty">
          <div className="empty__icon">🛒</div>
          <h3>В корзине пока пусто</h3>
          <p>Загляните в каталог — там есть на что посмотреть.</p>
          <Link href="/" className="btn btn--primary">Перейти в каталог</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container section" style={{ paddingTop: "var(--s-8)" }}>
      <h1 className="section-title">
        Корзина <span style={{ color: "var(--graphite)", fontWeight: 400 }}>· {totalItems}</span>
      </h1>

      <div className="cart">
        <div className="cart__list">
          {items.map((item) => (
            <div className="lineitem" key={item.id}>
              <Link href={`/products/${item.id}`} className="lineitem__media">
                <div className="photo" style={{ position: "relative" }}>
                  <span className="photo__ph" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>🛍</span>
                  <img src={`/api/v1/products/${item.id}/image`} alt={item.name}
                    style={{ position: "relative", zIndex: 1 }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                </div>
              </Link>

              <div>
                <div className="lineitem__name">{item.name}</div>
                {item.article && <div className="lineitem__sku">Арт. {item.article}</div>}
                <div className="lineitem__controls">
                  <div className="qty qty--sm">
                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1} aria-label="Меньше">−</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)} aria-label="Больше">+</button>
                  </div>
                  <button className="linkbtn" onClick={() => removeItem(item.id)}>Удалить</button>
                </div>
              </div>

              <div className="lineitem__right">
                <div className="lineitem__price">{formatPrice(Number(item.price) * item.quantity)}</div>
              </div>
            </div>
          ))}
        </div>

        <aside className="summary">
          <h3>Итого</h3>
          <div className="summary__row"><span>Товары ({totalItems})</span><b>{formatPrice(totalAmount)}</b></div>
          <div className="summary__row"><span>Доставка</span><b>Бесплатно</b></div>
          <div className="summary__total"><span>К оплате</span><b>{formatPrice(totalAmount)}</b></div>
          <Link href="/checkout" className="btn btn--primary btn--lg btn--block" style={{ marginTop: "var(--s-4)" }}>
            Оформить заказ
          </Link>
          <Link href="/" className="btn btn--ghost btn--block" style={{ marginTop: "var(--s-3)", justifyContent: "center" }}>
            Продолжить покупки
          </Link>
        </aside>
      </div>
    </div>
  );
}
