"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import PolicyView, { type PolicyOperator } from "@/components/PolicyView";
import { adminFetch } from "@/lib/adminApi";
import { useIsMobile } from "@/lib/useIsMobile";
import HelpHint from "@/components/HelpHint";

interface PolicyData {
  body: string;
  revision: string;
  operator: PolicyOperator;
}

const EMPTY: PolicyData = {
  body: "",
  revision: "",
  operator: { name: "", inn: "", ogrn: "", address: "", email: "", phone: "" },
};

// Подписи и плейсхолдеры реквизитов оператора (подставляются в текст по {{...}}).
const OPERATOR_FIELDS: { key: keyof PolicyOperator; label: string; token: string }[] = [
  { key: "name", label: "Наименование оператора", token: "{{наименование}}" },
  { key: "inn", label: "ИНН", token: "{{инн}}" },
  { key: "ogrn", label: "ОГРН", token: "{{огрн}}" },
  { key: "address", label: "Адрес", token: "{{адрес}}" },
  { key: "email", label: "Email", token: "{{email}}" },
  { key: "phone", label: "Телефон", token: "{{телефон}}" },
];

const cardStyle: React.CSSProperties = {
  background: "var(--canvas)", borderRadius: "var(--radius-lg)",
  border: "1px solid var(--hairline-soft)", padding: "24px 28px", marginBottom: 24,
};
const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 };
const inputStyle: React.CSSProperties = {
  padding: "9px 12px", borderRadius: "var(--radius-md)",
  border: "1px solid var(--hairline-soft)", fontSize: 14, fontFamily: "inherit",
};

export default function PolicyPage() {
  const [form, setForm] = useState<PolicyData>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const isMobile = useIsMobile();

  useEffect(() => {
    adminFetch<PolicyData>("/policy")
      .then((d) => { setForm(d); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  function setOperator(key: keyof PolicyOperator, value: string) {
    setForm((p) => ({ ...p, operator: { ...p.operator, [key]: value } }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await adminFetch("/policy", { method: "POST", body: JSON.stringify(form) });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Политика конфиденциальности</h1>
        <HelpHint text={"Реквизиты подставляются в текст по меткам вида {{наименование}}. Текст можно править напрямую (Markdown-lite: строка «## Заголовок» — раздел, пустая строка — новый абзац). Справа — как страница увидится покупателю на /offer."} />
      </div>

      {!loaded ? (
        <p style={{ color: "var(--ink-secondary)" }}>Загрузка…</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)", gap: isMobile ? 20 : 28, alignItems: "start" }}>
          {/* ── Редактор ── */}
          <div>
            <div style={cardStyle}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Реквизиты оператора</h2>
              {OPERATOR_FIELDS.map((f) => (
                <label key={f.key} style={fieldStyle}>
                  <span style={{ fontSize: 13, color: "var(--ink-secondary)" }}>
                    {f.label} <code style={{ fontSize: 11, opacity: 0.7 }}>{f.token}</code>
                  </span>
                  <input
                    style={inputStyle}
                    value={form.operator[f.key]}
                    onChange={(e) => setOperator(f.key, e.target.value)}
                  />
                </label>
              ))}
              <p style={{ fontSize: 12, color: "var(--ink-tertiary)", margin: 0 }}>
                Эти же реквизиты используются на страницах «О компании» и «Контакты».
              </p>
            </div>

            <div style={cardStyle}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Текст политики</h2>
              <label style={fieldStyle}>
                <span style={{ fontSize: 13, color: "var(--ink-secondary)" }}>Дата редакции</span>
                <input
                  style={inputStyle}
                  placeholder="например, 30 июня 2026 г."
                  value={form.revision}
                  onChange={(e) => { setForm((p) => ({ ...p, revision: e.target.value })); setSaved(false); }}
                />
              </label>
              <label style={fieldStyle}>
                <span style={{ fontSize: 13, color: "var(--ink-secondary)" }}>Тело документа</span>
                <textarea
                  style={{ ...inputStyle, minHeight: 420, lineHeight: 1.5, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 13 }}
                  value={form.body}
                  onChange={(e) => { setForm((p) => ({ ...p, body: e.target.value })); setSaved(false); }}
                />
              </label>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  padding: "11px 24px", borderRadius: "var(--radius-md)", border: "none",
                  background: "var(--primary, #003399)", color: "#fff", fontWeight: 600,
                  fontSize: 14, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Сохранение…" : "Сохранить"}
              </button>
              {saved && <span style={{ color: "var(--success, #16794a)", fontSize: 14 }}>✓ Сохранено</span>}
              {error && <span style={{ color: "var(--danger, #c0392b)", fontSize: 14 }}>{error}</span>}
            </div>
          </div>

          {/* ── Превью ── */}
          <div style={{ position: isMobile ? "static" : "sticky", top: 24 }}>
            <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-tertiary)", marginBottom: 12 }}>
              Предпросмотр
            </p>
            <div style={{ ...cardStyle, maxHeight: isMobile ? "60vh" : "calc(100vh - 120px)", overflowY: "auto", overflowX: "auto", lineHeight: 1.6 }}>
              <PolicyView body={form.body} operator={form.operator} revision={form.revision} />
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
