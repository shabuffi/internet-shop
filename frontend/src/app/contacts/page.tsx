export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { getStoreInfo } from "@/lib/api";

export const metadata: Metadata = { title: "Контакты" };

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
          <div className="eyebrow">Торговый дом</div>
          <h1 style={{ marginTop: "var(--s-3)" }}>Контакты</h1>
        </div>
      </div>

      <div className="container section">
        {cards.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--s-4)" }}>
            {cards.map((c) => (
              <div key={c.label} style={{ background: "var(--paper)", borderRadius: "var(--r-lg)",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,.10), 0 2px 4px -1px rgba(0,0,0,.06)", padding: "var(--s-5)" }}>
                <div style={{ fontSize: "var(--t-xs)", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--graphite)" }}>{c.label}</div>
                <div style={{ marginTop: 6, fontSize: "var(--t-body)", fontWeight: 600 }}>
                  {c.href
                    ? <a href={c.href} style={{ color: "var(--accent)", textDecoration: "none" }}>{c.value}</a>
                    : c.value}
                </div>
              </div>
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
