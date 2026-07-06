"use client";

import { useState } from "react";

/** Значок «?» рядом с заголовком раздела. На ПК подсказка показывается при наведении,
 *  на телефоне — по нажатию. Текст — краткое пояснение, что это за раздел. */
export default function HelpHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Что это за раздел"
        style={{
          width: 20, height: 20, borderRadius: 999, border: "1px solid var(--hairline-soft)",
          background: "var(--surface, #f0f1f3)", color: "var(--ink-secondary)", cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, padding: 0, lineHeight: 1,
        }}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60,
            display: "block", width: "min(340px, 82vw)", padding: "12px 14px", borderRadius: 10,
            background: "var(--canvas, #fff)", border: "1px solid var(--hairline-soft)",
            boxShadow: "0 10px 28px rgba(0,0,0,.16)", fontSize: 13, fontWeight: 400,
            lineHeight: 1.5, color: "var(--ink-secondary)", whiteSpace: "normal", textTransform: "none",
          }}
        >
          {/* Абзацы разделяются пустой строкой (\n\n) */}
          {text.split("\n\n").map((p, i) => (
            <span key={i} style={{ display: "block", marginTop: i ? 8 : 0 }}>{p}</span>
          ))}
        </span>
      )}
    </span>
  );
}
