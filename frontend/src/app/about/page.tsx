export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { getStoreInfo } from "@/lib/api";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = { title: "О компании" };

const HIGHLIGHTS: { icon: React.ReactNode; big: string; small: string }[] = [
  { big: "с 2016", small: "года на рынке",
    icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6" /><path d="M8.5 13.5 7 22l5-3 5 3-1.5-8.5" /></svg>) },
  { big: "6 областей", small: "регионы доставки",
    icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z" /><path d="M9 3v15M15 6v15" /></svg>) },
  { big: "Ежедневно", small: "новые поступления",
    icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>) },
  { big: "Индивидуально", small: "подход к каждому",
    icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="8" r="4" /></svg>) },
];

export default async function AboutPage() {
  let store;
  try { store = await getStoreInfo(); } catch { store = null; }
  const name = store?.shop_name || "Компания";

  const reqs: { label: string; value?: string }[] = [
    { label: "Юридическое наименование", value: store?.company_legal_name },
    { label: "ИНН", value: store?.company_inn },
    { label: "ОГРН / ОГРНИП", value: store?.company_ogrn },
    { label: "Адрес склада", value: store?.warehouse_address },
    { label: "Часы работы", value: store?.contact_hours },
  ].filter((r) => r.value);

  return (
    <div className="page">
      <div className="band band--hero">
        <div className="container catalog__hero">
          <h1>О компании</h1>
          <p>Оптовый поставщик товаров первой необходимости с 2016 года.</p>
        </div>
      </div>

      <div className="container section" style={{ paddingBottom: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--s-4)" }}>
          {HIGHLIGHTS.map((h, i) => (
            <Reveal key={h.big} delay={i * 70}>
              <div className="lift" style={{ background: "var(--paper)", borderRadius: "var(--r-lg)", height: "100%",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,.10), 0 2px 4px -1px rgba(0,0,0,.06)", padding: "var(--s-5)",
                display: "flex", gap: "var(--s-4)", alignItems: "center" }}>
                <span className="icon-badge">{h.icon}</span>
                <div>
                  <div style={{ fontSize: "var(--t-h3)", fontWeight: 700, color: "var(--accent)", letterSpacing: "-.01em" }}>{h.big}</div>
                  <div style={{ fontSize: "var(--t-sm)", color: "var(--charcoal)" }}>{h.small}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <div className="container section" style={{ maxWidth: 820 }}>
        <div style={{ fontSize: "var(--t-body-lg)", lineHeight: 1.7, color: "var(--charcoal)" }}>
          <p>
            <b style={{ color: "var(--ink)" }}>{name}</b> существует на рынке с 2016 года.
          </p>
          <p style={{ marginTop: "var(--s-4)" }}>
            С момента образования компания специализируется на оптовых поставках товаров первой
            необходимости.
          </p>
          <p style={{ marginTop: "var(--s-4)" }}>
            Товар на склад поступает ежедневно в большом ассортименте и в этот же день
            обрабатывается менеджерами сайта, чтобы покупатели всегда могли видеть новые поступления.
          </p>
          <p style={{ marginTop: "var(--s-4)" }}>
            Компания придерживается индивидуального подхода к каждому клиенту.
          </p>
          <p style={{ marginTop: "var(--s-4)" }}>
            Наш интернет-магазин предлагает всё самое необходимое для дома, дачи и семьи.
          </p>
          <p style={{ marginTop: "var(--s-4)", fontWeight: 600, color: "var(--ink)" }}>
            Спасибо, что Вы с нами!
          </p>
        </div>

        {reqs.length > 0 && (
          <div style={{ marginTop: "var(--s-12)" }}>
            <h2 className="section-title" style={{ fontSize: "var(--t-h3)" }}>Реквизиты</h2>
            <div style={{ display: "grid", gap: 0 }}>
              {reqs.map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-6)",
                  padding: "var(--s-4) 0", borderBottom: "1px solid var(--hairline)" }}>
                  <span style={{ color: "var(--graphite)" }}>{r.label}</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: "var(--s-12)" }}>
          <Link href="/contacts" className="btn btn--primary">Контакты и карта склада →</Link>
        </div>
      </div>
    </div>
  );
}
