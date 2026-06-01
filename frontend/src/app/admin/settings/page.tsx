"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { adminFetch } from "@/lib/adminApi";

export default function SettingsPage() {
  const [form, setForm] = useState({ moysklad_login: "", moysklad_password: "", sync_interval: "300", shop_name: "" });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adminFetch<typeof form>("/settings").then(data => setForm(data)).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSaved(false); setLoading(true);
    try {
      await adminFetch("/settings", { method: "POST", body: JSON.stringify(form) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally { setLoading(false); }
  }

  const inputStyle = { display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 16 };

  return (
    <AdminShell>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: -0.3 }}>Настройки МойСклад</h1>
      <p style={{ fontSize: 14, color: "var(--ink-secondary)", marginBottom: 32 }}>
        Credentials для подключения к МойСклад. Хранятся в базе данных, не в .env файле.
      </p>

      <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", padding: "28px 32px", maxWidth: 520 }}>
        <form onSubmit={handleSubmit}>
          <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>Доступ к API</p>

          <div style={inputStyle}>
            <label className="form-label">Логин (email)</label>
            <input className="form-input" value={form.moysklad_login}
              onChange={e => setForm(p => ({...p, moysklad_login: e.target.value}))}
              placeholder="your@email.com" type="email" />
          </div>

          <div style={inputStyle}>
            <label className="form-label">Пароль</label>
            <input className="form-input" value={form.moysklad_password}
              onChange={e => setForm(p => ({...p, moysklad_password: e.target.value}))}
              placeholder="Введите новый пароль или оставьте ***"
              type="password" />
          </div>

          <div style={{ height: 1, background: "var(--hairline-soft)", margin: "20px 0" }} />

          <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>Настройки синхронизации</p>

          <div style={inputStyle}>
            <label className="form-label">Интервал синхронизации (секунды)</label>
            <input className="form-input" value={form.sync_interval}
              onChange={e => setForm(p => ({...p, sync_interval: e.target.value}))}
              type="number" min="60" />
          </div>

          <div style={inputStyle}>
            <label className="form-label">Название магазина</label>
            <input className="form-input" value={form.shop_name}
              onChange={e => setForm(p => ({...p, shop_name: e.target.value}))}
              placeholder="Магазин" />
          </div>

          {error && <p className="form-error">{error}</p>}
          {saved && <p style={{ fontSize: 14, color: "var(--success)", marginBottom: 8 }}>✓ Сохранено</p>}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? "Сохраняем..." : "Сохранить настройки"}
          </button>
        </form>
      </div>
    </AdminShell>
  );
}
