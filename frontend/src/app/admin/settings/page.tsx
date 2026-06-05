"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { adminFetch } from "@/lib/adminApi";

export default function SettingsPage() {
  const [form, setForm] = useState({ moysklad_login: "", moysklad_password: "", exchange_login: "", exchange_password: "", shop_name: "" });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

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

  async function handleTestConnection() {
    setTesting(true); setTestResult(null);
    try {
      const result = await adminFetch<{ ok: boolean; message: string }>("/test-connection", { method: "POST" });
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Ошибка" });
    } finally { setTesting(false); }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null); setPwLoading(true);
    try {
      await adminFetch("/change-password", { method: "POST", body: JSON.stringify(pw) });
      setPwMsg({ ok: true, text: "Пароль изменён" });
      setPw({ current_password: "", new_password: "" });
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : "Ошибка" });
    } finally { setPwLoading(false); }
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

          <div style={{ marginBottom: 20 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleTestConnection}
              disabled={testing}
              style={{ fontSize: 14 }}
            >
              {testing ? "Проверяем..." : "Проверить подключение"}
            </button>
            {testResult && (
              <p style={{ fontSize: 13, marginTop: 8, color: testResult.ok ? "var(--success)" : "var(--critical)" }}>
                {testResult.ok ? "✓" : "✕"} {testResult.message}
              </p>
            )}
          </div>

          <div style={{ height: 1, background: "var(--hairline-soft)", margin: "20px 0" }} />

          <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Данные для обмена (CommerceML)</p>
          <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 20 }}>
            Придумайте любую пару логин/пароль и впишите её сюда <b>и</b> в МойСклад
            (Онлайн-торговля → Адрес магазина). Сайт будет пускать обмен, только если они совпадают.
            Пока поля пустые — обмен открыт для всех.
          </p>

          <div style={inputStyle}>
            <label className="form-label">Логин обмена</label>
            <input className="form-input" value={form.exchange_login}
              onChange={e => setForm(p => ({...p, exchange_login: e.target.value}))}
              placeholder="например, shabshop_exchange" autoComplete="off" />
          </div>

          <div style={inputStyle}>
            <label className="form-label">Пароль обмена</label>
            <input className="form-input" value={form.exchange_password}
              onChange={e => setForm(p => ({...p, exchange_password: e.target.value}))}
              placeholder="Введите новый пароль или оставьте ***"
              type="password" autoComplete="off" />
          </div>

          <div style={{ height: 1, background: "var(--hairline-soft)", margin: "20px 0" }} />

          <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>Магазин</p>

          <div style={inputStyle}>
            <label className="form-label">Название магазина</label>
            <input className="form-input" value={form.shop_name}
              onChange={e => setForm(p => ({...p, shop_name: e.target.value}))}
              placeholder="Магазин" />
            <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>
              Отображается в шапке сайта
            </p>
          </div>

          {error && <p className="form-error">{error}</p>}
          {saved && <p style={{ fontSize: 14, color: "var(--success)", marginBottom: 8 }}>✓ Сохранено</p>}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? "Сохраняем..." : "Сохранить настройки"}
          </button>
        </form>
      </div>

      {/* Смена пароля админа */}
      <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", padding: "28px 32px", maxWidth: 520, marginTop: 24 }}>
        <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>Смена пароля админа</p>
        <form onSubmit={handleChangePassword}>
          <div style={inputStyle}>
            <label className="form-label">Текущий пароль</label>
            <input className="form-input" type="password" value={pw.current_password}
              onChange={e => setPw(p => ({...p, current_password: e.target.value}))}
              autoComplete="current-password" required />
          </div>
          <div style={inputStyle}>
            <label className="form-label">Новый пароль</label>
            <input className="form-input" type="password" value={pw.new_password}
              onChange={e => setPw(p => ({...p, new_password: e.target.value}))}
              autoComplete="new-password" required minLength={8} />
            <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>Минимум 8 символов</p>
          </div>
          {pwMsg && (
            <p style={{ fontSize: 14, marginBottom: 8, color: pwMsg.ok ? "var(--success)" : "var(--critical)" }}>
              {pwMsg.ok ? "✓ " : "✕ "}{pwMsg.text}
            </p>
          )}
          <button className="btn btn-primary" type="submit" disabled={pwLoading} style={{ marginTop: 8 }}>
            {pwLoading ? "Меняем..." : "Сменить пароль"}
          </button>
        </form>
      </div>
    </AdminShell>
  );
}
