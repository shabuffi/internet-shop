"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { adminFetch } from "@/lib/adminApi";

interface OwnerSettings {
  shop_name: string; contact_phone: string; contact_email: string; contact_hours: string;
  vk_configured?: boolean; email_configured?: boolean;
}

const EMPTY: OwnerSettings = { shop_name: "", contact_phone: "", contact_email: "", contact_hours: "" };
const CH_LABEL: Record<string, string> = { vk: "ВКонтакте", email: "Email" };

export default function SettingsPage() {
  const [form, setForm] = useState<OwnerSettings>(EMPTY);
  const [vkOk, setVkOk] = useState(false);
  const [emailOk, setEmailOk] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; text: string } | undefined>>({});
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    adminFetch<OwnerSettings>("/settings")
      .then(d => { setForm(d); setVkOk(!!d.vk_configured); setEmailOk(!!d.email_configured); })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSaved(false); setLoading(true);
    try {
      await adminFetch("/settings", { method: "POST", body: JSON.stringify(form) });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally { setLoading(false); }
  }

  async function handleTest(channel: string) {
    setTestResults(prev => ({ ...prev, [channel]: undefined })); setTestingChannel(channel);
    try {
      const r = await adminFetch<{ results: Record<string, string>; details?: Record<string, string> }>(`/test-notification?channel=${channel}`, { method: "POST" });
      const st = r.results[channel];
      const detail = r.details?.[channel];
      const where = channel === "email" ? "почту" : "сообщения сообщества";
      const res = st === "sent" ? { ok: true, text: `Отправлено — проверьте ${where}` }
        : st === "failed" ? { ok: false, text: `Не удалось${detail ? ` — ${detail}` : " (проверьте настройку у разработчика)"}` }
        : { ok: false, text: "Канал не настроен" };
      setTestResults(prev => ({ ...prev, [channel]: res }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [channel]: { ok: false, text: err instanceof Error ? err.message : "Ошибка" } }));
    } finally { setTestingChannel(null); }
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
  const set = (k: keyof OwnerSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  function channelRow(channel: "vk" | "email", configured: boolean) {
    const r = testResults[channel];
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, minWidth: 90 }}>{CH_LABEL[channel]}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: configured ? "var(--stock)" : "var(--ink-tertiary)" }}>
            {configured ? "✓ подключено" : "не настроено"}
          </span>
          {configured && (
            <button type="button" onClick={() => handleTest(channel)} disabled={testingChannel !== null}
              style={{ padding: "0 14px", height: 34, borderRadius: "var(--radius-md)", border: "1px solid var(--graphite)",
                background: "transparent", color: "var(--ink)", fontWeight: 600, fontSize: 13,
                cursor: testingChannel ? "wait" : "pointer", opacity: testingChannel && testingChannel !== channel ? 0.5 : 1 }}>
              {testingChannel === channel ? "Отправляем…" : "Отправить тест"}
            </button>
          )}
        </div>
        {r && (
          <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: r.ok ? "var(--stock)" : "var(--danger, #c0392b)" }}>
            {r.ok ? "✓ " : "✕ "}{r.text}
          </div>
        )}
      </div>
    );
  }

  return (
    <AdminShell>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: -0.3 }}>Настройки</h1>
      <p style={{ fontSize: 14, color: "var(--ink-secondary)", marginBottom: 32 }}>
        Название магазина, контакты и проверка уведомлений. Техническая настройка интеграции —
        на отдельной странице разработчика.
      </p>

      <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", padding: "28px 32px", maxWidth: 520 }}>
        <form onSubmit={handleSubmit}>
          <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Магазин</p>

          <div style={inputStyle}>
            <label className="form-label">Название магазина</label>
            <input className="form-input" value={form.shop_name} onChange={set("shop_name")} placeholder="Магазин" />
            <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>Отображается в шапке, футере и на вкладке браузера</p>
          </div>

          <div style={inputStyle}>
            <label className="form-label">Телефон (футер сайта)</label>
            <input className="form-input" value={form.contact_phone} onChange={set("contact_phone")} placeholder="+7 999 123-45-67" />
          </div>
          <div style={inputStyle}>
            <label className="form-label">Email для покупателей (футер сайта)</label>
            <input className="form-input" type="email" value={form.contact_email} onChange={set("contact_email")} placeholder="shop@example.ru" />
          </div>
          <div style={inputStyle}>
            <label className="form-label">Часы работы (футер сайта)</label>
            <input className="form-input" value={form.contact_hours} onChange={set("contact_hours")} placeholder="Пн–Пт · 10:00–19:00" />
            <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>Пустые поля контактов в футере не показываются</p>
          </div>

          {error && <p className="form-error">{error}</p>}
          {saved && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 12,
              background: "var(--stock-soft)", border: "1px solid var(--stock)", borderRadius: "var(--radius-md)",
              color: "var(--stock)", fontSize: 14, fontWeight: 600 }}>
              <span>✓</span> Настройки сохранены
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? "Сохраняем..." : "Сохранить настройки"}
          </button>
        </form>
      </div>

      {/* Уведомления о заказах — статус + тест (настраивает разработчик) */}
      <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", padding: "28px 32px", maxWidth: 520, marginTop: 24 }}>
        <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Уведомления о заказах</p>
        <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 20 }}>
          Куда приходят оповещения о новых заказах. Каналы подключает разработчик; здесь можно проверить отправку.
        </p>
        {channelRow("vk", vkOk)}
        {channelRow("email", emailOk)}
        {!vkOk && !emailOk && (
          <p style={{ fontSize: 13, color: "var(--ink-tertiary)", marginTop: 6 }}>
            Каналы ещё не настроены — обратитесь к разработчику.
          </p>
        )}
      </div>

      {/* Смена пароля админа */}
      <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", padding: "28px 32px", maxWidth: 520, marginTop: 24 }}>
        <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>Смена пароля админа</p>
        <form onSubmit={handleChangePassword}>
          <div style={inputStyle}>
            <label className="form-label">Текущий пароль</label>
            <input className="form-input" type="password" value={pw.current_password}
              onChange={e => setPw(p => ({ ...p, current_password: e.target.value }))} autoComplete="current-password" required />
          </div>
          <div style={inputStyle}>
            <label className="form-label">Новый пароль</label>
            <input className="form-input" type="password" value={pw.new_password}
              onChange={e => setPw(p => ({ ...p, new_password: e.target.value }))} autoComplete="new-password" required minLength={8} />
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

      <p style={{ fontSize: 12, color: "var(--ink-tertiary)", maxWidth: 520, marginTop: 20 }}>
        Для разработчика: техническая настройка (обмен, ВК-ключ, SMTP) — на странице{" "}
        <a href="/admin/dev" style={{ color: "var(--ink-secondary)", textDecoration: "underline" }}>/admin/dev</a>.
      </p>
    </AdminShell>
  );
}
