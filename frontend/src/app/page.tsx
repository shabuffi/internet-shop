export const dynamic = "force-dynamic";

import Link from "next/link";
import LeadForm from "@/components/LeadForm";

// Иконки-плитки категорий (простые штриховые)
const tileIcon: Record<string, React.ReactNode> = {
  chem: (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6M10 3v5L5 19a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-11V3" /><path d="M7.5 14h9" /></svg>),
  home: (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>),
  garden: (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V11" /><path d="M12 11c0-4 3-7 8-7 0 4-3 7-8 7Z" /><path d="M12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5Z" /></svg>),
  tools: (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2 2.3-2.3Z" /></svg>),
};

const TILES = [
  { key: "chem", title: "Бытовая химия", note: "Чистящие, моющие, гигиена" },
  { key: "home", title: "Хозтовары", note: "Для дома и уборки" },
  { key: "garden", title: "Сад и дача", note: "Семена, удобрения, сезон" },
  { key: "tools", title: "Инструмент и авто", note: "Метизы, авто-товары" },
];

const TRUST = [
  { big: "Тысячи", small: "товаров со склада" },
  { big: "4 области", small: "доставка по региону" },
  { big: "Прайс", small: "по запросу" },
  { big: "−10%", small: "на первый заказ" },
];

const REGIONS = ["Тверская область", "Московская область", "Смоленская область", "Новгородская область"];

export default function HomePage() {
  return (
    <div className="page">
      {/* Hero */}
      <section style={{
        position: "relative",
        background: "linear-gradient(105deg, rgba(0,30,90,.92) 0%, rgba(0,51,153,.86) 45%, rgba(0,51,153,.55) 100%), url('/hero.jpg') center/cover no-repeat, var(--accent-deep)",
        color: "#fff",
      }}>
        <div className="container" style={{ paddingTop: "var(--s-20)", paddingBottom: "var(--s-20)" }}>
          <div style={{ maxWidth: 720 }}>
            <div className="eyebrow" style={{ color: "rgba(255,255,255,.8)" }}>Оптовый поставщик</div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-display)", lineHeight: 1.07,
              letterSpacing: "-.015em", margin: "var(--s-3) 0 0", color: "#fff" }}>
              Хозтовары, бытовая химия и товары для дома и дачи — оптом
            </h1>
            <p style={{ fontSize: "var(--t-body-lg)", lineHeight: 1.6, margin: "var(--s-5) 0 0", color: "rgba(255,255,255,.9)", maxWidth: 600 }}>
              Доставка по Тверской, Московской, Смоленской и Новгородской областям. Тысячи позиций со склада,
              удобный бланк заказа и быстрая отгрузка для магазинов.
            </p>
            <div style={{ display: "flex", gap: "var(--s-3)", marginTop: "var(--s-8)", flexWrap: "wrap" }}>
              <LeadForm />
              <Link href="/catalog" className="btn btn--lg" style={{ background: "#fff", color: "var(--accent)" }}>
                Перейти в каталог
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Полоса доверия */}
      <div className="band">
        <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "var(--s-6)", paddingTop: "var(--s-8)", paddingBottom: "var(--s-8)" }}>
          {TRUST.map((t) => (
            <div key={t.small} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.01em", color: "var(--accent)" }}>{t.big}</div>
              <div style={{ fontSize: "var(--t-sm)", color: "var(--charcoal)", marginTop: 4 }}>{t.small}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Категории */}
      <div className="container section">
        <h2 className="section-title">Категории товаров</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--s-4)" }}>
          {TILES.map((t) => (
            <Link key={t.key} href="/catalog" style={{ textDecoration: "none", color: "var(--ink)",
              background: "var(--paper)", borderRadius: "var(--r-xl)", padding: "var(--s-6)",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,.10), 0 2px 4px -1px rgba(0,0,0,.06)",
              display: "flex", flexDirection: "column", gap: "var(--s-3)", transition: "transform .2s ease, box-shadow .2s ease" }}>
              <span style={{ width: 56, height: 56, borderRadius: "var(--r-lg)", background: "var(--accent-soft)",
                color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {tileIcon[t.key]}
              </span>
              <span style={{ fontWeight: 600, fontSize: "var(--t-h3)" }}>{t.title}</span>
              <span style={{ fontSize: "var(--t-sm)", color: "var(--graphite)" }}>{t.note}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Доставка */}
      <div className="band">
        <div className="container section">
          <h2 className="section-title">Доставка по регионам</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--s-4)", marginBottom: "var(--s-8)" }}>
            {REGIONS.map((r) => (
              <div key={r} style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", background: "var(--paper)",
                borderRadius: "var(--r-lg)", padding: "var(--s-4) var(--s-5)", fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--accent-2)", flex: "none" }} />
                {r}
              </div>
            ))}
          </div>
          <LeadForm label="Узнать условия и получить прайс" />
        </div>
      </div>
    </div>
  );
}
