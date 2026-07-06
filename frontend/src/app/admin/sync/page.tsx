"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import HelpHint from "@/components/HelpHint";
import { adminFetch } from "@/lib/adminApi";
import { formatMsk } from "@/lib/format";
import { useIsMobile } from "@/lib/useIsMobile";

interface SyncLog { id: number; source: string; status: string; products_created: number; products_updated: number; error_message: string | null; started_at: string; finished_at: string | null; }

const STATUS_COLOR: Record<string, string> = { success: "var(--success)", error: "var(--critical)", running: "var(--primary)" };

export default function SyncPage() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const isMobile = useIsMobile();

  function load() { adminFetch<SyncLog[]>("/sync-logs").then(setLogs).catch(() => {}); }
  useEffect(() => { load(); }, []);

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Синхронизация</h1>
        <HelpHint text="Журнал обменов каталога с МойСклад: когда прошёл обмен и сколько товаров создано/обновлено." />
      </div>

      {logs.length === 0 ? (
        <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)" }}>
          <p style={{ padding: 32, color: "var(--ink-secondary)", textAlign: "center" }}>Синхронизаций ещё не было</p>
        </div>
      ) : isMobile ? (
        /* Мобильный вид — карточки вместо таблицы */
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {logs.map(log => (
            <div key={log.id} style={{ background: "var(--canvas)", border: "1px solid var(--hairline-soft)", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: STATUS_COLOR[log.status] ?? "var(--ink)", fontWeight: 700 }}>{log.status}</span>
                <span style={{ fontSize: 13, color: "var(--ink-secondary)" }}>{formatMsk(log.finished_at)}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 13, color: "var(--ink-secondary)" }}>
                <span>Источник: {log.source}</span>
                <span>Создано: {log.products_created}</span>
                <span>Обновлено: {log.products_updated}</span>
              </div>
              {log.error_message && <p style={{ fontSize: 12, color: "var(--critical)", marginTop: 6 }}>{log.error_message.slice(0, 120)}</p>}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                {["Источник", "Статус", "Создано", "Обновлено", "Дата"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "var(--ink-secondary)", fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                  <td style={{ padding: "14px 16px" }}>{log.source}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ color: STATUS_COLOR[log.status] ?? "var(--ink)", fontWeight: 600 }}>{log.status}</span>
                    {log.error_message && <p style={{ fontSize: 12, color: "var(--critical)", marginTop: 2 }}>{log.error_message.slice(0, 80)}</p>}
                  </td>
                  <td style={{ padding: "14px 16px" }}>{log.products_created}</td>
                  <td style={{ padding: "14px 16px" }}>{log.products_updated}</td>
                  <td style={{ padding: "14px 16px", color: "var(--ink-secondary)" }}>
                    {formatMsk(log.finished_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
