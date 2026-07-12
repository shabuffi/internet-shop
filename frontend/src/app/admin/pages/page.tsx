"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import HelpHint from "@/components/HelpHint";
import InfoPageView from "@/components/InfoPageView";
import { adminFetch } from "@/lib/adminApi";

interface InfoPage { title: string; body: string }
interface InfoPages { order: InfoPage; payment: InfoPage }

const EMPTY: InfoPages = { order: { title: "Оформление заказа", body: "" }, payment: { title: "Оплата", body: "" } };

const cardStyle: React.CSSProperties = {
  background: "var(--canvas)", borderRadius: "var(--radius-lg)",
  border: "1px solid var(--hairline-soft)", padding: "24px 28px", marginBottom: 24,
};
const taStyle: React.CSSProperties = {
  width: "100%", minHeight: 220, padding: "12px 14px", borderRadius: "var(--radius-md)",
  border: "1px solid var(--hairline-soft)", fontSize: 14, fontFamily: "inherit", lineHeight: 1.6, resize: "vertical",
};

// Редактор инфо-страниц «Оформление заказа» и «Оплата» (публичные /how-to-order и /payment).
// Тело — простой текст: пустая строка = новый абзац, «## …» = подзаголовок. Слева правка, справа превью.
export default function AdminPagesPage() {
  const [data, setData] = useState<InfoPages>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch<InfoPages>("/info-pages")
      .then((d) => { setData({ order: d.order, payment: d.payment }); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  function setBody(slug: keyof InfoPages, body: string) {
    setData((p) => ({ ...p, [slug]: { ...p[slug], body } }));
    setSaved(false);
  }

  async function save() {
    setSaving(true); setError("");
    try {
      await adminFetch("/info-pages", {
        method: "POST",
        body: JSON.stringify({ order_info_body: data.order.body, payment_body: data.payment.body }),
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally { setSaving(false); }
  }

  const editor = (slug: keyof InfoPages, href: string) => (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <p style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>{data[slug].title}</p>
        <HelpHint text={"Пустая строка — новый абзац. Строка, начинающаяся с «## », — подзаголовок. Переносы строк внутри абзаца сохраняются (удобно для подписи/контактов)."} />
        <a href={href} target="_blank" rel="noopener noreferrer"
          style={{ marginLeft: "auto", fontSize: 13, color: "var(--accent, #003399)" }}>Открыть на сайте ↗</a>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }} className="pages-edit-grid">
        <textarea style={taStyle} value={data[slug].body} onChange={(e) => setBody(slug, e.target.value)} spellCheck={false} />
        <div style={{ border: "1px dashed var(--hairline-soft)", borderRadius: "var(--radius-md)", padding: "14px 16px", background: "var(--surface, #f7f8fa)", minHeight: 220, lineHeight: 1.6 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-tertiary)", marginBottom: 8 }}>Превью</div>
          <InfoPageView title={data[slug].title} body={data[slug].body} />
        </div>
      </div>
    </div>
  );

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Страницы</h1>
        <HelpHint text={"Тексты информационных страниц сайта: «Оформление заказа» и «Оплата». Ссылки на них — в футере сайта."} />
      </div>

      {error && <p className="form-error" style={{ maxWidth: 520, marginBottom: 16 }}>{error}</p>}

      {!loaded ? (
        <p style={{ color: "var(--ink-secondary)" }}>Загрузка…</p>
      ) : (
        <>
          {editor("order", "/how-to-order")}
          {editor("payment", "/payment")}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={save} disabled={saving} type="button" className="btn btn-primary">
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
            {saved && <span style={{ color: "var(--stock, #16794a)", fontSize: 14, fontWeight: 600 }}>✓ Сохранено</span>}
          </div>
        </>
      )}

      {/* На узком экране редактор и превью — в столбик */}
      <style>{`@media (max-width: 900px){ .pages-edit-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </AdminShell>
  );
}
