"use client";

import { useState } from "react";
import { CZ_TITLE, CZ_TEXT, CZ_URL } from "@/components/ChestnyZnakModal";

type Variant = "product" | "cart" | "checkout";

// Блок с пояснением о маркировке (официальный знак жёлтый+чёрный + единый текст).
//   product  — в зоне покупки на странице товара;
//   cart     — уведомление сверху корзины (можно скрыть на сессию);
//   checkout — компактное напоминание в сводке заказа.
export default function ChestnyZnakNotice({
  variant = "product",
  count,
}: {
  variant?: Variant;
  count?: number;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const compact = variant === "checkout";
  const title =
    variant === "cart"
      ? "В корзине есть товары с маркировкой ЧЕСТНЫЙ ЗНАК"
      : variant === "checkout"
      ? "В заказе есть товары с маркировкой ЧЕСТНЫЙ ЗНАК"
      : CZ_TITLE;

  return (
    <div
      className={"cz-panel" + (compact ? " cz-panel--compact" : "") + (variant === "cart" ? " cz-panel--dismissible" : "")}
      role="note"
    >
      <img className="cz-panel__logo" src="/chestny-znak-icon.svg" alt="" aria-hidden="true" />
      <div className="cz-panel__body">
        <strong className="cz-panel__title">
          {title}
          {variant === "cart" && count ? ` · ${count}` : ""}
        </strong>
        <span>{CZ_TEXT}</span>
        {!compact && (
          <a className="cz-panel__more" href={CZ_URL} target="_blank" rel="noopener noreferrer">
            Подробнее о маркировке →
          </a>
        )}
      </div>
      {variant === "cart" && (
        <button type="button" className="cz-panel__close" aria-label="Скрыть уведомление" onClick={() => setDismissed(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
