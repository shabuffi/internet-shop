import type { Metadata } from "next";
import PolicyView, { type PolicyOperator } from "@/components/PolicyView";

export const metadata: Metadata = {
  title: "Политика обработки персональных данных",
  robots: { index: false, follow: true },
};

// Содержимое политики редактируется в админке (/admin/policy) и хранится в БД.
// Тянем на сервере; обновление кэша — раз в минуту (контент меняется редко).
export const revalidate = 60;

interface PolicyData {
  body: string;
  revision: string;
  operator: PolicyOperator;
}

// Внутри Docker-сети SSR ходит к backend по имени сервиса; в браузере этот код не исполняется.
const API_BASE =
  typeof window === "undefined" ? "http://backend:8000/api/v1" : "/api/v1";

async function getPolicy(): Promise<PolicyData | null> {
  try {
    const res = await fetch(`${API_BASE}/legal/privacy`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function OfferPage() {
  const policy = await getPolicy();

  return (
    <div
      className="container prose"
      style={{ maxWidth: 760, margin: "0 auto", padding: "var(--s-8) var(--s-4)", lineHeight: 1.6 }}
    >
      {policy ? (
        <PolicyView body={policy.body} operator={policy.operator} revision={policy.revision} />
      ) : (
        <p style={{ color: "var(--charcoal)" }}>
          Не удалось загрузить политику. Пожалуйста, попробуйте позже.
        </p>
      )}
    </div>
  );
}
