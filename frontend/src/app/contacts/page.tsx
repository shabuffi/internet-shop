export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { getStoreInfo } from "@/lib/api";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = { title: "Контакты" };

// Иконки контактов (в стиле присланных заказчиком: телефон в круге с волной, конверт со
// стрелкой, метка, часы) — чёткий SVG в фирменном цвете (currentColor).
const icon: Record<string, React.ReactNode> = {
  Телефон: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8.7 7.8c.34-.34.9-.31 1.2.06l.9 1.16c.21.28.23.66.04.96l-.57.85a6.6 6.6 0 0 0 2.93 2.93l.85-.57c.3-.19.68-.17.96.04l1.16.9c.37.3.4.86.06 1.2l-.48.48c-.45.45-1.12.61-1.73.4a10.6 10.6 0 0 1-6.4-6.4c-.21-.61-.05-1.28.4-1.73z" /><path d="M14.2 8.1a2.9 2.9 0 0 1 1.9 1.9" /></svg>),
  "E-mail": (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="m3.5 7.5 6 4.1 6-4.1" /><path d="M16.6 6.4 21 3M21 3l-3.3.7M21 3l-.7 3.3" /></svg>),
  "Адрес склада": (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>),
  "Часы работы": (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5l3.2 1.9" /></svg>),
};

export default async function ContactsPage() {
  let store;
  try { store = await getStoreInfo(); } catch { store = null; }

  const phone = store?.contact_phone || "";
  const email = store?.contact_email || "";
  const address = store?.warehouse_address || "";
  const hours = store?.contact_hours || "";

  // Карта: если заданы координаты «широта, долгота» — ставим аккуратную метку по ним
  // (без поиска и кнопок «Организации в доме»). Иначе — поиск по адресу (как раньше).
  const coordsMatch = (store?.warehouse_coords || "").match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  const mapSrc = coordsMatch
    ? `https://yandex.ru/map-widget/v1/?ll=${coordsMatch[2]},${coordsMatch[1]}&z=16&pt=${coordsMatch[2]},${coordsMatch[1]},pm2rdm`
    : `https://yandex.ru/map-widget/v1/?text=${encodeURIComponent(address)}&z=15`;
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
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "var(--t-xs)", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--graphite)" }}>{c.label}</div>
                    <div style={{ marginTop: 6, fontSize: "var(--t-body)", fontWeight: 600, overflowWrap: "anywhere" }}>
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
              src={mapSrc}
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
