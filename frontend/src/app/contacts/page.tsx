export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { getStoreInfo } from "@/lib/api";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = { title: "Контакты" };

const icon: Record<string, React.ReactNode> = {
  Телефон: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.5-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z" /></svg>),
  "E-mail": (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>),
  "Адрес склада": (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>),
  "Часы работы": (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>),
};

export default async function ContactsPage() {
  let store;
  try { store = await getStoreInfo(); } catch { store = null; }

  const phone = store?.contact_phone || "";
  const email = store?.contact_email || "";
  const address = store?.warehouse_address || "";
  const hours = store?.contact_hours || "";
  const telHref = phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : "";

  const cards: { label: string; value: string; href?: string }[] = [
    phone && { label: "Телефон", value: phone, href: telHref },
    email && { label: "E-mail", value: email, href: `mailto:${email}` },
    address && { label: "Адрес склада", value: address },
    hours && { label: "Часы работы", value: hours },
  ].filter(Boolean) as { label: string; value: string; href?: string }[];

  return (
    <div className="page">
      <div className="band band--hero">
        <div className="container catalog__hero">
          <h1>Контакты</h1>
          <p>Звоните или пишите — поможем с заказом и доставкой в рабочее время.</p>
        </div>
      </div>

      <div className="container section">
        {cards.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--s-4)" }}>
            {cards.map((c, i) => (
              <Reveal key={c.label} delay={i * 70}>
                <div className="lift" style={{ background: "var(--paper)", borderRadius: "var(--r-lg)", height: "100%",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,.10), 0 2px 4px -1px rgba(0,0,0,.06)", padding: "var(--s-5)",
                  display: "flex", gap: "var(--s-4)", alignItems: "flex-start" }}>
                  <span className="icon-badge">{icon[c.label]}</span>
                  <div>
                    <div style={{ fontSize: "var(--t-xs)", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--graphite)" }}>{c.label}</div>
                    <div style={{ marginTop: 6, fontSize: "var(--t-body)", fontWeight: 600 }}>
                      {c.href
                        ? <a href={c.href} style={{ color: "var(--accent)", textDecoration: "none" }}>{c.value}</a>
                        : c.value}
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--charcoal)" }}>Контактные данные скоро появятся.</p>
        )}

        {address ? (
          <div style={{ marginTop: "var(--s-8)", borderRadius: "var(--r-lg)", overflow: "hidden", border: "1px solid var(--hairline)" }}>
            <iframe
              title="Карта склада"
              src={`https://yandex.ru/map-widget/v1/?text=${encodeURIComponent(address)}&z=15`}
              width="100%" height="420" frameBorder="0" style={{ display: "block", border: 0 }}
              loading="lazy"
            />
          </div>
        ) : (
          <p style={{ marginTop: "var(--s-8)", color: "var(--graphite)", fontSize: "var(--t-sm)" }}>
            Карта проезда появится после указания адреса склада.
          </p>
        )}
      </div>
    </div>
  );
}
