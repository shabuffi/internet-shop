"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { adminFetch } from "@/lib/adminApi";

interface AdminProduct { id: string; name: string; article: string | null; price: string; stock: number; is_active: boolean; synced_at: string | null; }

export default function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    adminFetch<{ items: AdminProduct[]; total: number }>("/products").then(d => { setProducts(d.items); setTotal(d.total); }).catch(() => {});
  }, []);

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Товары</h1>
        <span style={{ fontSize: 14, color: "var(--ink-secondary)" }}>{total} всего</span>
      </div>

      <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", overflow: "hidden" }}>
        {products.length === 0 ? (
          <p style={{ padding: 32, color: "var(--ink-secondary)", textAlign: "center" }}>Товаров нет — запустите синхронизацию</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                {["Название", "Артикул", "Цена", "Остаток", "Статус", "Синхронизирован"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "var(--ink-secondary)", fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                  <td style={{ padding: "14px 16px", fontWeight: 500 }}>{p.name}</td>
                  <td style={{ padding: "14px 16px", color: "var(--ink-secondary)" }}>{p.article ?? "—"}</td>
                  <td style={{ padding: "14px 16px", fontWeight: 600 }}>{Number(p.price).toFixed(2)} ₽</td>
                  <td style={{ padding: "14px 16px", color: p.stock > 0 ? "var(--success)" : "var(--ink-tertiary)" }}>
                    {p.stock > 0 ? `${p.stock} шт` : "Нет"}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: p.is_active ? "var(--success)" : "var(--ink-tertiary)" }}>
                      {p.is_active ? "Активен" : "Скрыт"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 12, color: "var(--ink-secondary)" }}>
                    {p.synced_at ? new Date(p.synced_at).toLocaleString("ru") : "—"}
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
