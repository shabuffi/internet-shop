"use client";

import { Suspense, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Куда отправлять поиск и что писать в подсказке. На страницах «Новинки»/«Спецпредложения»
 *  ищем внутри раздела (и в шапке тоже), на остальных — по всему каталогу. */
const SCOPES: Record<string, string> = {
  "/novinki": "Поиск в новинках…",
  "/special": "Поиск в спецпредложениях…",
};
const DEFAULT_PLACEHOLDER = "Поиск: батарейки, носки, ёлка…";

function scopeFor(pathname: string | null): { action: string; placeholder: string } {
  const hit = Object.keys(SCOPES).find((p) => pathname?.startsWith(p));
  return hit ? { action: hit, placeholder: SCOPES[hit] } : { action: "/catalog", placeholder: DEFAULT_PLACEHOLDER };
}

function SearchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: "block" }}>
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

/** Форма поиска: GET на `action` (по умолчанию /catalog; на страницах «Новинки»/«Спец» —
 *  их же путь, чтобы искать внутри раздела). Поле контролируемое — показываем крестик очистки,
 *  когда есть ввод; значение «липкое» (инициализируется текущим запросом из URL). Справа —
 *  круглая синяя кнопка-лупа (очевидно, что можно нажать). */
function SearchForm({ initial, className, action, placeholder }: {
  initial: string; className: string; action: string; placeholder: string;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <form action={action} method="get" className={`search ${className}`.trim()} role="search">
      <input ref={inputRef} name="search" value={value} onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder} aria-label="Поиск товаров" autoComplete="off" />
      {value && (
        <button type="button" className="search__clear" aria-label="Очистить"
          onClick={() => { setValue(""); inputRef.current?.focus(); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
        </button>
      )}
      <button type="submit" className="search__btn" aria-label="Найти">
        <SearchIcon />
      </button>
    </form>
  );
}

function StickySearch({ className, action, placeholder }: { className: string; action: string; placeholder: string }) {
  const sp = useSearchParams();
  const initial = sp.get("search") ?? "";
  // key сбрасывает состояние поля на новое значение из URL после перехода (поиск «липкий»)
  return <SearchForm key={initial} initial={initial} className={className} action={action} placeholder={placeholder} />;
}

/** Поиск в шапке и в разделах. Область поиска берём из текущего пути (новинки/спец → внутри
 *  раздела, иначе весь каталог); `action` можно задать явно. `useSearchParams` требует
 *  Suspense — фолбэк рабочая форма с пустым полем. */
export default function HeaderSearch({ className = "", action }: { className?: string; action?: string }) {
  const scope = scopeFor(usePathname());
  const target = action ?? scope.action;
  const placeholder = scope.placeholder;
  return (
    <Suspense fallback={<SearchForm initial="" className={className} action={target} placeholder={placeholder} />}>
      <StickySearch className={className} action={target} placeholder={placeholder} />
    </Suspense>
  );
}
