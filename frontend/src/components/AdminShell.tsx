"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { adminFetch, adminLogout } from "@/lib/adminApi";
import { IconOverview, IconSettings, IconSync, IconBox, IconOrders } from "@/components/icons";

const NAV = [
  { href: "/admin",          label: "Обзор",         Icon: IconOverview },
  { href: "/admin/settings", label: "МойСклад",      Icon: IconSettings },
  { href: "/admin/sync",     label: "Синхронизация", Icon: IconSync },
  { href: "/admin/products", label: "Товары",        Icon: IconBox },
  { href: "/admin/orders",   label: "Заказы",        Icon: IconOrders },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Кука httpOnly из JS не читается — спрашиваем сервер, валидна ли сессия.
    // adminFetch сам редиректит на /admin/login при 401.
    adminFetch("/me").then(() => setReady(true)).catch(() => {});
  }, []);

  if (!ready) return null;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--surface)" }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: "var(--canvas)", borderRight: "1px solid var(--hairline-soft)", padding: "24px 0", flexShrink: 0, position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0 20px 24px", borderBottom: "1px solid var(--hairline-soft)" }}>
          <Link href="/" style={{ fontSize: 12, color: "var(--ink-secondary)" }}>← Магазин</Link>
          <p style={{ fontSize: 18, fontWeight: 700, marginTop: 8, letterSpacing: -0.3 }}>Admin</p>
        </div>

        <nav style={{ padding: "16px 12px", flex: 1 }}>
          {NAV.map(item => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: "var(--radius-md)",
                fontSize: 14, fontWeight: active ? 600 : 400,
                color: active ? "var(--ink)" : "var(--ink-secondary)",
                background: active ? "var(--surface)" : "transparent",
                marginBottom: 2, transition: "background .15s, color .15s",
              }}>
                <item.Icon style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }} /> {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: "16px 20px", borderTop: "1px solid var(--hairline-soft)" }}>
          <button onClick={async () => { await adminLogout(); router.push("/admin/login"); }}
            style={{ fontSize: 13, color: "var(--ink-tertiary)", background: "none", border: "none", cursor: "pointer" }}>
            Выйти
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: "32px 40px", overflowY: "auto" }}>
        {children}
      </main>
    </div>
  );
}
