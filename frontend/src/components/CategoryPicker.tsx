"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface PickerOption {
  id: string;
  name: string;
}

/**
 * Контролируемый выбор категории С ПОИСКОМ (combobox). Тот же паттерн взаимодействия,
 * что и в CategorySelect (кнопка-триггер + popover с полем поиска, click-outside/Escape),
 * но как обычное поле формы: value + onChange, без навигации.
 *
 * excludeIds — id категорий, уже занятых в ДРУГИХ слотах: их прячем из списка, чтобы одну
 * категорию нельзя было выбрать дважды. Текущее значение (value) остаётся видимым всегда.
 */
export default function CategoryPicker({
  value,
  onChange,
  options,
  excludeIds,
  placeholder = "— не выбрана —",
  ariaLabel,
}: {
  value: string;
  onChange: (id: string) => void;
  options: PickerOption[];
  excludeIds?: Set<string>;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentName = value
    ? options.find((o) => o.id === value)?.name ?? "Категория"
    : placeholder;

  // Фильтрация: по названию (регистронезависимо) + прячем занятые в других слотах
  // (кроме собственного текущего значения).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((o) => {
      if (o.id !== value && excludeIds?.has(o.id)) return false;
      if (!q) return true;
      return o.name.toLowerCase().includes(q);
    });
  }, [options, query, excludeIds, value]);

  // Открытие: сразу фокус в поиск (по требованию — поиск доступен немедленно).
  // Закрытие по клику вне панели / Escape.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  const rowBase: React.CSSProperties = {
    display: "block", width: "100%", textAlign: "left", padding: "9px 14px",
    border: "none", background: "transparent", cursor: "pointer", fontSize: 14,
    color: "var(--ink)", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="form-input"
        style={{
          width: "100%", textAlign: "left", cursor: "pointer",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          color: value ? "var(--ink)" : "var(--ink-tertiary)",
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
            background: "var(--canvas, var(--paper))", border: "1px solid var(--hairline)", borderRadius: 10,
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
                width: "100%", height: 38, padding: "0 12px", fontSize: 16,
                border: "1px solid var(--hairline)", borderRadius: 8, background: "var(--canvas, var(--paper))",
                color: "var(--ink)", outline: "none",
              }}
            />
          </div>

          <div style={{ maxHeight: 320, overflowY: "auto", padding: 4 }}>
            {/* Сброс слота */}
            <button type="button" onClick={() => pick("")}
              style={{ ...rowBase, fontWeight: value ? 400 : 700, color: "var(--ink-secondary)",
                background: !value ? "var(--cloud, var(--surface))" : "transparent" }}>
              {placeholder}
            </button>

            {filtered.length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--ink-tertiary)" }}>
                Ничего не найдено
              </div>
            ) : (
              filtered.map((o) => {
                const active = o.id === value;
                return (
                  <button key={o.id} type="button" onClick={() => pick(o.id)} role="option" aria-selected={active}
                    style={{ ...rowBase, fontWeight: active ? 700 : 400,
                      background: active ? "var(--cloud, var(--surface))" : "transparent" }}>
                    {o.name}
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
