"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Текст согласован с заказчиком (без конкретного числа остатка — подходит и при включённом,
// и при выключенном показе числа `show_stock_qty`).
const TEXT = "Вы заказываете больше, чем сейчас в наличии";
const MAXW = 240;

type Tip = { left: number; top?: number; bottom?: number; arrow: number; place: "top" | "bottom"; width: number };

/**
 * Значок «!» (залитый фирменно-синий кружок, бросается в глаза) + всплывашка
 * «заказываете больше, чем в наличии». Показывается, только когда выбранное количество
 * превышает остаток (`over === true`). Место под значок зарезервировано всегда (слот 22px) —
 * габариты карточки не меняются.
 *
 * Всплывашка рендерится через ПОРТАЛ в document.body и позиционируется `position:fixed` от
 * координат значка. Портал важен: если рендерить в потоке, а у какого-то родителя есть
 * `transform` (анимации/степперы), `fixed` считается относительно него, и всплывашка уезжает
 * узкой полоской за край. Ширина ограничена шириной окна, поэтому текст всегда влезает целиком;
 * если сверху мало места — всплывашка встаёт снизу.
 */
export default function StockWarningHint({ over }: { over: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  // Значение `over` с прошлого рендера — чтобы поймать переход «стало больше остатка»
  // и один раз сразу показать текст. Инициализируем текущим, чтобы НЕ авто-открывать на маунте
  // (иначе у всех уже-превышенных позиций всплывашки раскроются при заходе на страницу).
  const prevOver = useRef(over);

  function open() {
    const el = ref.current;
    // offsetParent === null → элемент (или предок) display:none: это скрытый адаптивный дубль
    // (в списке одновременно есть десктоп-таблица и мобильные строки) — его не открываем.
    if (!el || el.offsetParent === null) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.min(MAXW, vw - 16);
    const center = r.left + r.width / 2;
    const left = Math.min(Math.max(center - width / 2, 8), vw - width - 8);
    const arrow = Math.min(Math.max(center - left, 16), width - 16);
    if (r.top > 130) setTip({ left, bottom: vh - r.top + 8, arrow, place: "top", width });
    else setTip({ left, top: r.bottom + 8, arrow, place: "bottom", width });
  }
  const close = () => setTip(null);

  // Первый раз, когда количество стало больше остатка — сразу показываем текст (без наведения).
  // Дальше убирается действием (клик вне / скролл) и снова появляется по наведению.
  useEffect(() => {
    if (over && !prevOver.current) open();
    prevOver.current = over;
  }, [over]);

  // Пока открыта: закрываем при скролле/ресайзе (fixed-координаты иначе «отклеятся») и по
  // клику вне значка (это и есть «действие, которым убирается» авто-показанная всплывашка).
  useEffect(() => {
    if (!tip) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && ref.current.contains(e.target as Node)) return;
      close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("click", onDocClick);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("click", onDocClick);
    };
  }, [tip]);

  return (
    <span
      style={{ position: "relative", display: "inline-flex", width: 22, height: 22, flex: "0 0 auto", verticalAlign: "middle" }}
      onMouseEnter={() => over && open()}
      onMouseLeave={close}
    >
      {over && (
        <button
          ref={ref}
          type="button"
          aria-label={TEXT}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); tip ? close() : open(); }}
          onBlur={close}
          style={{
            width: 22, height: 22, borderRadius: "50%", padding: 0, cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "var(--accent)", color: "#fff", border: "none",
            font: "800 14px/1 system-ui, sans-serif", boxShadow: "0 1px 3px rgba(0,51,153,.35)",
          }}
        >
          !
        </button>
      )}
      {over && tip && typeof document !== "undefined" && createPortal(
        <span
          role="tooltip"
          style={{
            position: "fixed", left: tip.left, top: tip.top, bottom: tip.bottom, width: tip.width,
            boxSizing: "border-box", background: "var(--accent)", color: "#fff", fontSize: 13,
            lineHeight: 1.4, fontWeight: 500, padding: "10px 12px", borderRadius: 10,
            boxShadow: "0 10px 24px rgba(0,51,153,.32)", textAlign: "left", whiteSpace: "normal",
            zIndex: 2000, pointerEvents: "none",
          }}
        >
          {TEXT}
          <span
            style={{
              position: "absolute", left: tip.arrow - 6, width: 0, height: 0,
              border: "6px solid transparent",
              ...(tip.place === "top"
                ? { top: "100%", borderTopColor: "var(--accent)" }
                : { bottom: "100%", borderBottomColor: "var(--accent)" }),
            }}
          />
        </span>,
        document.body,
      )}
    </span>
  );
}
