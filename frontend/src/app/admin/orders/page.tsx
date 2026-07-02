"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { adminFetch } from "@/lib/adminApi";
import { formatMsk } from "@/lib/format";

interface AdminOrder { id: string; number: string; status: string; customer_name: string; customer_phone: string; user_id: string | null; is_guest: boolean; total_amount: string; exported_at: string | null; created_at: string; items_count: number; }

// Заказы ведутся в МойСклад; на сайте оставляем только «Новый» и «Отменён».
// (остальные метки — для отображения возможных старых значений)
const STATUS_LABEL: Record<string, string> = { new: "Новый", cancelled: "Отменён", confirmed: "Подтверждён", shipped: "Отправлен", delivered: "Доставлен" };
const STATUS_ORDER = ["new", "cancelled"];
const STATUS_COLOR: Record<string, string> = { new: "var(--primary)", cancelled: "var(--critical)", confirmed: "var(--ink)", shipped: "var(--ink)", delivered: "var(--success)" };

const pill = (color: string, bg: string): React.CSSProperties => ({
  display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
  color, background: bg, whiteSpace: "nowrap",
});

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Фильтр «история одного покупателя»: гость — по телефону. null → обычный постраничный список.
  const [phoneFilter, setPhoneFilter] = useState<string | null>(null);

  function load() {
    const qs = phoneFilter ? `?phone=${encodeURIComponent(phoneFilter)}` : "";
    adminFetch<{ items: AdminOrder[]; total: number }>(`/orders${qs}`)
      .then(d => { setOrders(d.items); setTotal(d.total); }).catch(() => {});
  }
  useEffect(() => { load(); }, [phoneFilter]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStatusChange(orderId: string, status: string) {
    setError("");
    setSavingId(orderId);
    // оптимистично обновляем UI; при ошибке перечитываем с сервера (источник правды)
    setOrders(os => os.map(o => o.id === orderId ? { ...o, status } : o));
    try {
      await adminFetch(`/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сменить статус");
      load();
    } finally {
      setSavingId(null);
    }
  }

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

      <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", overflowX: "auto" }}>
        {orders.length === 0 ? (
          <p style={{ padding: 32, color: "var(--ink-secondary)", textAlign: "center" }}>Заказов пока нет</p>
        ) : (
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
                <tr key={o.id} style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                  <td style={{ padding: "14px 16px", fontWeight: 600, whiteSpace: "nowrap" }}>{o.number}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span>{o.customer_name}</span>
                      {o.is_guest
                        ? <span style={pill("var(--ink-secondary)", "var(--surface, #f0f1f3)")} title="Заказ без регистрации">Гость</span>
                        : <span style={pill("var(--accent, #003399)", "var(--accent-soft, #e7edff)")} title="Заказ зарегистрированного покупателя">Клиент</span>}
                    </div>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <button type="button" onClick={() => setPhoneFilter(o.customer_phone)}
                      title="Показать все заказы этого телефона"
                      style={{ padding: 0, border: "none", background: "none", cursor: "pointer",
                        color: "var(--accent, #003399)", fontSize: 14, textDecoration: "underline", textUnderlineOffset: 2 }}>
                      {o.customer_phone}
                    </button>
                  </td>
                  <td style={{ padding: "14px 16px" }}>{o.items_count}</td>
                  <td style={{ padding: "14px 16px", fontWeight: 600, whiteSpace: "nowrap" }}>{Number(o.total_amount).toFixed(2)} ₽</td>
                  <td style={{ padding: "14px 16px" }}>
                    <select
                      value={o.status}
                      aria-label={`Статус заказа ${o.number}`}
                      disabled={savingId === o.id}
                      onChange={e => handleStatusChange(o.id, e.target.value)}
                      style={{
                        fontSize: 13, fontWeight: 600, padding: "6px 10px", borderRadius: 8,
                        border: "1px solid var(--hairline-soft)", background: "var(--canvas)",
                        color: STATUS_COLOR[o.status] ?? "var(--ink)", cursor: "pointer",
                        opacity: savingId === o.id ? 0.5 : 1,
                      }}
                    >
                      {(STATUS_ORDER.includes(o.status) ? STATUS_ORDER : [o.status, ...STATUS_ORDER]).map(s => (
                        <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 12 }}>
                    {o.exported_at ? (
                      <span style={{ color: "var(--success)" }} title="Выгружен в МойСклад">✓ Выгружен</span>
                    ) : (
                      <span style={{ color: "var(--ink-tertiary)" }} title="МойСклад заберёт заказ при следующем обмене">Ожидает</span>
                    )}
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--ink-secondary)", whiteSpace: "nowrap" }}>
                    {formatMsk(o.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
