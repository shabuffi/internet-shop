"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Category } from "@/types/product";
import { matchesSearch, searchWords } from "@/lib/search";

// Выпадающий выбор категории С ПОИСКОМ (при сотнях категорий листать неудобно).
// Триггер выглядит как поле; по клику открывается панель с поиском и списком.
export default function CategorySelect({ categories, current, search, view, sort, photo }: {
  categories: Category[];
  current?: string;
  search?: string;
  view?: string;
  sort?: string;
  photo?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const currentName = current
    ? categories.find((c) => c.id === current)?.name ?? "Категория"
    : "Все категории";

  // Фильтрация по названию: регистр не важен, е ≡ ё, слова в любом порядке («бумага туалетная»
  // находит «Туалетная бумага»). «Все категории» всегда доступны сверху.
  const filtered = useMemo(() => {
    const words = searchWords(query);
    if (!words.length) return categories;
    return categories.filter((c) => matchesSearch(c.name, words));
  }, [categories, query]);

  // Клик вне панели / Escape — закрыть.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    // Автофокус НЕ ставим: на телефоне это сразу открывало бы клавиатуру и «раздвигало»
    // экран. Пользователь сам тапнет поле поиска категории, если захочет отфильтровать.
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // При открытии подкручиваем список к выбранной категории и ставим её примерно по центру
  // области прокрутки: при сотнях категорий выбранная иначе оказывается далеко за экраном.
  // scrollIntoView не используем — он прокручивает и предков (страница «уехала» бы под попапом).
  useEffect(() => {
    if (!open) return;
    const box = listRef.current;
    const el = activeRef.current;
    if (!box || !el) return;
    const delta = el.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTop += delta - (box.clientHeight - el.offsetHeight) / 2;   // браузер сам зажмёт в границы
  }, [open]);

  function select(cid: string) {
    const q = new URLSearchParams();
    if (cid) q.set("category_id", cid);
    if (search) q.set("search", search);
    if (view) q.set("view", view);
    if (sort) q.set("sort", sort);
    if (photo) q.set("photo", "1");
    setOpen(false);
    setQuery("");
    const s = q.toString();
    router.push(s ? `/catalog?${s}` : "/catalog");
  }

  const rowBase: React.CSSProperties = {
    display: "block", width: "100%", textAlign: "left", padding: "9px 14px",
    border: "none", background: "transparent", cursor: "pointer", fontSize: 14,
    color: "var(--ink)", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", minWidth: 220, maxWidth: "100%" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Категория"
        style={{
          height: 40, width: "100%", padding: "0 36px 0 14px", textAlign: "left",
          border: "1px solid color-mix(in srgb, var(--accent), #fff 55%)", borderRadius: 10, background: "var(--paper)",
          color: "var(--ink)", fontSize: 14, fontWeight: 500, cursor: "pointer",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          appearance: "none", WebkitAppearance: "none",
          backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
          backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
        }}
      >
        {currentName}
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute", zIndex: 50, top: "calc(100% + 4px)", left: 0,
            width: "min(340px, 88vw)", maxWidth: "88vw",
            background: "var(--paper)", border: "1px solid var(--hairline)", borderRadius: 10,
            boxShadow: "0 12px 32px rgba(0,0,0,.16)", overflow: "hidden",
          }}
        >
          <div style={{ padding: 8, borderBottom: "1px solid var(--hairline-soft)" }}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск категории…"
              aria-label="Поиск категории"
              style={{
                width: "100%", height: 38, padding: "0 12px", fontSize: 16,   /* 16px — чтобы iOS не зумил экран при фокусе */
                border: "1px solid var(--hairline)", borderRadius: 8, background: "var(--paper)",
                color: "var(--ink)", outline: "none",
              }}
            />
          </div>

          <div ref={listRef} style={{ maxHeight: 320, overflowY: "auto", padding: 4 }}>
            {/* «Все категории» всегда доступны для сброса */}
            <button type="button" onClick={() => select("")}
              style={{ ...rowBase, fontWeight: current ? 500 : 700,
                background: !current ? "var(--cloud)" : "transparent" }}>
              Все категории
            </button>

            {filtered.length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--ink-tertiary)" }}>
                Ничего не найдено
              </div>
            ) : (
              filtered.map((c) => {
                const active = c.id === current;
                // Отступ по глубине — только когда НЕ идёт поиск (в плоском результате не нужен).
                const pad = !query.trim() && (c.depth ?? 0) > 0 ? "    ".repeat(c.depth ?? 0) + "└ " : "";
                return (
                  <button key={c.id} type="button" onClick={() => select(c.id)} role="option" aria-selected={active}
                    ref={active ? activeRef : undefined}
                    style={{ ...rowBase, fontWeight: active ? 700 : 400,
                      background: active ? "var(--cloud)" : "transparent" }}>
                    {pad}{c.name}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
