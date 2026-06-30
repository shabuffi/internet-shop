"use client";

import { useEffect, useState } from "react";
import { devFetch } from "@/lib/adminApi";
import { CHAT_SERVICE_LABEL, buildChatUrl, type ChatService } from "@/lib/chat";

// Настройки сайта (чат / соцсети / SEO / тема). Живут на dev-странице (под паролем
// разработчика) и сохраняются через /dev/settings. Карточка самодостаточна:
// сама грузит текущие значения и сохраняет свой набор полей.

type ChatMode = "off" | "button" | "vk_widget";

interface SiteSettings {
  chat_mode: ChatMode;
  chat_enabled: boolean;
  chat_service: ChatService;
  chat_value: string;
  chat_label: string;
  chat_vk_api_id: string;
  chat_vk_group_id: string;
  social_vk: string;
  social_telegram: string;
  social_whatsapp: string;
  social_instagram: string;
  seo_title: string;
  seo_description: string;
  seo_og_title: string;
  seo_og_description: string;
  seo_robots_index: boolean;
  theme_primary: string;
}

const EMPTY: SiteSettings = {
  chat_mode: "button",
  chat_enabled: false, chat_service: "vk", chat_value: "", chat_label: "Чат с менеджером",
  chat_vk_api_id: "", chat_vk_group_id: "",
  social_vk: "", social_telegram: "", social_whatsapp: "", social_instagram: "",
  seo_title: "", seo_description: "", seo_og_title: "", seo_og_description: "",
  seo_robots_index: true, theme_primary: "",
};

const KEYS = Object.keys(EMPTY) as (keyof SiteSettings)[];

const card: React.CSSProperties = {
  background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)",
  padding: "28px 32px", maxWidth: 520, margin: "20px auto 0",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 };
const sub: React.CSSProperties = { fontWeight: 600, fontSize: 16, margin: "0 0 14px" };
const hr: React.CSSProperties = { height: 1, background: "var(--hairline-soft)", margin: "20px 0" };

