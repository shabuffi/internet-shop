"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import HelpHint from "@/components/HelpHint";
import { adminFetch } from "@/lib/adminApi";
import PasswordField from "@/components/PasswordField";

interface ExchangeSettings {
  exchange_login: string; exchange_password: string;
  exchange_last_seen?: string | null;
}

const cardStyle: React.CSSProperties = {
  background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)",
  padding: "28px 32px", maxWidth: 680, marginBottom: 24,
};
const inputStyle = { display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 16 };

// Статус обмена по метке «последний контакт МойСклад» (порог простоя — 24ч, как в бэкенде).
function exchangeStatus(iso?: string | null): { text: string; color: string } {
  if (!iso) return { text: "обмена ещё не было", color: "var(--ink-tertiary)" };
  const ageH = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (ageH < 24) {
    const ago = ageH < 1 ? "менее часа назад" : `${Math.round(ageH)} ч назад`;
    return { text: `на связи · ${ago}`, color: "var(--stock, #16794a)" };
  }
  return { text: `обмена не было ${Math.round(ageH)} ч`, color: "var(--accent-2, #E02424)" };
}

// Страница интеграции с МойСклад: только пара логин/пароль обмена (синхронизация) + статус.
// Всё остальное вынесено: магазин/остаток/пароль админа → «Настройка сайта», ВК/Email → «Уведомления».
export default function SettingsPage() {
  const [form, setForm] = useState<ExchangeSettings>({ exchange_login: "", exchange_password: "" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetch<ExchangeSettings>("/settings")
      .then(d => setForm({ exchange_login: d.exchange_login || "", exchange_password: d.exchange_password || "",
        exchange_last_seen: d.exchange_last_seen }))
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSaved(false); setSaving(true);
    try {
      await adminFetch("/settings", { method: "POST", body: JSON.stringify({
        exchange_login: form.exchange_login, exchange_password: form.exchange_password,
      }) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally { setSaving(false); }
  }

  const set = (k: keyof ExchangeSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>МойСклад</h1>
        <HelpHint text={"Пара логин/пароль для синхронизации каталога и заказов с МойСклад (не пароль от аккаунта МойСклад).\n\nНастройки магазина и показа остатка — на странице «Настройка сайта», уведомления о заказах — на «Уведомления»."} />
      </div>

      {error && <p className="form-error" style={{ maxWidth: 520, marginBottom: 16 }}>{error}</p>}

      {/* Обмен с МойСклад */}
      <form style={cardStyle} onSubmit={save}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
          <p style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>Обмен с МойСклад</p>
          {(() => { const s = exchangeStatus(form.exchange_last_seen); return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: s.color }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: "currentColor", flexShrink: 0 }} />
              {s.text}
            </span>
          ); })()}
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 16 }}>
          Придумайте пару логин/пароль и впишите её сюда <b>и</b> в МойСклад (Адрес магазина).
          Это пароль обмена, а не от аккаунта МойСклад.
        </p>
        <div style={inputStyle}>
          <label className="form-label">Логин обмена</label>
          <input className="form-input" value={form.exchange_login} onChange={set("exchange_login")} placeholder="например, myshop_exchange" autoComplete="off" />
        </div>
        <div style={inputStyle}>
          <label className="form-label">Пароль обмена</label>
          <PasswordField className="form-input" value={form.exchange_password} onChange={set("exchange_password")} placeholder="новый пароль или оставьте ***" autoComplete="off" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
          {saved && <span style={{ color: "var(--stock)", fontWeight: 600, fontSize: 13 }}>✓ Сохранено</span>}
        </div>
      </form>
    </AdminShell>
  );
}
