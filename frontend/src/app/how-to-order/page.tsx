import type { Metadata } from "next";
import { renderBlocks } from "@/components/InfoPageView";

export const metadata: Metadata = { title: "Оформление и оплата заказа" };
// Контент редактируется в админке (/admin/pages) и хранится в БД. Кэш — раз в минуту.
export const revalidate = 60;

const API_BASE = typeof window === "undefined" ? "http://backend:8000/api/v1" : "/api/v1";

interface InfoPage { title: string; body: string }

async function getPages(): Promise<{ order: InfoPage; payment: InfoPage } | null> {
  try {
    const res = await fetch(`${API_BASE}/legal/pages`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const subheadStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: "var(--t-h2)", fontWeight: 700,
  color: "var(--accent)", margin: "0 0 var(--s-4)",
};

// Объединённая страница «Оформление и оплата»: два раздела (Оформление заказа + Оплата)
// с якорями #order/#payment (на «Оплату» ведёт ссылка из футера). Тексты — из /admin/pages.
export default async function OrderAndPaymentPage() {
  const data = await getPages();
  if (!data) {
    return (
      <div className="container section" style={{ maxWidth: 760, margin: "0 auto" }}>
        <p style={{ color: "var(--charcoal)" }}>Не удалось загрузить страницу. Пожалуйста, попробуйте позже.</p>
      </div>
    );
  }
  return (
    <div className="page">
      <div className="band band--hero">
        <div className="container catalog__hero"><h1>Оформление и оплата</h1></div>
      </div>
      <div className="container section prose" style={{ maxWidth: 760, lineHeight: 1.6 }}>
        <section id="order" style={{ scrollMarginTop: "90px" }}>
          <h2 style={subheadStyle}>{data.order.title}</h2>
          {renderBlocks(data.order.body)}
        </section>
        <section id="payment" style={{ scrollMarginTop: "90px", marginTop: "var(--s-10)" }}>
          <h2 style={subheadStyle}>{data.payment.title}</h2>
          {renderBlocks(data.payment.body)}
        </section>
      </div>
    </div>
  );
}