export default function SiteSettingsCard() {
  const [form, setForm] = useState<SiteSettings>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    devFetch<Partial<SiteSettings>>("/dev/settings")
      .then((d) => {
        const out: Record<string, unknown> = {};
        for (const k of KEYS) if (d[k] !== undefined) out[k] = d[k];
        setForm({ ...EMPTY, ...(out as Partial<SiteSettings>) });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  function set<K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) {
    setForm((p) => ({ ...p, [k]: v }));
    setSaved(false);
  }

  async function save() {
    setSaving(true); setError("");
    try {
      const payload: Record<string, unknown> = {};
      for (const k of KEYS) payload[k] = form[k];
      await devFetch("/dev/settings", { method: "POST", body: JSON.stringify(payload) });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;
  const chatPreview = form.chat_value ? buildChatUrl(form.chat_service, form.chat_value) : "";

  return (
    <div style={card}>
      <p style={{ fontWeight: 700, fontSize: 18, letterSpacing: -0.2, marginBottom: 4 }}>Настройки сайта</p>
      <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 20 }}>
        Чат, соцсети, SEO и цвет темы. Применяются к витрине в течение минуты.
      </p>

      {/* ── Чат ── */}
      <p style={sub}>Чат с менеджером</p>
      <div style={field}>
        <label className="form-label">Режим</label>
        <select className="form-input" value={form.chat_mode} onChange={(e) => set("chat_mode", e.target.value as ChatMode)}>
          <option value="off">Выключен</option>
          <option value="button">Кнопка-ссылка (открывает мессенджер)</option>
          <option value="vk_widget">Встроенный чат ВКонтакте</option>
        </select>
      </div>
      {form.chat_mode === "button" && (
        <>
          <div style={{ ...field, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <input type="checkbox" checked={form.chat_enabled} onChange={(e) => set("chat_enabled", e.target.checked)} />
            <span className="form-label" style={{ margin: 0 }}>Показывать плавающую кнопку</span>
          </div>
          <div style={field}>
            <label className="form-label">Сервис</label>
            <select className="form-input" value={form.chat_service} onChange={(e) => set("chat_service", e.target.value as ChatService)}>
              {(Object.keys(CHAT_SERVICE_LABEL) as ChatService[]).map((s) => (
                <option key={s} value={s}>{CHAT_SERVICE_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div style={field}>
            <label className="form-label">Адрес (ник/номер/ссылка)</label>
            <input className="form-input" value={form.chat_value} onChange={(e) => set("chat_value", e.target.value)}
              placeholder={form.chat_service === "whatsapp" ? "79001234567" : "club123456789"} />
          </div>
          <div style={field}>
            <label className="form-label">Подпись кнопки</label>
            <input className="form-input" value={form.chat_label} onChange={(e) => set("chat_label", e.target.value)} placeholder="Чат с менеджером" />
          </div>
          {chatPreview && (
            <p style={{ fontSize: 12, color: "var(--ink-tertiary)", margin: "0 0 4px", wordBreak: "break-all" }}>
              Ссылка: <a href={chatPreview} target="_blank" rel="noopener noreferrer">{chatPreview}</a>
            </p>
          )}
        </>
      )}
      {form.chat_mode === "vk_widget" && (
        <>
          <div style={field}>
            <label className="form-label">ID приложения VK (apiId)</label>
            <input className="form-input" value={form.chat_vk_api_id} onChange={(e) => set("chat_vk_api_id", e.target.value)} inputMode="numeric" placeholder="напр. 51234567" />
          </div>
          <div style={field}>
            <label className="form-label">ID сообщества VK (число без минуса)</label>
            <input className="form-input" value={form.chat_vk_group_id} onChange={(e) => set("chat_vk_group_id", e.target.value)} inputMode="numeric" placeholder="напр. 123456789" />
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-tertiary)", margin: 0, lineHeight: 1.5 }}>
            Виджет «Сообщения сообщества». Нужно: включить «Сообщения» в сообществе; создать на{" "}
            <a href="https://dev.vk.com/" target="_blank" rel="noopener noreferrer">dev.vk.com</a> приложение типа «Сайт»
            (взять apiId) и указать ID сообщества. Работает на боевом домене, не на localhost.
          </p>
        </>
      )}

      <div style={hr} />

      {/* ── Соцсети ── */}
      <p style={sub}>Соцсети (футер)</p>
      {([
        ["social_vk", "ВКонтакте"], ["social_telegram", "Telegram"],
        ["social_whatsapp", "WhatsApp"], ["social_instagram", "Instagram"],
      ] as [keyof SiteSettings, string][]).map(([k, label]) => (
        <div key={k} style={field}>
          <label className="form-label">{label}</label>
          <input className="form-input" value={form[k] as string} onChange={(e) => set(k, e.target.value as never)} placeholder="https://…" />
        </div>
      ))}

      <div style={hr} />

      {/* ── SEO ── */}
      <p style={sub}>SEO</p>
      <div style={field}>
        <label className="form-label">Заголовок (title)</label>
        <input className="form-input" value={form.seo_title} onChange={(e) => set("seo_title", e.target.value)} placeholder="Пусто → название магазина" />
      </div>
      <div style={field}>
        <label className="form-label">Описание (description)</label>
        <textarea className="form-input" style={{ minHeight: 70, resize: "vertical" }} value={form.seo_description} onChange={(e) => set("seo_description", e.target.value)} />
      </div>
      <div style={field}>
        <label className="form-label">Open Graph — заголовок</label>
        <input className="form-input" value={form.seo_og_title} onChange={(e) => set("seo_og_title", e.target.value)} placeholder="Пусто → как title" />
      </div>
      <div style={field}>
        <label className="form-label">Open Graph — описание</label>
        <textarea className="form-input" style={{ minHeight: 70, resize: "vertical" }} value={form.seo_og_description} onChange={(e) => set("seo_og_description", e.target.value)} />
      </div>
      <div style={{ ...field, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <input type="checkbox" checked={form.seo_robots_index} onChange={(e) => set("seo_robots_index", e.target.checked)} />
        <span className="form-label" style={{ margin: 0 }}>Разрешить индексацию поисковиками (robots.txt)</span>
      </div>

      <div style={hr} />

      {/* ── Внешний вид ── */}
      <p style={sub}>Внешний вид</p>
      <div style={field}>
        <label className="form-label">Основной цвет (акцент кнопок и ссылок)</label>
        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(form.theme_primary) ? form.theme_primary : "#003399"}
            onChange={(e) => set("theme_primary", e.target.value)}
            style={{ width: 46, height: 38, padding: 2, border: "1px solid var(--hairline-soft)", borderRadius: 8 }} />
          <input className="form-input" style={{ maxWidth: 160 }} value={form.theme_primary} onChange={(e) => set("theme_primary", e.target.value)} placeholder="#003399 (пусто → по умолч.)" />
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving} type="button">
          {saving ? "Сохраняем…" : "Сохранить настройки сайта"}
        </button>
        {saved && <span style={{ color: "var(--stock)", fontSize: 14, fontWeight: 600 }}>✓ Сохранено</span>}
        {error && <span style={{ color: "var(--danger, #c0392b)", fontSize: 14 }}>{error}</span>}
      </div>
    </div>
  );
}
