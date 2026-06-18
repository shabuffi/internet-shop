"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/format";
import { IconImage, IconCart } from "@/components/icons";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, totalAmount, clearCart } = useCart();
  const [form, setForm] = useState({ customer_first_name: "", customer_last_name: "", customer_phone: "", customer_email: "", delivery_address: "", comment: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="container">
        <div className="empty">
          <div className="empty__icon"><IconCart width="1em" height="1em" /></div>
          <h3>Корзина пуста</h3>
          <p>Сначала добавьте товары из каталога.</p>
          <Link href="/catalog" className="btn btn--primary">В каталог</Link>
        </div>
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
          customer_name: `${form.customer_first_name} ${form.customer_last_name}`.trim(),
          customer_phone: form.customer_phone,
          customer_email: form.customer_email,
          delivery_address: form.delivery_address,
          comment: form.comment,
          items: items.map((i) => ({ product_id: i.id, quantity: i.quantity })),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        // 409 — не хватает остатка: detail = { message, items: [{ name, available }] }
        if (res.status === 409 && d.detail?.items) {
          const list = d.detail.items
            .map((i: { name: string; available: number }) => `${i.name} (в наличии: ${i.available})`)
            .join(", ");
          throw new Error(`Недостаточно товара на складе: ${list}`);
        }
        throw new Error(typeof d.detail === "string" ? d.detail : "Ошибка оформления заказа");
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
    <div className="container section" style={{ paddingTop: "var(--s-8)" }}>
      <div className="breadcrumb" style={{ padding: 0, marginBottom: "var(--s-5)" }}>
        <Link href="/cart">Корзина</Link><span>›</span><span style={{ color: "var(--charcoal)" }}>Оформление</span>
      </div>
      <h1 className="section-title">Оформление заказа</h1>

      <form onSubmit={handleSubmit} className="checkout">
        <div>
          <div className="checkout__section">
            <h3><span className="checkout__num">1</span>Контактные данные</h3>
            <div className="formgrid">
              <div className="field">
                <label>Имя <span className="req">*</span></label>
                <input className="input" name="customer_first_name" value={form.customer_first_name} onChange={handleChange} required placeholder="Анна" />
              </div>
              <div className="field">
                <label>Фамилия <span className="req">*</span></label>
                <input className="input" name="customer_last_name" value={form.customer_last_name} onChange={handleChange} required placeholder="Иванова" />
              </div>
              <div className="field">
                <label>Телефон <span className="req">*</span></label>
                <input className="input" name="customer_phone" value={form.customer_phone} onChange={handleChange} required type="tel" placeholder="+7 999 000-00-00" />
              </div>
              <div className="field span2">
                <label>Email</label>
                <input className="input" name="customer_email" value={form.customer_email} onChange={handleChange} type="email" placeholder="anna@mail.ru" />
              </div>
            </div>
          </div>

          <div className="checkout__section">
            <h3><span className="checkout__num">2</span>Доставка</h3>
            <div className="formgrid">
              <div className="field span2">
                <label>Адрес</label>
                <input className="input" name="delivery_address" value={form.delivery_address} onChange={handleChange} placeholder="Город, улица, дом, квартира" />
              </div>
              <div className="field span2">
                <label>Комментарий к заказу</label>
                <textarea className="textarea" name="comment" value={form.comment} onChange={handleChange} placeholder="Код домофона, пожелания по доставке…" />
              </div>
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}
        </div>

        <aside className="osummary">
          <h3 style={{ margin: "0 0 var(--s-5)", fontSize: "var(--t-h3)", fontWeight: 600 }}>Ваш заказ</h3>
          <div className="osummary__items">
            {items.map((it) => (
              <div className="osummary__item" key={it.id}>
                <div className="photo" style={{ position: "relative" }}>
                  <span className="photo__ph" style={{ position: "absolute", inset: 0, fontSize: 20 }}><IconImage /></span>
                  <img src={`/api/v1/products/${it.id}/image`} alt={it.name} style={{ position: "relative", zIndex: 1 }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                </div>
                <div><div className="nm">{it.name}</div><div className="qt">{it.quantity} шт{it.article ? ` · ${it.article}` : ""}</div></div>
                <div className="pr">{formatPrice(Number(it.price) * it.quantity)}</div>
              </div>
            ))}
          </div>
          <div className="summary__row"><span>Товары</span><b>{formatPrice(totalAmount)}</b></div>
          <div className="summary__row"><span>Доставка</span><b>Бесплатно</b></div>
          <div className="summary__total"><span>К оплате</span><b>{formatPrice(totalAmount)}</b></div>
          <button className="btn btn--cta btn--lg btn--block" type="submit" disabled={loading} style={{ marginTop: "var(--s-4)" }}>
            {loading ? "Оформляем…" : "Подтвердить заказ"}
          </button>
          <p className="fine" style={{ textAlign: "center", marginTop: "var(--s-3)" }}>Нажимая кнопку, вы соглашаетесь с условиями оферты</p>
        </aside>
      </form>
    </div>
  );
}
