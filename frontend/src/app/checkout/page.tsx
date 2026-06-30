"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/format";
import { MIN_ORDER_AMOUNT } from "@/lib/site";
import { IconImage, IconCart } from "@/components/icons";
import ChestnyZnakBadge from "@/components/ChestnyZnakBadge";
import { getMe, type UserProfile } from "@/lib/authApi";

const DELIVERY = [
  { value: "pickup", label: "Самовывоз", hint: "забрать со склада" },
  { value: "shop_transport", label: "Доставка транспортом ООО «Инженер»", hint: "по областям доставки" },
  { value: "tk", label: "Транспортной компанией", hint: "до терминала ТК" },
] as const;

export default function CheckoutPage() {
  const router = useRouter();
  const { items, totalAmount, clearCart } = useCart();
  const belowMin = totalAmount < MIN_ORDER_AMOUNT;
  const [user, setUser] = useState<UserProfile | null>(null);
  const [form, setForm] = useState({ customer_name: "", customer_phone: "", customer_email: "", delivery_address: "", comment: "" });
  const [delivery, setDelivery] = useState<string>("pickup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getMe().then(setUser); }, []);

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

  const needAddress = delivery !== "pickup";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Из кабинета данные заказчика берёт сервер из профиля; гость присылает свои.
      const contact = user
        ? { customer_name: user.customer_name, customer_phone: user.phone, customer_email: user.email }
        : { customer_name: form.customer_name, customer_phone: form.customer_phone, customer_email: form.customer_email };
      const res = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          ...contact,
          delivery_method: delivery,
          delivery_address: needAddress ? form.delivery_address : null,
          comment: form.comment,
          items: items.map((i) => ({ product_id: i.id, quantity: i.quantity })),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
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
            <h3><span className="checkout__num">1</span>Заказчик</h3>
            {user ? (
              <div style={{ background: "var(--cloud)", borderRadius: "var(--r-md)", padding: "var(--s-4)", fontSize: "var(--t-sm)" }}>
                Оформляется из личного кабинета: <b>{user.customer_name}</b>, {user.phone}
                {user.inn ? `, ИНН ${user.inn}` : ""}.{" "}
                <Link href="/account" className="link">Изменить данные</Link>
              </div>
            ) : (
              <>
                <div className="formgrid">
                  <div className="field span2">
                    <label>Наименование заказчика <span className="req">*</span></label>
                    <input className="input" name="customer_name" value={form.customer_name} onChange={handleChange} required placeholder="ФИО или организация" />
                  </div>
                  <div className="field">
                    <label>Телефон <span className="req">*</span></label>
                    <input className="input" name="customer_phone" value={form.customer_phone} onChange={handleChange} required type="tel" placeholder="+7 999 000-00-00" />
                  </div>
                  <div className="field">
                    <label>Email</label>
                    <input className="input" name="customer_email" value={form.customer_email} onChange={handleChange} type="email" placeholder="mail@example.ru" />
                  </div>
                </div>
                <p style={{ fontSize: "var(--t-sm)", color: "var(--charcoal)", marginTop: "var(--s-3)" }}>
                  Есть аккаунт? <Link href="/login" className="link">Войдите</Link> — данные и ваша цена подтянутся автоматически.
                </p>
              </>
            )}
          </div>

          <div className="checkout__section">
            <h3><span className="checkout__num">2</span>Способ получения</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
              {DELIVERY.map((d) => (
                <label key={d.value} style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", padding: "var(--s-3) var(--s-4)",
                  border: `1.5px solid ${delivery === d.value ? "var(--accent)" : "var(--hairline)"}`, borderRadius: "var(--r-md)",
                  cursor: "pointer", background: delivery === d.value ? "var(--accent-soft)" : "var(--paper)" }}>
                  <input type="radio" name="delivery_method" value={d.value} checked={delivery === d.value}
                    onChange={() => setDelivery(d.value)} style={{ flex: "none" }} />
                  <span><b>{d.label}</b> <span style={{ color: "var(--charcoal)", fontSize: "var(--t-sm)" }}>— {d.hint}</span></span>
                </label>
              ))}
            </div>

            {needAddress && (
              <div className="formgrid" style={{ marginTop: "var(--s-4)" }}>
                <div className="field span2">
                  <label>Адрес доставки {delivery === "tk" ? "(город, терминал ТК)" : ""}</label>
                  <input className="input" name="delivery_address" value={form.delivery_address} onChange={handleChange} placeholder="Город, улица, дом" />
                </div>
              </div>
            )}
            <div className="formgrid" style={{ marginTop: "var(--s-3)" }}>
              <div className="field span2">
                <label>Комментарий к заказу</label>
                <textarea className="textarea" name="comment" value={form.comment} onChange={handleChange} placeholder="Пожелания по отгрузке…" />
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
                <div><div className="nm" style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>{it.chestnyZnak && <ChestnyZnakBadge size={13} />}{it.name}</div><div className="qt">{it.quantity} шт{it.article ? ` · ${it.article}` : ""}</div></div>
                <div className="pr">{formatPrice(Number(it.price) * it.quantity)}</div>
              </div>
            ))}
          </div>
          <div className="summary__row"><span>Товары</span><b>{formatPrice(totalAmount)}</b></div>
          <div className="summary__total"><span>К оплате</span><b>{formatPrice(totalAmount)}</b></div>
          {belowMin && (
            <p className="form-error" style={{ marginTop: "var(--s-4)" }}>
              Минимальная сумма заказа — {formatPrice(MIN_ORDER_AMOUNT)}.
              Добавьте товаров ещё на {formatPrice(MIN_ORDER_AMOUNT - totalAmount)}.
            </p>
          )}
          <button className="btn btn--cta btn--lg btn--block" type="submit" disabled={loading || belowMin} style={{ marginTop: "var(--s-4)" }}>
            {loading ? "Оформляем…" : "Подтвердить заказ"}
          </button>
          <p className="fine" style={{ textAlign: "center", marginTop: "var(--s-3)" }}>Нажимая кнопку, вы соглашаетесь с условиями оферты</p>
        </aside>
      </form>
    </div>
  );
}
