"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Обёртка-карусель для лент товаров на главной: сама лента остаётся `.promo-grid`
 *  (горизонтальный скролл + свайп на телефоне), а поверх — круглые стрелки ‹ ›
 *  для листания на десктопе. Стрелки прячутся у краёв и если товары помещаются целиком. */
export default function PromoCarousel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <div className="promo-carousel">
      <button
        type="button"
        className="promo-nav promo-nav--prev"
        aria-label="Предыдущие товары"
        onClick={() => scroll(-1)}
        hidden={!canPrev}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <div className="promo-grid" ref={ref}>{children}</div>
      <button
        type="button"
        className="promo-nav promo-nav--next"
        aria-label="Следующие товары"
        onClick={() => scroll(1)}
        hidden={!canNext}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </button>
    </div>
  );
}
