"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/format";
import { MIN_ORDER_AMOUNT } from "@/lib/site";
import { IconImage, IconCart } from "@/components/icons";
import ChestnyZnakBadge from "@/components/ChestnyZnakBadge";
import QtyField from "@/components/QtyField";

export default function CartPage() {
  const { items, totalItems, totalAmount, removeItem, updateQuantity, clearCart } = useCart();
  const belowMin = totalAmount < MIN_ORDER_AMOUNT;

  if (items.length === 0) {
    return (
      <div className="container">
        <div className="empty">
          <div className="empty__icon"><IconCart width="1em" height="1em" /></div>
          <h3>В корзине пока пусто</h3>
          <p>Загляните в каталог — там есть на что посмотреть.</p>
          <Link href="/catalog" className="btn btn--primary">Перейти в каталог</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container section" style={{ paddingTop: "var(--s-8)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--s-4)", flexWrap: "wrap" }}>
        <h1 className="section-title" style={{ marginBottom: 0 }}>
          Корзина <span style={{ color: "var(--graphite)", fontWeight: 400 }}>· {totalItems}</span>
        </h1>
        <button className="linkbtn" onClick={() => { if (confirm("Очистить корзину?")) clearCart(); }}>
          Очистить корзину
        </button>
      </div>
      <div style={{ height: "var(--s-6)" }} />

      <div className="cart">
        <div className="cart__list">
          {items.map((item) => (
            <div className="lineitem" key={item.id}>
              <Link href={`/products/${item.id}`} className="lineitem__media">
                <div className="photo" style={{ position: "relative" }}>
                  <span className="photo__ph" style={{ position: "absolute", inset: 0, fontSize: 22 }}><IconImage /></span>
                  <img src={`/api/v1/products/${item.id}/image`} alt={item.name}
                    style={{ position: "relative", zIndex: 1 }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                </div>
              </Link>

              <div>
                <div className="lineitem__name" style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {item.chestnyZnak && <ChestnyZnakBadge size={14} />}
                  {item.name}
                </div>
                {item.article && <div className="lineitem__sku">Арт. {item.article}</div>}
                <div className="lineitem__controls">
                  <div className="qty qty--sm">
                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1} aria-label="Меньше">−</button>
                    <QtyField value={item.quantity} onCommit={(n) => updateQuantity(item.id, n)} />
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
          {belowMin && (
            <p className="form-error" style={{ marginTop: "var(--s-4)" }}>
              Минимальная сумма заказа — {formatPrice(MIN_ORDER_AMOUNT)}.
              Добавьте товаров ещё на {formatPrice(MIN_ORDER_AMOUNT - totalAmount)}.
            </p>
          )}
          {belowMin ? (
            <button className="btn btn--cta btn--lg btn--block" disabled style={{ marginTop: "var(--s-4)" }}>
              Оформить заказ
            </button>
          ) : (
            <Link href="/checkout" className="btn btn--cta btn--lg btn--block" style={{ marginTop: "var(--s-4)" }}>
              Оформить заказ
            </Link>
          )}
          <Link href="/catalog" className="btn btn--ghost btn--block" style={{ marginTop: "var(--s-3)", justifyContent: "center" }}>
            Продолжить покупки
          </Link>
        </aside>
      </div>
    </div>
  );
}
