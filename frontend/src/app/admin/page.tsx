"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { adminFetch } from "@/lib/adminApi";
import { formatMsk } from "@/lib/format";
import { useIsMobile } from "@/lib/useIsMobile";
import HelpHint from "@/components/HelpHint";
import { IconBox, IconOrders, IconSync } from "@/components/icons";
import type { ComponentType, SVGProps } from "react";

interface DashboardData {
  product_count: number;
  order_count: number;
  last_sync: { status: string; products_created: number; products_updated: number; finished_at: string } | null;
  last_exchange_seen: string | null;
  last_orders_sync: string | null;
}

function StatCard({ Icon, label, value, compact }: { Icon: ComponentType<SVGProps<SVGSVGElement>>; label: string; value: string | number; compact?: boolean }) {
  return (
    <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", padding: compact ? "9px 11px" : "24px 28px" }}>
      <div style={{ color: "var(--primary)", marginBottom: compact ? 3 : 12, lineHeight: 0 }}><Icon width={compact ? 15 : 22} height={compact ? 15 : 22} /></div>
      <p style={{ fontSize: compact ? 17 : 28, fontWeight: 700, letterSpacing: -0.5, marginBottom: 1, lineHeight: 1.15, wordBreak: "break-word" }}>{value}</p>
      <p style={{ fontSize: compact ? 11 : 14, color: "var(--ink-secondary)" }}>{label}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    adminFetch<DashboardData>("/dashboard").then(setData).catch(() => {});
  }, []);

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isMobile ? 16 : 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Обзор</h1>
        <HelpHint text="Сводка магазина: сколько товаров и заказов и когда была последняя синхронизация с МойСклад." />
      </div>

      <div style={{ display: "grid",
        gridTemplateColumns: isMobile ? "repeat(3, minmax(0, 1fr))" : "repeat(auto-fill, minmax(200px, 1fr))",
        gap: isMobile ? 8 : 16, marginBottom: isMobile ? 20 : 40 }}>
        <StatCard Icon={IconBox} label="Товаров" value={data?.product_count ?? "—"} compact={isMobile} />
        <StatCard Icon={IconOrders} label="Заказов" value={data?.order_count ?? "—"} compact={isMobile} />
        <StatCard Icon={IconSync} label="Последняя синхр." value={data?.last_sync?.status ?? "—"} compact={isMobile} />
      </div>

      {/* Когда что последний раз синхронизировалось с МойСклад */}
      <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", padding: "20px 24px", marginBottom: 24 }}>
        <p style={{ fontWeight: 600, marginBottom: 16 }}>Синхронизация с МойСклад</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, fontSize: 14 }}>
          <div>
            <p style={{ color: "var(--ink-secondary)", marginBottom: 4 }}>Каталог (товары и остатки)</p>
            <p style={{ fontWeight: 600 }}>{data?.last_sync?.finished_at ? formatMsk(data.last_sync.finished_at) : "—"}</p>
            {data?.last_sync && <p style={{ fontSize: 12, color: "var(--ink-tertiary)", marginTop: 2 }}>создано {data.last_sync.products_created} · обновлено {data.last_sync.products_updated} · {data.last_sync.status}</p>}
          </div>
          <div>
            <p style={{ color: "var(--ink-secondary)", marginBottom: 4 }}>Заказы</p>
            <p style={{ fontWeight: 600 }}>{data?.last_orders_sync ? formatMsk(data.last_orders_sync) : "—"}</p>
            <p style={{ fontSize: 12, color: "var(--ink-tertiary)", marginTop: 2 }}>статусы и состав заказов из МойСклад</p>
          </div>
          <div>
            <p style={{ color: "var(--ink-secondary)", marginBottom: 4 }}>Последний контакт МойСклад</p>
            <p style={{ fontWeight: 600 }}>{data?.last_exchange_seen ? formatMsk(data.last_exchange_seen) : "—"}</p>
            <p style={{ fontSize: 12, color: "var(--ink-tertiary)", marginTop: 2 }}>любой обмен (проверка связи)</p>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
