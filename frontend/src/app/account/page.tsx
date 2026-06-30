"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getMe, logoutUser, getMyOrders, CUSTOMER_TYPE_LABEL, ORDER_STATUS_LABEL,
  type UserProfile, type OrderHistory,
} from "@/lib/authApi";
import { formatPrice, formatMsk } from "@/lib/format";

function formatAdjustment(percent: string): string {
  const n = parseFloat(percent);
  if (Number.isNaN(n)) return "—";
  if (n < 0) return `скидка ${Math.abs(n)}%`;
  if (n > 0) return `наценка +${n}%`;
  return "базовая цена";
}

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

  const rows: [string, string][] = [
    ["Email", user.email],
    ["Телефон", user.phone],
    ["Тип заказчика", CUSTOMER_TYPE_LABEL[user.customer_type] ?? user.customer_type],
    ["Наименование", user.customer_name],
    ...(user.inn ? [["ИНН", user.inn] as [string, string]] : []),
    ["Цена для вас", formatAdjustment(user.discount_percent)],
  ];

  return (
    <div className="container" style={{ maxWidth: 560, margin: "0 auto", padding: "var(--s-8) var(--s-4)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--s-6)" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-h1)", margin: 0 }}>Личный кабинет</h1>
        <button type="button" className="btn btn--ghost" onClick={handleLogout}>Выйти</button>
      </div>

      <div style={{ background: "var(--paper)", border: "1px solid var(--hairline, #eee)", borderRadius: "var(--r-xl)", padding: "var(--s-6)", boxShadow: "var(--shadow-1)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: "var(--s-2) 0", color: "var(--charcoal)", verticalAlign: "top", width: "40%" }}>{k}</td>
                <td style={{ padding: "var(--s-2) 0", fontWeight: 600 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-h3)", margin: "var(--s-8) 0 var(--s-4)" }}>
        История заказов
      </h2>

      {orders === null ? (
        <p style={{ color: "var(--charcoal)", fontSize: "var(--t-sm)" }}>Загрузка…</p>
      ) : orders.length === 0 ? (
        <p style={{ color: "var(--charcoal)", fontSize: "var(--t-sm)" }}>
          У вас пока нет заказов. Перейдите в <Link href="/catalog" className="link">каталог</Link>, чтобы оформить первый.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
          {orders.map((o) => (
            <div key={o.id} style={{ background: "var(--paper)", border: "1px solid var(--hairline, #eee)", borderRadius: "var(--r-xl)", padding: "var(--s-5)", boxShadow: "var(--shadow-1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--s-3)", marginBottom: "var(--s-3)" }}>
                <span style={{ fontWeight: 700 }}>{o.number}</span>
                <span style={{ fontSize: "var(--t-sm)", color: "var(--charcoal)" }}>{formatMsk(o.created_at)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--s-3)", marginBottom: "var(--s-3)" }}>
                <span style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: o.status === "cancelled" ? "var(--charcoal)" : "var(--primary, #003399)", background: "var(--surface, #f5f6f8)", padding: "2px 10px", borderRadius: 999 }}>{ORDER_STATUS_LABEL[o.status] ?? o.status}</span>
                <span style={{ fontWeight: 700 }}>{formatPrice(o.total_amount)}</span>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "var(--t-sm)", color: "var(--ink)" }}>
                {o.items.map((it, i) => (
                  <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", padding: "var(--s-1) 0", borderTop: i ? "1px solid var(--hairline, #f0f0f0)" : "none" }}>
                    <span>{it.product_name} <span style={{ color: "var(--charcoal)" }}>× {it.quantity}</span></span>
                    <span style={{ whiteSpace: "nowrap" }}>{formatPrice(it.price)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
