"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: "block" }}>
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

/** Форма поиска: GET на /catalog (работает без JS). `value` — текущий запрос, показываем
 *  его в поле, чтобы после поиска он не пропадал. Справа — явная кнопка «Найти» (лупа). */
function SearchForm({ value, className }: { value: string; className: string }) {
  return (
    <form action="/catalog" method="get" className={`search ${className}`.trim()} role="search">
      {/* key сбрасывает поле на новое значение из URL после перехода */}
      <input key={value} name="search" defaultValue={value}
        placeholder="Поиск: батарейки, носки, ёлка…" aria-label="Поиск товаров" />
      <button type="submit" className="search__btn" aria-label="Найти">
        <SearchIcon />
      </button>
    </form>
  );
}

function StickySearch({ className }: { className: string }) {
  const sp = useSearchParams();
  return <SearchForm value={sp.get("search") ?? ""} className={className} />;
}

/** Поиск в шапке. Значение «липкое» (берём из URL). `useSearchParams` требует Suspense —
 *  оборачиваем, фолбэк — рабочая форма с пустым полем (поиск доступен и до гидрации). */
export default function HeaderSearch({ className = "" }: { className?: string }) {
  return (
    <Suspense fallback={<SearchForm value="" className={className} />}>
      <StickySearch className={className} />
    </Suspense>
  );
}
