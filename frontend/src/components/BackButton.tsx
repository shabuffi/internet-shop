"use client";

import { useRouter } from "next/navigation";

/**
 * Кнопка выхода со страницы товара: возвращает на предыдущую страницу (каталог с
 * фильтрами/прокруткой), а при прямом заходе по ссылке — в каталог.
 */
export default function BackButton({ fallback = "/catalog", label = "Назад" }: {
  fallback?: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="chip"
      style={{ marginBottom: "var(--s-4)", cursor: "pointer" }}
      aria-label={label}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      {label}
    </button>
  );
}
