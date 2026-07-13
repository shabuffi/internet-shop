"use client";

import { Suspense, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Куда отправлять поиск и что писать в подсказке. На страницах «Новинки»/«Спецпредложения»
 *  ищем внутри раздела (и в шапке тоже), на остальных — по всему каталогу. */
const SCOPES: Record<string, string> = {
  "/hot": "Поиск в убойных ценах…",
  "/novinki": "Поиск в новинках…",
  "/special": "Поиск в спецпредложениях…",
};
const DEFAULT_PLACEHOLDER = "Поиск: батарейки, носки, ёлка…";

/** Параметры текущей выдачи, которые поиск обязан сохранить (категория, сортировка, вид). */
const PRESERVED = ["category_id", "sort", "view", "photo"] as const;

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
 *  круглая синяя кнопка-лупа (очевидно, что можно нажать).
 *  `hidden` — параметры текущей выдачи (категория, сортировка, вид), которые GET-форма обязана
 *  протащить сама: иначе submit собрал бы URL из одного `search` и сбросил выбор категории.
 *  `resetHref` — куда уйти по крестику, если запрос уже применён (URL без `search`): крестик
 *  должен снимать сам фильтр, а не только очищать текст в поле. */
function SearchForm({ initial, className, action, placeholder, hidden, resetHref }: {
  initial: string; className: string; action: string; placeholder: string;
  hidden: [string, string][]; resetHref: string | null;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  return (
    <form action={action} method="get" className={`search ${className}`.trim()} role="search">
      {hidden.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input ref={inputRef} name="search" value={value} onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder} aria-label="Поиск товаров" autoComplete="off" />
      {value && (
        <button type="button" className="search__clear" aria-label="Очистить поиск"
          onClick={() => {
            setValue("");
            // Запрос уже применён к выдаче → снимаем его, а не только чистим поле.
            if (resetHref) router.push(resetHref);
            else inputRef.current?.focus();
          }}>
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
  const pathname = usePathname();
  const initial = sp.get("search") ?? "";
  // Сохраняем выбранную категорию и настройки выдачи — иначе поиск сбросил бы их до «всех категорий».
  const hidden = PRESERVED.flatMap((k) => {
    const v = sp.get(k);
    return v ? [[k, v] as [string, string]] : [];
  });
  // Крестик снимает только поиск (и пагинацию), категорию/сортировку оставляем.
  let resetHref: string | null = null;
  if (initial) {
    const q = new URLSearchParams(sp.toString());
    q.delete("search");
    q.delete("page");
    const s = q.toString();
    resetHref = s ? `${pathname}?${s}` : pathname;
  }
  // key сбрасывает состояние поля на новое значение из URL после перехода (поиск «липкий»)
  return <SearchForm key={initial} initial={initial} className={className} action={action}
    placeholder={placeholder} hidden={hidden} resetHref={resetHref} />;
}

/** Поиск в шапке и в разделах. Область поиска берём из текущего пути (новинки/спец → внутри
 *  раздела, иначе весь каталог); `action` можно задать явно. `useSearchParams` требует
 *  Suspense — фолбэк рабочая форма с пустым полем. */
export default function HeaderSearch({ className = "", action, unified }: { className?: string; action?: string; unified?: boolean }) {
  // Единый поиск: на «Новинках»/«Спец»/«Убойных» шапка ищет по всему каталогу, а не внутри раздела.
  const scope = unified ? { action: "/catalog", placeholder: DEFAULT_PLACEHOLDER } : scopeFor(usePathname());
  const target = action ?? scope.action;
  const placeholder = scope.placeholder;
  return (
    <Suspense fallback={<SearchForm initial="" className={className} action={target} placeholder={placeholder} hidden={[]} resetHref={null} />}>
      <StickySearch className={className} action={target} placeholder={placeholder} />
    </Suspense>
  );
}
