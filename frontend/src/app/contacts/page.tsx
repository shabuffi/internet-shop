export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { getStoreInfo } from "@/lib/api";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = { title: "Контакты" };

// Иконки контактов — SVG заказчика (телефон-в-круге, конверт со стрелкой, склад-метка, часы),
// перекрашены в фирменный синий, viewBox обрезан по содержимому. Файлы в /public/contacts.
const cIcon = (src: string) => <img src={src} alt="" style={{ width: 26, height: 26, objectFit: "contain", display: "block" }} />;
const icon: Record<string, React.ReactNode> = {
  Телефон: cIcon("/contacts/phone.svg"),
  "E-mail": cIcon("/contacts/mail.svg"),
  "Адрес склада": cIcon("/contacts/address.svg"),
  "Часы работы": cIcon("/contacts/hours.svg"),
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "var(--s-4)" }}>
            {cards.map((c, i) => (
              <Reveal key={c.label} delay={i * 70}>
                <div className="lift" style={{ background: "var(--paper)", borderRadius: "var(--r-lg)", height: "100%",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,.10), 0 2px 4px -1px rgba(0,0,0,.06)", padding: "var(--s-5)",
                  display: "flex", gap: "var(--s-4)", alignItems: "flex-start" }}>
                  <span className="icon-badge">{icon[c.label]}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "var(--t-xs)", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--graphite)" }}>{c.label}</div>
                    <div style={{ marginTop: 6, fontSize: "var(--t-sm)", fontWeight: 600, overflowWrap: "anywhere" }}>
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
