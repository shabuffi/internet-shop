import type { Metadata } from "next";
import InfoPageView from "@/components/InfoPageView";

export const metadata: Metadata = { title: "Оплата" };
// Содержимое редактируется в админке (/admin/pages) и хранится в БД. Кэш — раз в минуту.
export const revalidate = 60;

const API_BASE = typeof window === "undefined" ? "http://backend:8000/api/v1" : "/api/v1";

async function getPage(): Promise<{ title: string; body: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/legal/pages`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.payment ?? null;
  } catch {
    return null;
  }
}

export default async function PaymentPage() {
  const page = await getPage();
  return (
    <div className="container prose" style={{ maxWidth: 760, margin: "0 auto", padding: "var(--s-8) var(--s-4)", lineHeight: 1.6 }}>
      {page ? (
        <InfoPageView title={page.title} body={page.body} />
      ) : (
        <p style={{ color: "var(--charcoal)" }}>Не удалось загрузить страницу. Пожалуйста, попробуйте позже.</p>
      )}
    </div>
  );
}
