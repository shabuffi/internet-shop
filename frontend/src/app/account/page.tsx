"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getMe, logoutUser, getMyOrders, changePassword, CUSTOMER_TYPE_LABEL,
  type UserProfile, type OrderHistory,
} from "@/lib/authApi";
import { formatPrice, formatMsk, cleanProductName } from "@/lib/format";
import PasswordField from "@/components/PasswordField";

// Надёжность пароля — совпадает с бэкендом (validate_password_strength).
function passwordIssue(p: string): string | null {
  if (p.length < 8) return "Пароль не короче 8 символов";
  if (/[а-яё]/i.test(p)) return "Пароль только латиницей — переключите раскладку";
  if (!/[a-z]/.test(p)) return "Нужна строчная латинская буква";
  if (!/[A-Z]/.test(p)) return "Нужна заглавная латинская буква";
  if (!/\d/.test(p)) return "Нужна цифра";
  return null;
}

// Статусы для покупателя. МойСклад не возвращает статусы исполнения обратно на сайт
// (обмен заказами — односторонний, вверх), поэтому «new» показываем как «Принят»
// (заказ получен), а не как техническое «Новый». «cancelled» ставит админ.
const BUYER_ORDER_STATUS: Record<string, string> = {
  new: "Принят",
  confirmed: "Подтверждён",
  shipped: "Отгружен",
  delivered: "Доставлен",
  cancelled: "Отменён",
};


