"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { adminFetch, adminLogout } from "@/lib/adminApi";
import { IconOverview, IconSettings, IconSync, IconBox, IconOrders, IconUsers, IconShield, IconImage } from "@/components/icons";

const NAV = [
  { href: "/admin",          label: "Обзор",         Icon: IconOverview },
  { href: "/admin/settings", label: "МойСклад",      Icon: IconSettings },
  { href: "/admin/sync",     label: "Синхронизация", Icon: IconSync },
  { href: "/admin/products", label: "Товары",        Icon: IconBox },
  { href: "/admin/orders",   label: "Заказы",        Icon: IconOrders },
  { href: "/admin/banners",  label: "Баннеры",       Icon: IconImage },
  { href: "/admin/users",    label: "Покупатели",    Icon: IconUsers },
  { href: "/admin/policy",   label: "Политика",      Icon: IconShield },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  // Свёрнутое меню (только иконки); выбор запоминается в localStorage
  const [collapsed, setCollapsed] = useState(false);
  // На узком экране сайдбар всегда в иконках (адаптив под мобильник)
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Кука httpOnly из JS не читается — спрашиваем сервер, валидна ли сессия.
    // adminFetch сам редиректит на /admin/login при 401.
    adminFetch("/me").then(() => setReady(true)).catch(() => {});
    setCollapsed(localStorage.getItem("admin_nav_collapsed") === "1");
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  function toggleCollapsed() {
    setCollapsed(c => {
      localStorage.setItem("admin_nav_collapsed", c ? "0" : "1");
      return !c;
    });
  }

  if (!ready) return null;

  // На мобиле сайдбар всегда в иконках (пользовательский collapse игнорируем).
  const c = isMobile || collapsed;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--surface)" }}>
      {/* Sidebar */}
      <aside style={{ width: c ? 64 : 220, background: "var(--canvas)", borderRight: "1px solid var(--hairline-soft)", padding: "24px 0", flexShrink: 0, position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column", transition: "width .2s" }}>
        <div style={{ padding: c ? "0 0 24px" : "0 20px 24px", borderBottom: "1px solid var(--hairline-soft)", textAlign: c ? "center" : "left" }}>
          <Link href="/" title="На сайт магазина" style={{ fontSize: 12, color: "var(--ink-secondary)" }}>{c ? "←" : "← Магазин"}</Link>
          {!c && <p style={{ fontSize: 18, fontWeight: 700, marginTop: 8, letterSpacing: -0.3 }}>Admin</p>}
        </div>

        <nav style={{ padding: "16px 12px", flex: 1 }}>
          {NAV.map(item => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} title={c ? item.label : undefined} style={{
                display: "flex", alignItems: "center", gap: 10,
                justifyContent: c ? "center" : "flex-start",
                padding: c ? "10px 0" : "10px 12px", borderRadius: "var(--radius-md)",
                fontSize: 14, fontWeight: active ? 600 : 400,
                color: active ? "var(--ink)" : "var(--ink-secondary)",
                background: active ? "var(--surface)" : "transparent",
                marginBottom: 2, transition: "background .15s, color .15s",
              }}>
                <item.Icon style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }} /> {!c && item.label}
              </Link>
            );
          })}
        </nav>

        {/* Свернуть/развернуть меню — на мобиле скрыто (там всегда иконки) */}
        {!isMobile && (
          <div style={{ padding: collapsed ? "10px 0" : "10px 12px", textAlign: "center" }}>
            <button onClick={toggleCollapsed} title={collapsed ? "Развернуть меню" : "Свернуть меню"}
              aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
              style={{ width: collapsed ? 40 : "100%", height: 34, borderRadius: "var(--radius-md)",
                border: "1px solid var(--hairline-soft)", background: "transparent", cursor: "pointer",
                color: "var(--ink-secondary)", fontSize: 14, display: "inline-flex",
                alignItems: "center", justifyContent: "center", gap: 8 }}>
              {collapsed ? "»" : <>« {" Свернуть"}</>}
            </button>
          </div>
        )}

        <div style={{ padding: c ? "16px 0" : "16px 20px", borderTop: "1px solid var(--hairline-soft)", textAlign: c ? "center" : "left" }}>
          <button onClick={async () => { await adminLogout(); router.push("/admin/login"); }} title="Выйти"
            style={{ fontSize: 13, color: "var(--ink-tertiary)", background: "none", border: "none", cursor: "pointer" }}>
            {c ? "⎋" : "Выйти"}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0, padding: isMobile ? "18px 14px" : "32px 40px", overflowY: "auto" }}>
        {children}
      </main>
    </div>
  );
}
