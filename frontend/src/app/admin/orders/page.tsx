"use client";

import { Fragment, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { adminFetch } from "@/lib/adminApi";
import { formatMsk, formatPrice, cleanProductName } from "@/lib/format";
import { useIsMobile } from "@/lib/useIsMobile";

interface AdminOrderItem { product_name: string; product_article: string | null; price: string; quantity: number; }
interface AdminOrder { id: string; number: string; status: string; moysklad_status: string | null; customer_name: string; customer_phone: string; user_id: string | null; is_guest: boolean; total_amount: string; exported_at: string | null; created_at: string; items_count: number; items: AdminOrderItem[]; }

// Статус заказа ведётся в МойСклад — на сайте только показываем (не меняем).
// Внутренние коды (если статус МС ещё не пришёл) переводим в подписи.
const STATUS_LABEL: Record<string, string> = { new: "Новый", cancelled: "Отменён", confirmed: "Подтверждён", shipped: "Отправлен", delivered: "Доставлен" };

const pill = (color: string, bg: string): React.CSSProperties => ({
  display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
  color, background: bg, whiteSpace: "nowrap",
});

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  // Фильтр «история одного покупателя»: гость — по телефону. null → обычный постраничный список.
  const [phoneFilter, setPhoneFilter] = useState<string | null>(null);
  // Раскрытый заказ (показываем состав — что именно заказывали)
  const [openId, setOpenId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  function load() {
    const qs = phoneFilter ? `?phone=${encodeURIComponent(phoneFilter)}` : "";
    adminFetch<{ items: AdminOrder[]; total: number }>(`/orders${qs}`)
      .then(d => { setOrders(d.items); setTotal(d.total); }).catch(() => {});
  }
  useEffect(() => { load(); }, [phoneFilter]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Общие элементы (переиспользуются в таблице и в мобильных карточках).
  // Статус — ТОЛЬКО показ (на сайте не меняется): приоритет статусу из МойСклад,
  // иначе внутренний. Отменённый — красным.
  const statusView = (o: AdminOrder) => {
    const label = o.moysklad_status || STATUS_LABEL[o.status] || o.status;
    const cancelled = o.status === "cancelled";
    return (
      <span title={o.moysklad_status ? "Статус из МойСклад" : "Статус заказа"}
        style={pill(cancelled ? "var(--critical, #c0392b)" : "var(--accent, #003399)",
          cancelled ? "var(--accent-2-soft, #fbeaeb)" : "var(--accent-soft, #e7edff)")}>
        {label}
      </span>
    );
  };
  const phoneBtn = (o: AdminOrder) => (
    <button type="button" onClick={() => setPhoneFilter(o.customer_phone)} title="Показать все заказы этого телефона"
      style={{ padding: 0, border: "none", background: "none", cursor: "pointer",
        color: "var(--accent, #003399)", fontSize: 14, textDecoration: "underline", textUnderlineOffset: 2 }}>
      {o.customer_phone}
    </button>
  );
  const guestPill = (o: AdminOrder) => (o.is_guest
    ? <span style={pill("var(--ink-secondary)", "var(--surface, #f0f1f3)")} title="Заказ без регистрации">Гость</span>
    : <span style={pill("var(--accent, #003399)", "var(--accent-soft, #e7edff)")} title="Заказ зарегистрированного покупателя">Клиент</span>);
  const exportBadge = (o: AdminOrder) => (o.exported_at
    ? <span style={{ color: "var(--success)", fontSize: 12 }} title="Выгружен в МойСклад">✓ Выгружен</span>
    : <span style={{ color: "var(--ink-tertiary)", fontSize: 12 }} title="МойСклад заберёт заказ при следующем обмене">Ожидает</span>);

  // Кнопка-раскрывашка числа позиций (что именно заказывали)
  const itemsToggle = (o: AdminOrder) => (
    <button type="button" onClick={() => setOpenId(id => id === o.id ? null : o.id)}
      title="Показать состав заказа"
      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 0, border: "none", background: "none",
        cursor: "pointer", color: "var(--accent, #003399)", fontSize: 14, fontWeight: 600 }}>
      {o.items_count}
      <span style={{ display: "inline-flex", transform: openId === o.id ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </span>
    </button>
  );
  // Список позиций заказа: чистое имя (без служебных префиксов) + «кол-во × цена = сумма»
  const itemsBlock = (o: AdminOrder) => (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 13 }}>
      {o.items.map((it, i) => (
        <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0",
          borderTop: i ? "1px solid var(--hairline-soft)" : "none" }}>
          <span style={{ minWidth: 0 }}>
            {cleanProductName(it.product_name)}
            {it.product_article && <span style={{ color: "var(--ink-tertiary)" }}> · арт. {it.product_article}</span>}
          </span>
          <span style={{ whiteSpace: "nowrap", color: "var(--ink-secondary)" }}>
            {it.quantity} × {formatPrice(it.price)} =
            <b style={{ color: "var(--ink)", marginLeft: 4 }}>{formatPrice(Number(it.price) * it.quantity)}</b>
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Заказы</h1>
        <span style={{ fontSize: 14, color: "var(--ink-secondary)" }}>{total} всего</span>
        {error && <span style={{ fontSize: 13, color: "var(--critical)" }}>{error}</span>}
      </div>

      {phoneFilter && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "10px 14px",
          background: "var(--accent-2-soft, #fdeaea)", borderRadius: 10, border: "1px solid var(--hairline-soft)" }}>
          <span style={{ fontSize: 14 }}>
            История покупателя по телефону <b style={{ fontFamily: "ui-monospace, monospace" }}>{phoneFilter}</b> — {total} заказ(ов)
          </span>
          <button type="button" onClick={() => setPhoneFilter(null)}
            style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
              border: "1px solid var(--hairline-soft)", background: "var(--canvas)", color: "var(--ink)" }}>
            Показать все
          </button>
        </div>
      )}

      {orders.length === 0 ? (
        <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)" }}>
          <p style={{ padding: 32, color: "var(--ink-secondary)", textAlign: "center" }}>Заказов пока нет</p>
        </div>
      ) : isMobile ? (
        /* Мобильный вид — карточки вместо горизонтального скролла таблицы */
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {orders.map(o => (
            <div key={o.id} style={{ background: "var(--canvas)", border: "1px solid var(--hairline-soft)", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{o.number}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    <span>{o.customer_name}</span>{guestPill(o)}
                  </div>
                </div>
                <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{Number(o.total_amount).toFixed(2)} ₽</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 13, color: "var(--ink-secondary)", marginBottom: 12, alignItems: "center" }}>
                {phoneBtn(o)}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Позиций: {itemsToggle(o)}</span>
                <span>{formatMsk(o.created_at)}</span>
                {exportBadge(o)}
              </div>
              {openId === o.id && (
                <div style={{ borderTop: "1px solid var(--hairline-soft)", paddingTop: 10, marginBottom: 12 }}>{itemsBlock(o)}</div>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderTop: "1px solid var(--hairline-soft)", paddingTop: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--ink-tertiary)" }}>Статус</span>
                {statusView(o)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                {["Номер", "Клиент", "Телефон", "Позиций", "Сумма", "Статус", "Выгрузка", "Дата"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "var(--ink-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <Fragment key={o.id}>
                  <tr style={{ borderBottom: openId === o.id ? "none" : "1px solid var(--hairline-soft)" }}>
                    <td style={{ padding: "14px 16px", fontWeight: 600, whiteSpace: "nowrap" }}>{o.number}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span>{o.customer_name}</span>{guestPill(o)}
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px" }}>{phoneBtn(o)}</td>
                    <td style={{ padding: "14px 16px" }}>{itemsToggle(o)}</td>
                    <td style={{ padding: "14px 16px", fontWeight: 600, whiteSpace: "nowrap" }}>{Number(o.total_amount).toFixed(2)} ₽</td>
                    <td style={{ padding: "14px 16px" }}>{statusView(o)}</td>
                    <td style={{ padding: "14px 16px", fontSize: 12 }}>{exportBadge(o)}</td>
                    <td style={{ padding: "14px 16px", color: "var(--ink-secondary)", whiteSpace: "nowrap" }}>{formatMsk(o.created_at)}</td>
                  </tr>
                  {openId === o.id && (
                    <tr style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                      <td colSpan={8} style={{ padding: "0 16px 14px", background: "var(--surface, #fafafa)" }}>
                        <div style={{ fontSize: 12, color: "var(--ink-tertiary)", padding: "10px 0 6px" }}>Что заказывали:</div>
                        {itemsBlock(o)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
