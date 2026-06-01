"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/context/CartContext";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, totalAmount, clearCart } = useCart();

  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    delivery_address: "",
    comment: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="catalog-page">
        <p className="empty">Корзина пуста</p>
        <Link href="/" className="btn" style={{ display: "inline-block", marginTop: "1rem" }}>
          В каталог
        </Link>
      </div>
    );
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          items: items.map((i) => ({ product_id: i.id, quantity: i.quantity })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Ошибка при оформлении заказа");
      }

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
    <div className="catalog-page">
      <Link href="/cart" className="back-link">← Назад в корзину</Link>
      <h1 className="catalog-title">Оформление заказа</h1>

      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={handleSubmit}>
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

          <div className="form-group">
            <label className="form-label">Комментарий</label>
            <textarea className="form-input" name="comment" value={form.comment}
              onChange={handleChange} rows={3} placeholder="Пожелания к заказу" />
          </div>

          {error && <p className="form-error">{error}</p>}

          <button className="btn" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Оформляем..." : `Оформить заказ — ${totalAmount.toFixed(2)} ₽`}
          </button>
        </form>

        <div className="checkout-summary">
          <h2 className="summary-title">Ваш заказ</h2>
          {items.map((item) => (
            <div key={item.id} className="summary-item">
              <span>{item.name} × {item.quantity}</span>
              <span>{(Number(item.price) * item.quantity).toFixed(2)} ₽</span>
            </div>
          ))}
          <div className="summary-total">
            <strong>Итого</strong>
            <strong>{totalAmount.toFixed(2)} ₽</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
