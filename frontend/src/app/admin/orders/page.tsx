"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { adminFetch } from "@/lib/adminApi";

interface AdminOrder { id: string; number: string; status: string; customer_name: string; customer_phone: string; total_amount: string; moysklad_id: string | null; created_at: string; items_count: number; }

const STATUS_LABEL: Record<string, string> = { new: "Новый", confirmed: "Подтверждён", shipped: "Отправлен", delivered: "Доставлен", cancelled: "Отменён" };

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    adminFetch<{ items: AdminOrder[]; total: number }>("/orders").then(d => { setOrders(d.items); setTotal(d.total); }).catch(() => {});
  }, []);

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Заказы</h1>
        <span style={{ fontSize: 14, color: "var(--ink-secondary)" }}>{total} всего</span>
      </div>

      <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", overflow: "hidden" }}>
        {orders.length === 0 ? (
          <p style={{ padding: 32, color: "var(--ink-secondary)", textAlign: "center" }}>Заказов пока нет</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                {["Номер", "Клиент", "Телефон", "Позиций", "Сумма", "Статус", "МойСклад", "Дата"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "var(--ink-secondary)", fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                  <td style={{ padding: "14px 16px", fontWeight: 600 }}>{o.number}</td>
                  <td style={{ padding: "14px 16px" }}>{o.customer_name}</td>
                  <td style={{ padding: "14px 16px", color: "var(--ink-secondary)" }}>{o.customer_phone}</td>
                  <td style={{ padding: "14px 16px" }}>{o.items_count}</td>
                  <td style={{ padding: "14px 16px", fontWeight: 600 }}>{Number(o.total_amount).toFixed(2)} ₽</td>
                  <td style={{ padding: "14px 16px" }}>{STATUS_LABEL[o.status] ?? o.status}</td>
                  <td style={{ padding: "14px 16px", fontSize: 12, color: o.moysklad_id ? "var(--success)" : "var(--ink-tertiary)" }}>
                    {o.moysklad_id ? "✓ Синхр." : "Ожидает"}
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--ink-secondary)" }}>
                    {new Date(o.created_at).toLocaleString("ru")}
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
