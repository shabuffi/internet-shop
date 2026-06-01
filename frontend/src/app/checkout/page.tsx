"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/context/CartContext";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, totalAmount, clearCart } = useCart();
  const [form, setForm] = useState({ customer_name: "", customer_phone: "", customer_email: "", delivery_address: "", comment: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="checkout-page"><div className="container">
        <div className="empty-state">
          <div className="empty-state-icon">🛒</div>
          <p className="empty-state-title">Корзина пуста</p>
          <Link href="/" className="btn btn-primary">В каталог</Link>
        </div>
      </div></div>
    );
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, items: items.map(i => ({ product_id: i.id, quantity: i.quantity })) }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Ошибка"); }
      const order = await res.json();
      clearCart();
      router.push(`/checkout/success?order=${order.number}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Что-то пошло не так");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="checkout-page">
      <div className="container">
        <Link href="/cart" className="back-link">← Корзина</Link>
        <h1 className="catalog-title" style={{ marginBottom: 32 }}>Оформление заказа</h1>

        <div className="checkout-layout">
          <form onSubmit={handleSubmit}>
            <div className="checkout-form-card">
              <p className="form-section-title">Контактные данные</p>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Имя *</label>
                  <input className="form-input" name="customer_name" value={form.customer_name}
                    onChange={handleChange} required placeholder="Ваше имя" />
                </div>
                <div className="form-group">
                  <label className="form-label">Телефон *</label>
                  <input className="form-input" name="customer_phone" value={form.customer_phone}
                    onChange={handleChange} required placeholder="+7 900 000-00-00" type="tel" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" name="customer_email" value={form.customer_email}
                    onChange={handleChange} placeholder="email@example.com" type="email" />
                </div>
                <div className="form-group">
                  <label className="form-label">Адрес доставки</label>
                  <input className="form-input" name="delivery_address" value={form.delivery_address}
                    onChange={handleChange} placeholder="Город, улица, дом, квартира" />
                </div>
                <div className="form-group form-group-full">
                  <label className="form-label">Комментарий</label>
                  <textarea className="form-input" name="comment" value={form.comment}
                    onChange={handleChange} rows={3} placeholder="Пожелания к заказу" />
                </div>
              </div>
            </div>

            {error && <p className="form-error" style={{ marginTop: 12 }}>{error}</p>}

            <button className="btn btn-buy" type="submit" disabled={loading}
              style={{ width: "100%", marginTop: 20, fontSize: 16, padding: "16px 24px" }}>
              {loading ? "Оформляем..." : `Подтвердить заказ · ${totalAmount.toFixed(2)} ₽`}
            </button>
          </form>

          <div className="order-summary-card">
            <p className="summary-title">Ваш заказ</p>
            {items.map(item => (
              <div key={item.id} className="summary-item">
                <span className="summary-item-name">{item.name} × {item.quantity}</span>
                <span className="summary-item-price">{(Number(item.price) * item.quantity).toFixed(2)} ₽</span>
              </div>
            ))}
            <div className="summary-divider" />
            <div className="summary-total">
              <span>Итого</span>
              <span>{totalAmount.toFixed(2)} ₽</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
