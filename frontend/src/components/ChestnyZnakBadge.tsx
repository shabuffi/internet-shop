"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { IconShield } from "@/components/icons";

const TITLE = "Маркировка «Честный знак»";
const TEXT =
  "Товар подлежит обязательной маркировке в национальной системе «Честный знак». " +
  "Юридическим лицам и ИП для оформления заказа может потребоваться подключение к ЭДО " +
  "и регистрация в ГИС МТ «Честный знак».";

// Зелёный значок «Честный знак» перед названием товара. При наведении/фокусе —
// карточка-подсказка (fixed-позиция, чтобы не обрезалась в таблице/плитке с overflow).
export default function ChestnyZnakBadge({ size = 16 }: { size?: number }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const W = 280;

  function show(e: React.MouseEvent | React.FocusEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let left = r.left;
    if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
    setPos({ left: Math.max(8, left), top: r.bottom + 8 });
  }

  return (
    <span
      className="cz-badge"
      role="img"
      tabIndex={0}
      aria-label={`${TITLE}. ${TEXT}`}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onFocus={show}
      onBlur={() => setPos(null)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none",
        width: size + 6, height: size + 6, borderRadius: 6,
        color: "var(--cz-green, #1c8a4e)", background: "var(--cz-green-soft, #e7f6ec)",
        verticalAlign: "text-bottom", cursor: "help", outline: "none",
      }}
    >
      <IconShield style={{ width: size, height: size }} />
      {pos && typeof document !== "undefined" && createPortal(
        <span
          role="tooltip"
          className="cz-tip"
          style={{ position: "fixed", left: pos.left, top: pos.top, width: W, zIndex: 1000 }}
        >
          <b style={{ display: "block", marginBottom: 4, color: "var(--ink, #161A20)" }}>{TITLE}</b>
          <span style={{ color: "var(--charcoal, #4C535E)" }}>{TEXT}</span>
        </span>,
        document.body,
      )}
    </span>
  );
}
