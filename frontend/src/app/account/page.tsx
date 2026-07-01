"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getMe, logoutUser, getMyOrders, CUSTOMER_TYPE_LABEL,
  type UserProfile, type OrderHistory,
} from "@/lib/authApi";
import { formatPrice, formatMsk } from "@/lib/format";

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

// Сколько позиций заказа показывать до нажатия «Показать полностью».
const ORDER_ITEMS_PREVIEW = 3;

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
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </div>
  );
}

// Карточка заказа с компактной историей: длинный список позиций сворачивается.
function OrderCard({ order }: { order: OrderHistory }) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = order.items.length - ORDER_ITEMS_PREVIEW;
  const shown = expanded ? order.items : order.items.slice(0, ORDER_ITEMS_PREVIEW);

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--hairline, #eee)", borderRadius: "var(--r-xl)", padding: "var(--s-5)", boxShadow: "var(--shadow-1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--s-3)", marginBottom: "var(--s-3)" }}>
        <span style={{ fontWeight: 700 }}>{order.number}</span>
        <span style={{ fontSize: "var(--t-sm)", color: "var(--charcoal)" }}>{formatMsk(order.created_at)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--s-3)", marginBottom: "var(--s-3)" }}>
        <span style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: order.status === "cancelled" ? "var(--charcoal)" : "var(--primary, #003399)", background: "var(--surface, #f5f6f8)", padding: "2px 10px", borderRadius: 999 }}>{BUYER_ORDER_STATUS[order.status] ?? order.status}</span>
        <span style={{ fontWeight: 700 }}>{formatPrice(order.total_amount)}</span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "var(--t-sm)", color: "var(--ink)" }}>
        {shown.map((it, i) => (
          <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)", padding: "var(--s-1) 0", borderTop: i ? "1px solid var(--hairline, #f0f0f0)" : "none" }}>
            <span>{it.product_name} <span style={{ color: "var(--charcoal)" }}>× {it.quantity}</span></span>
            <span style={{ whiteSpace: "nowrap" }}>{formatPrice(it.price)}</span>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="link"
          style={{ marginTop: "var(--s-3)", background: "none", border: "none", padding: 0, cursor: "pointer",
            color: "var(--primary, #003399)", fontSize: "var(--t-sm)", fontWeight: 600 }}>
          {expanded ? "Свернуть" : `Показать полностью (ещё ${hiddenCount})`}
        </button>
      )}
    </div>
  );
}