export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<OrderHistory[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe().then((u) => {
      if (!u) { router.replace("/login"); return; }
      setUser(u);
      setLoading(false);
      getMyOrders().then(setOrders);
    });
  }, [router]);

  async function handleLogout() {
    await logoutUser();
    router.replace("/login");
    router.refresh();
  }

  if (loading || !user) {
    return <div className="container" style={{ padding: "var(--s-8) var(--s-4)", color: "var(--charcoal)" }}>Загрузка…</div>;
  }

  // Новый аккаунт ждёт активации сотрудником ТД — доступа к ЛК пока нет.
  if (!user.is_active) {
    return (
      <div className="container" style={{ maxWidth: 520, margin: "0 auto", padding: "var(--s-12) var(--s-4)", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-h1)", margin: "0 0 var(--s-3)" }}>
          Ожидайте активации учётной записи
        </h1>
        <p style={{ color: "var(--charcoal)", lineHeight: 1.6, margin: "0 0 var(--s-6)" }}>
          Спасибо за регистрацию! Ваш аккаунт проверяет сотрудник ТД «Инженер». После активации
          вы получите доступ к личному кабинету и персональным ценам. Обычно это занимает
          немного времени.
        </p>
        <button type="button" className="btn btn--ghost" onClick={handleLogout}>Выйти</button>
      </div>
    );
  }

  // Персональную скидку/наценку не показываем: клиент просто видит свои цены в каталоге
  // (процент не совпадает с бытовым понятием «скидка», поэтому не выводим цифру вовсе).
  // Контакты (без наименования — оно в шапке; без типа — он чипом).
  const infoItems: [string, string][] = [
    ["Email", user.email],
    ["Телефон", user.phone],
    ...(user.inn ? [["ИНН", user.inn] as [string, string]] : []),
  ];

  const chip = (accent = false): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", fontSize: "var(--t-sm)", fontWeight: 600,
    padding: "4px 12px", borderRadius: 999,
    background: accent ? "var(--accent-soft, #e7edff)" : "var(--surface, #f5f6f8)",
    color: accent ? "var(--accent, #003399)" : "var(--charcoal)",
  });
  const sectionTitle: React.CSSProperties = {
    fontFamily: "var(--font-display)", fontSize: "var(--t-h3)", margin: "var(--s-8) 0 var(--s-4)",
  };

  return (
    <div className="container" style={{ maxWidth: 680, margin: "0 auto", padding: "var(--s-8) var(--s-4)" }}>
      {/* Шапка: приветствие + чипы + выход */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--s-4)", marginBottom: "var(--s-6)" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--t-sm)", color: "var(--charcoal)", marginBottom: 4 }}>Личный кабинет</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-h1)", margin: 0, lineHeight: 1.1, wordBreak: "break-word" }}>
            {user.customer_name}
          </h1>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <span style={chip()}>{CUSTOMER_TYPE_LABEL[user.customer_type] ?? user.customer_type}</span>
          </div>
        </div>
        <button type="button" className="btn btn--ghost" onClick={handleLogout} style={{ flexShrink: 0 }}>Выйти</button>
      </div>

      {/* Профиль — контакты сеткой */}
      <h2 style={{ ...sectionTitle, marginTop: 0 }}>Профиль</h2>
      <div style={{ background: "var(--paper)", border: "1px solid var(--hairline, #eee)", borderRadius: "var(--r-xl)", padding: "var(--s-6)", boxShadow: "var(--shadow-1)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--s-5)" }}>
          {infoItems.map(([k, v]) => (
            <div key={k} style={{ minWidth: 0 }}>
              <div style={{ fontSize: "var(--t-xs)", color: "var(--charcoal)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>{k}</div>
              <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Безопасность */}
      <h2 style={sectionTitle}>Безопасность</h2>
      <ChangePasswordForm />

      {/* Заказы */}
      <h2 style={sectionTitle}>История заказов</h2>
      {orders === null ? (
        <p style={{ color: "var(--charcoal)", fontSize: "var(--t-sm)" }}>Загрузка…</p>
      ) : orders.length === 0 ? (
        <div style={{ background: "var(--paper)", border: "1px dashed var(--hairline, #ddd)", borderRadius: "var(--r-xl)",
          padding: "var(--s-8)", textAlign: "center", color: "var(--charcoal)" }}>
          <p style={{ margin: "0 0 var(--s-4)", fontSize: "var(--t-sm)" }}>У вас пока нет заказов.</p>
          <Link href="/catalog" className="btn btn--primary">Перейти в каталог</Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </div>
  );
}

// Смена пароля в ЛК: сворачиваемая форма (текущий + новый, с глазиком и проверкой надёжности).
function ChangePasswordForm() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const issue = nw ? passwordIssue(nw) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const problem = passwordIssue(nw);
    if (problem) { setMsg({ ok: false, text: problem }); return; }
    setSaving(true);
    try {
      await changePassword({ current_password: cur, new_password: nw });
      setMsg({ ok: true, text: "Пароль изменён" });
      setCur(""); setNw("");
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Не удалось изменить пароль" });
    } finally { setSaving(false); }
  }

  return (
    <div style={{ marginTop: "var(--s-6)" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="link"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
          color: "var(--primary, #003399)", fontSize: "var(--t-sm)", fontWeight: 600 }}>
        {open ? "Скрыть смену пароля" : "Сменить пароль"}
      </button>

      {open && (
        <form onSubmit={submit}
          style={{ marginTop: "var(--s-4)", background: "var(--paper)", border: "1px solid var(--hairline, #eee)",
            borderRadius: "var(--r-xl)", padding: "var(--s-6)", boxShadow: "var(--shadow-1)", maxWidth: 420 }}>
          <div className="field" style={{ marginBottom: "var(--s-3)" }}>
            <label>Текущий пароль <span className="req">*</span></label>
            <PasswordField required value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="field" style={{ marginBottom: "var(--s-4)" }}>
            <label>Новый пароль <span className="req">*</span></label>
            <PasswordField required value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" />
            <p style={{ margin: "var(--s-1) 0 0", fontSize: "var(--t-xs)",
              color: issue ? "var(--accent-2, #E02424)" : "var(--graphite)" }}>
              {nw ? (issue ?? "✓ Надёжный пароль") : "Латиница, не короче 8 символов: строчная и заглавная буквы и цифра"}
            </p>
          </div>

          {msg && (
            <p style={{ marginBottom: "var(--s-3)", fontSize: "var(--t-sm)", fontWeight: 600,
              color: msg.ok ? "var(--stock, #16794a)" : "var(--accent-2, #E02424)" }}>
              {msg.ok ? "✓ " : ""}{msg.text}
            </p>
          )}

          <button type="submit" className="btn btn--primary" disabled={saving || !cur || !nw}>
            {saving ? "Сохраняем…" : "Изменить пароль"}
          </button>
        </form>
      )}
    </div>
  );
}

// Карточка заказа с компактной историей: длинный список позиций сворачивается.
function OrderCard({ order }: { order: OrderHistory }) {
  // Список товаров скрыт по умолчанию — карточка компактная (номер/дата/статус/сумма),
  // позиции раскрываются по клику.
  const [open, setOpen] = useState(false);
  const count = order.items.length;

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--hairline, #eee)", borderRadius: "var(--r-xl)", padding: "var(--s-5)", boxShadow: "var(--shadow-1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--s-3)", marginBottom: "var(--s-3)" }}>
        <span style={{ fontWeight: 700 }}>{order.number}</span>
        <span style={{ fontSize: "var(--t-sm)", color: "var(--charcoal)" }}>{formatMsk(order.created_at)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--s-3)" }}>
        <span style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: order.status === "cancelled" ? "var(--charcoal)" : "var(--primary, #003399)", background: "var(--surface, #f5f6f8)", padding: "2px 10px", borderRadius: 999 }}>
          {/* Статус из МойСклад (фактический) приоритетнее нашего внутреннего */}
          {order.moysklad_status || BUYER_ORDER_STATUS[order.status] || order.status}
        </span>
        <span style={{ fontWeight: 700 }}>{formatPrice(order.total_amount)}</span>
      </div>

      {/* Раскрывашка списка товаров */}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ marginTop: "var(--s-3)", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: "var(--s-3)", background: "none", border: "none", borderTop: "1px solid var(--hairline, #f0f0f0)",
          padding: "var(--s-3) 0 0", cursor: "pointer", color: "var(--primary, #003399)", fontSize: "var(--t-sm)", fontWeight: 600 }}>
        <span>{open ? "Скрыть товары" : `Показать товары (${count})`}</span>
        <span style={{ display: "inline-flex", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
      </button>

      {open && (
        <ul style={{ listStyle: "none", margin: "var(--s-3) 0 0", padding: 0, fontSize: "var(--t-sm)", color: "var(--ink)" }}>
          {order.items.map((it, i) => (
            <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", padding: "var(--s-1) 0", borderTop: i ? "1px solid var(--hairline, #f0f0f0)" : "none" }}>
              <span style={{ minWidth: 0 }}>{cleanProductName(it.product_name)}</span>
              <span style={{ whiteSpace: "nowrap", color: "var(--charcoal)" }}>
                {it.quantity} × {formatPrice(it.price)} =
                <b style={{ color: "var(--ink)", marginLeft: 4 }}>{formatPrice(Number(it.price) * it.quantity)}</b>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
