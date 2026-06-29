"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { adminFetch } from "@/lib/adminApi";
import { formatMsk } from "@/lib/format";

interface SyncLog { id: number; source: string; status: string; products_created: number; products_updated: number; error_message: string | null; started_at: string; finished_at: string | null; }

const STATUS_COLOR: Record<string, string> = { success: "var(--success)", error: "var(--critical)", running: "var(--primary)" };

export default function SyncPage() {
  const [logs, setLogs] = useState<SyncLog[]>([]);

  function load() { adminFetch<SyncLog[]>("/sync-logs").then(setLogs).catch(() => {}); }
  useEffect(() => { load(); }, []);

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Синхронизация</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn btn-ghost" onClick={load} style={{ fontSize: 14 }}>Обновить</button>
        </div>
      </div>

      <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", overflow: "hidden" }}>
        {logs.length === 0 ? (
          <p style={{ padding: 32, color: "var(--ink-secondary)", textAlign: "center" }}>Синхронизаций ещё не было</p>
        ) : (
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
        )}
      </div>
    </AdminShell>
  );
}
