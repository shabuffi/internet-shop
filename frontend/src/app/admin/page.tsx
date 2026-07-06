"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { adminFetch } from "@/lib/adminApi";
import { formatMsk } from "@/lib/format";
import { IconBox, IconOrders, IconSync } from "@/components/icons";
import type { ComponentType, SVGProps } from "react";

interface DashboardData {
  product_count: number;
  order_count: number;
  last_sync: { status: string; products_created: number; products_updated: number; finished_at: string } | null;
  last_exchange_seen: string | null;
  last_orders_sync: string | null;
}

function StatCard({ Icon, label, value }: { Icon: ComponentType<SVGProps<SVGSVGElement>>; label: string; value: string | number }) {
  return (
    <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", padding: "24px 28px" }}>
      <div style={{ color: "var(--primary)", marginBottom: 12 }}><Icon width={22} height={22} /></div>
      <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, marginBottom: 4 }}>{value}</p>
      <p style={{ fontSize: 14, color: "var(--ink-secondary)" }}>{label}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    adminFetch<DashboardData>("/dashboard").then(setData).catch(() => {});
  }, []);

  return (
    <AdminShell>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 32, letterSpacing: -0.3 }}>Обзор</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 40 }}>
        <StatCard Icon={IconBox} label="Товаров" value={data?.product_count ?? "—"} />
        <StatCard Icon={IconOrders} label="Заказов" value={data?.order_count ?? "—"} />
        <StatCard Icon={IconSync} label="Последняя синхр." value={data?.last_sync?.status ?? "—"} />
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
