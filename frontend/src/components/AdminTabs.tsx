"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AdminTab {
  id: string;
  label: string;
}

/**
 * Полоса вкладок админки. Пока вкладки влезают — обычный ряд; как только перестают,
 * превращается в горизонтальную карусель со стрелками (список вкладок будет расти).
 *
 * Активную вкладку не хранит — это делает страница, чтобы вкладка жила в URL.
 */
export default function AdminTabs({
  tabs, active, onChange,
}: {
  tabs: AdminTab[];
  active: string;
  onChange: (id: string) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  // Показывать ли стрелки: считаем по факту переполнения, а не по количеству вкладок —
  // ширина зависит от подписей и от окна.
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setOverflow({
      left: el.scrollLeft > 1,
      right: max > 1 && el.scrollLeft < max - 1,
    });
  }, []);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    measure();
    // ResizeObserver, а не resize окна: боковое меню админки сворачивается и меняет
    // ширину контента без изменения размера окна.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Слушатель ловит ЖИВУЮ прокрутку — колесо, тачпад, палец. На программную полагаться
    // нельзя: замерено, что присваивание scrollLeft не породило ни одного события scroll,
    // поэтому там, где двигаем полосу сами, measure() вызывается явно (см. scroll и эффект
    // с scrollIntoView ниже).
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure, tabs.length]);

  // Вкладку могли открыть по ссылке — если она уехала за край, подтягиваем её в видимую часть.
  useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(active)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();   // прокрутка мгновенная, поэтому меряем сразу — иначе стрелки останутся от старой позиции
  }, [active, measure]);

  /** Стрелками ходим по вкладкам, Home/End — на края. Раз уж объявлен `role="tablist"`,
   *  клавиатура обязана вести себя так, как этого ждёт скринридер. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step: Record<string, number | undefined> = { ArrowLeft: -1, ArrowRight: 1 };
    const move = step[e.key];
    const i = tabs.findIndex((t) => t.id === active);
    let next = -1;
    if (move !== undefined) next = (i + move + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    stripRef.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(tabs[next].id)}"]`)?.focus();
  };

  // Прокрутка намеренно мгновенная, без `behavior: "smooth"` и без CSS `scroll-behavior`.
  // Проверено на живой странице: где плавная прокрутка отключена, она не «вырождается в
  // мгновенную», а не делает ВООБЩЕ ничего — стрелки становятся мёртвыми кнопками, а
  // scrollIntoView перестаёт подтягивать вкладку, открытую по ссылке. Анимация того не стоит.
  const scroll = (dir: -1 | 1) => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollLeft += dir * 220;
    // Меряем сами: программная прокрутка события `scroll` не гарантирует (проверено —
    // бывает, что не приходит вовсе), и стрелки застряли бы в виде от прошлой позиции.
    // Слушатель выше остаётся для живой прокрутки колесом/тачпадом.
    measure();
  };

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", marginBottom: 24 }}>
      {overflow.left && <Arrow dir={-1} onClick={() => scroll(-1)} />}

      <div
        ref={stripRef}
        role="tablist"
        aria-label="Разделы настройки сайта"
        onKeyDown={onKeyDown}
        style={{
          display: "flex", gap: 4, overflowX: "auto", scrollbarWidth: "none",
          borderBottom: "1px solid var(--hairline-soft)", width: "100%",
        }}
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              data-tab={t.id}
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              // Roving tabindex: Tab заводит в полосу один раз, дальше — стрелками.
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.id)}
              style={{
                flex: "0 0 auto", padding: "10px 14px", border: "none", background: "none",
                cursor: "pointer", fontSize: 14, fontWeight: on ? 700 : 500, whiteSpace: "nowrap",
                color: on ? "var(--accent)" : "var(--ink-secondary)",
                // Подчёркивание рисуем всегда, прозрачным — иначе при выборе вкладки
                // полоса «прыгает» на 2px.
                borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`,
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {overflow.right && <Arrow dir={1} onClick={() => scroll(1)} />}
    </div>
  );
}

/** Стрелка карусели. Лежит поверх края полосы, поэтому вкладки под ней притенены градиентом. */
function Arrow({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  const side = dir === -1 ? { left: 0 } : { right: 0 };
  return (
    <button
      onClick={onClick}
      aria-label={dir === -1 ? "Прокрутить вкладки влево" : "Прокрутить вкладки вправо"}
      style={{
        position: "absolute", ...side, top: 0, bottom: 1, zIndex: 1,
        width: 36, border: "none", cursor: "pointer", color: "var(--ink-secondary)",
        display: "flex", alignItems: "center", justifyContent: dir === -1 ? "flex-start" : "flex-end",
        background: `linear-gradient(to ${dir === -1 ? "right" : "left"},
          var(--canvas) 45%, transparent)`,
      }}
    >
      {dir === -1 ? "‹" : "›"}
    </button>
  );
}
