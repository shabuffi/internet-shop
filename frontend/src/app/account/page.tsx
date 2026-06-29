"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, logoutUser, CUSTOMER_TYPE_LABEL, type UserProfile } from "@/lib/authApi";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe().then((u) => {
      if (!u) { router.replace("/login"); return; }
      setUser(u);
      setLoading(false);
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

      <p style={{ color: "var(--charcoal)", fontSize: "var(--t-sm)", marginTop: "var(--s-5)" }}>
        История заказов появится здесь позже.
      </p>
    </div>
  );
}
