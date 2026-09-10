"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import ChestnyZnakModal, { CZ_TITLE, CZ_TEXT } from "@/components/ChestnyZnakModal";

// Официальные ассеты из набора «лого» (жёлтый + чёрный):
//   /chestny-znak.svg      — логотип-локап (знак + «честный ЗНАК»);
//   /chestny-znak-icon.svg — только знак (квадрат).
// variant="sticker" — логотип-оверлей поверх фото товара (плитка каталога): подсказка при наведении,
//                     клик уходит на ссылку карточки;
// variant="icon"    — только знак (список каталога, корзина) → по клику попап, наведение — подсказка;
// variant="mark"    — статичный логотип (рядом с наличием на странице товара).
// `size` — высота в px.
export default function ChestnyZnakBadge({
  variant = "icon",
  size,
}: {
  variant?: "sticker" | "icon" | "mark";
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const W = 260;
  const h = size ?? (variant === "sticker" ? 26 : variant === "mark" ? 32 : 22);
  const isIcon = variant === "icon";

  const img = (
    <img
      className="cz-logo"
      src={isIcon ? "/chestny-znak-icon.svg" : "/chestny-znak.svg"}
      alt={CZ_TITLE}
      style={{ height: h }}
    />
  );

  // Статичный логотип — без интерактива.
  if (variant === "mark") return <span className="cz-mark">{img}</span>;

  function showTip(e: React.MouseEvent | React.FocusEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let left = r.left;
    if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
    setPos({ left: Math.max(8, left), top: r.bottom + 8 });
  }
  const hide = () => setPos(null);

  const tip = pos && typeof document !== "undefined" && createPortal(
    <span role="tooltip" className="cz-tip" style={{ position: "fixed", left: pos.left, top: pos.top, width: W, zIndex: 1000 }}>
      <b style={{ display: "block", marginBottom: 4, color: "var(--ink, #161A20)" }}>{CZ_TITLE}</b>
      <span style={{ color: "var(--charcoal, #4C535E)" }}>{CZ_TEXT}</span>
    </span>,
    document.body,
  );

  // Оверлей на фото — некликабельный (клик уходит на ссылку карточки), только подсказка.
  if (variant === "sticker") {
    return (
      <>
        <span className="cz-sticker" role="img" aria-label={CZ_TITLE} tabIndex={0}
          onMouseEnter={showTip} onMouseLeave={hide} onFocus={showTip} onBlur={hide}>
          {img}
        </span>
        {tip}
      </>
    );
  }

  return (
    <>
      <button type="button" className="cz-icon" aria-label={`${CZ_TITLE}. ${CZ_TEXT}`}
        onClick={() => { setOpen(true); hide(); }}
        onMouseEnter={showTip} onMouseLeave={hide} onFocus={showTip} onBlur={hide}>
        {img}
      </button>
      {tip}
      <ChestnyZnakModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
