"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { adminFetch } from "@/lib/adminApi";
import { formatMsk } from "@/lib/format";

interface AdminUser {
  id: string; email: string; phone: string; customer_type: string;
  customer_name: string; inn: string | null; discount_percent: string; created_at: string;
}

const TYPE_LABEL: Record<string, string> = { individual: "Физлицо", ip: "ИП", ooo: "ООО" };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function load() {
    adminFetch<AdminUser[]>("/users").then(setUsers).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function saveDiscount(id: string, raw: string) {
    const pct = Number(raw);
    setError("");
    if (Number.isNaN(pct) || pct < -30 || pct > 9) {
      setError("Скидка должна быть числом от −30 до +9");
      load();
      return;
    }
    setSavingId(id);
    try {
      const updated = await adminFetch<AdminUser>(`/users/${id}`, {
        method: "PATCH", body: JSON.stringify({ discount_percent: pct }),
      });
      setUsers((us) => us.map((u) => (u.id === id ? updated : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
      load();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Покупатели</h1>
        <span style={{ fontSize: 14, color: "var(--ink-secondary)" }}>{users.length} всего</span>
        {error && <span style={{ fontSize: 13, color: "var(--critical)" }}>{error}</span>}
      </div>

      <p style={{ fontSize: 13, color: "var(--ink-secondary)", margin: "0 0 16px" }}>
        Скидка — корректировка цены от базовой (МойСклад), %. Диапазон −30…+9 (−30 = дешевле на 30%,
        +9 = дороже на 9%). По умолчанию +5. Не вошедшие видят +10%.
      </p>

      <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", overflow: "hidden" }}>
        {users.length === 0 ? (
          <p style={{ padding: 32, color: "var(--ink-secondary)", textAlign: "center" }}>Зарегистрированных покупателей пока нет</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                {["Наименование", "Тип", "ИНН", "Email", "Телефон", "Скидка %", "Регистрация"].map((h) => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "var(--ink-secondary)", fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                  <td style={{ padding: "14px 16px", fontWeight: 600 }}>{u.customer_name}</td>
                  <td style={{ padding: "14px 16px", color: "var(--ink-secondary)" }}>{TYPE_LABEL[u.customer_type] ?? u.customer_type}</td>
                  <td style={{ padding: "14px 16px", color: "var(--ink-secondary)" }}>{u.inn ?? "—"}</td>
                  <td style={{ padding: "14px 16px" }}>{u.email}</td>
                  <td style={{ padding: "14px 16px", color: "var(--ink-secondary)" }}>{u.phone}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <input
                      type="number" min={-30} max={9} step={1}
                      defaultValue={Number(u.discount_percent)}
                      aria-label={`Скидка ${u.customer_name}`}
                      disabled={savingId === u.id}
                      onBlur={(e) => { if (Number(e.target.value) !== Number(u.discount_percent)) saveDiscount(u.id, e.target.value); }}
                      style={{ width: 80, fontSize: 14, fontWeight: 600, padding: "6px 10px", borderRadius: 8,
                        border: "1px solid var(--hairline-soft)", background: "var(--canvas)", color: "var(--ink)",
                        opacity: savingId === u.id ? 0.5 : 1 }}
                    />
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--ink-secondary)" }}>{formatMsk(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
