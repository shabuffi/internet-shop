"use client";

import { useEffect, useRef, useState } from "react";
import { IconPlus, IconTrash } from "@/components/icons";
import {
  formatPromoIcon, parsePromoIcon, promoGlyphTransform, promoIconUrl,
  PROMO_ICON_DEFAULT_COLOR, PROMO_ICON_DEFAULT_SCALE, PROMO_ICON_MIN_SCALE, PROMO_ICON_MAX_SCALE,
} from "@/lib/promo";
import PromoLucideIcon, { PROMO_ICON_LABELS, PROMO_ICON_NAMES, isPromoIconName } from "@/lib/promoIcons";

/** Своя иконка из библиотеки: имя файла + разделы, которые её заняли. */
export interface PromoIconLibraryItem {
  name: string;
  used_by: string[];
}

/** Палитра круга. Первые три — цвета живых бейджей сайта, чтобы новый раздел вставал в общий ряд. */
const COLORS: { hex: string; title: string }[] = [
  { hex: "E4572E", title: "Как «Убойные цены»" },
  { hex: "003399", title: "Как «Новинки»" },
  { hex: "E02424", title: "Как «Спецпредложения»" },
  { hex: "38A169", title: "Зелёный" },
  { hex: "D97706", title: "Янтарный" },
  { hex: "7C3AED", title: "Фиолетовый" },
  { hex: "0EA5E9", title: "Голубой" },
  { hex: "DB2777", title: "Розовый" },
  { hex: "4C535E", title: "Графитовый" },
];

/** Что сейчас выбрано в библиотеке. */
type Selection = { kind: "lucide"; name: string } | { kind: "upload"; file: string };

/**
 * Выбор иконки раздела: одна библиотека (встроенные + свои) и цвет круга с предпросмотром.
 *
 * Предпросмотр намеренно собран теми же классами, что и бейдж на витрине
 * (`pcard__promo--icon`), — владелец видит ровно то, что получит покупатель.
 */
export default function PromoIconPicker({
  title, icon, library, onSave, onUpload, onDeleteIcon, onClose,
}: {
  title: string;
  icon: string | null;
  library: PromoIconLibraryItem[];
  onSave: (icon: string | null) => void;
  onUpload: (file: File) => Promise<string>;
  onDeleteIcon: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const initial = parsePromoIcon(icon);
  const [sel, setSel] = useState<Selection>(
    initial?.kind === "upload"
      ? { kind: "upload", file: initial.file }
      : { kind: "lucide", name: initial?.kind === "lucide" && isPromoIconName(initial.name) ? initial.name : "flame" },
  );
  const [color, setColor] = useState(initial?.color ?? PROMO_ICON_DEFAULT_COLOR);
  const [scale, setScale] = useState(initial?.scale ?? PROMO_ICON_DEFAULT_SCALE);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  // Переводим фокус в окно и возвращаем его на кнопку-иконку при закрытии: иначе с клавиатуры
  // Tab продолжает ходить по странице позади оверлея.
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => returnTo?.focus?.();
  }, []);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось выполнить");
    } finally {
      setBusy(false);
    }
  }

  const upload = (f: File) => act(async () => {
    const name = await onUpload(f);
    setSel({ kind: "upload", file: name });   // сразу выбираем — за этим её и загружали
  });

  /** Удаление своей иконки. Спрашиваем подтверждение: кнопка сидит в углу плитки выбора,
   *  и промах по ней иначе стирал бы файл без единого вопроса. */
  const removeIcon = (name: string) => {
    if (!confirm(`Удалить иконку из библиотеки? Файл будет стёрт.`)) return;
    void act(async () => {
      await onDeleteIcon(name);
      // Выбор мог указывать на только что удалённый файл — иначе «Сохранить» записал бы
      // раздел на несуществующую картинку.
      setSel((cur) => (cur.kind === "upload" && cur.file === name ? { kind: "lucide", name: "flame" } : cur));
    });
  };

  const save = () => onSave(formatPromoIcon(
    sel.kind === "lucide"
      ? { kind: "lucide", name: sel.name, color, scale }
      : { kind: "upload", file: sel.file, color, scale },
  ));

  const glyphStyle = { transform: promoGlyphTransform(scale) };
  const glyph = sel.kind === "lucide"
    ? <PromoLucideIcon name={sel.name} className="pcard__promo__glyph" style={glyphStyle} />
    : <img src={promoIconUrl(sel.file)} alt="" className="pcard__promo__glyph" style={glyphStyle} />;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 50, background: "rgba(20,20,20,.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label={`Иконка раздела «${title}»`}
        onClick={(e) => e.stopPropagation()}
        style={{
          outline: "none",
          background: "var(--canvas)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-2)",
          width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Иконка раздела</h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-tertiary)" }}>«{title}»</p>
          </div>
          <button onClick={onClose} aria-label="Закрыть" style={closeBtn}>✕</button>
        </div>

        {/* ─── Предпросмотр: тот же бейдж, что и на витрине ─── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16, margin: "18px 0",
          padding: 16, borderRadius: "var(--r-md)", background: "var(--cloud)",
        }}>
          <div style={{
            position: "relative", width: 96, height: 96, borderRadius: "var(--r-md)",
            background: "linear-gradient(135deg,#fff,#e9e7e3)", border: "1px solid var(--hairline)",
            flexShrink: 0,
          }}>
            <span className="pcard__promo pcard__promo--icon" style={{ background: `#${color}` }}>
              {glyph}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-secondary)", lineHeight: 1.6 }}>
            Так бейдж будет выглядеть на карточке товара.<br />
            Иконка всегда белая на цветном круге — единый стиль с «Убойными ценами»,
            «Новинками» и «Спецпредложениями».
          </div>
        </div>

        {/* ─── Встроенные ─── */}
        <p style={groupLabel} id="promo-icons-builtin">Встроенные</p>
        <div style={grid} role="group" aria-labelledby="promo-icons-builtin">
          {PROMO_ICON_NAMES.map((n) => {
            const active = sel.kind === "lucide" && sel.name === n;
            return (
              <button
                key={n}
                onClick={() => setSel({ kind: "lucide", name: n })}
                title={PROMO_ICON_LABELS[n]}
                aria-label={PROMO_ICON_LABELS[n]}
                aria-pressed={active}
                style={tile(active)}
              >
                <PromoLucideIcon name={n} style={{ width: 20, height: 20 }} />
              </button>
            );
          })}
        </div>

        {/* ─── Свои ─── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
          <p style={{ ...groupLabel, margin: 0 }} id="promo-icons-custom">Свои</p>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            style={{ ...ghostBtn, height: 32, padding: "0 12px", fontSize: 12.5 }}
          >
            <IconPlus width={13} height={13} style={{ marginRight: 5 }} /> Загрузить
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/svg+xml,image/png,image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              // Сбрасываем значение: иначе повторный выбор того же файла не даст change.
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </div>

        {library.length === 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--ink-tertiary)" }}>
            Своих иконок пока нет. SVG или PNG — картинка перекрашивается в белый силуэт и
            ложится на выбранный круг, поэтому подойдёт простой одноцветный контур.
            Загруженная иконка остаётся здесь и доступна любому разделу.
          </p>
        ) : (
          <div style={{ ...grid, marginTop: 8 }} role="group" aria-labelledby="promo-icons-custom">
            {library.map((item) => {
              const active = sel.kind === "upload" && sel.file === item.name;
              const used = item.used_by.length > 0;
              return (
                <div key={item.name} style={{ position: "relative" }}>
                  <button
                    onClick={() => setSel({ kind: "upload", file: item.name })}
                    title={used ? `Занята: ${item.used_by.join(", ")}` : "Своя иконка"}
                    aria-label={`Своя иконка ${item.name}`}
                    aria-pressed={active}
                    style={{ ...tile(active), width: "100%" }}
                  >
                    {/* На белой плитке белый силуэт не виден — показываем как есть,
                        в белый он превращается уже на цветном круге предпросмотра. */}
                    <img src={promoIconUrl(item.name)} alt=""
                      style={{ width: 20, height: 20, objectFit: "contain" }} />
                  </button>
                  {/* Занятую удалить нельзя — бэкенд ответит 409, поэтому и кнопки нет. */}
                  {!used && (
                    <button
                      onClick={() => removeIcon(item.name)}
                      disabled={busy}
                      title="Удалить из библиотеки"
                      aria-label={`Удалить иконку ${item.name} из библиотеки`}
                      style={delBtn}
                    >
                      <IconTrash width={10} height={10} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {busy && <p style={{ fontSize: 12.5, color: "var(--ink-secondary)", margin: "8px 0 0" }}>Загрузка…</p>}
        {err && <p className="field__err">{err}</p>}

        {/* ─── Размер иконки ───
            Масштабируем только сам штрих — круг, отступы и стиль бейджа не меняются. */}
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <p style={{ ...groupLabel, margin: 0 }}>Размер иконки</p>
            <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {Math.round(scale * 100)}%
              </span>
              {scale !== PROMO_ICON_DEFAULT_SCALE && (
                <button
                  type="button"
                  onClick={() => setScale(PROMO_ICON_DEFAULT_SCALE)}
                  style={{ border: "none", background: "none", padding: 0, cursor: "pointer",
                    fontSize: 12, color: "var(--accent)", fontWeight: 500 }}
                >
                  Сбросить
                </button>
              )}
            </span>
          </div>
          <input
            type="range"
            min={PROMO_ICON_MIN_SCALE}
            max={PROMO_ICON_MAX_SCALE}
            step={0.1}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            aria-label="Размер иконки внутри бейджа"
            style={{ width: "100%", marginTop: 8, accentColor: `#${color}`, cursor: "pointer" }}
          />
        </div>

        {/* ─── Цвет круга ─── */}
        <div style={{ marginTop: 18 }}>
          <p style={groupLabel}>Цвет фона</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={() => setColor(c.hex)}
                title={c.title}
                aria-label={c.title}
                aria-pressed={color === c.hex}
                style={{
                  width: 32, height: 32, borderRadius: "50%", background: `#${c.hex}`, cursor: "pointer",
                  border: color === c.hex ? "2.5px solid var(--ink)" : "2.5px solid transparent",
                  boxShadow: color === c.hex ? "none" : "inset 0 0 0 1px rgba(0,0,0,.1)",
                }}
              />
            ))}
          </div>
        </div>

        {/* ─── Действия ─── */}
        <div style={{ display: "flex", gap: 8, marginTop: 22, justifyContent: "flex-end" }}>
          {icon && (
            <button onClick={() => onSave(null)} style={{ ...ghostBtn, color: "var(--error)", marginRight: "auto" }}>
              Убрать иконку
            </button>
          )}
          <button onClick={onClose} style={ghostBtn}>Отмена</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

const grid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))", gap: 6,
};
const groupLabel: React.CSSProperties = {
  margin: "0 0 8px", fontSize: 12, fontWeight: 700, letterSpacing: ".04em",
  textTransform: "uppercase", color: "var(--ink-tertiary)",
};
/** Плитка библиотеки. Выбранную отличает и цвет, и толщина рамки — на монохромном экране тоже. */
const tile = (active: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", justifyContent: "center",
  aspectRatio: "1", borderRadius: "var(--r-md)", cursor: "pointer",
  border: active ? "2.5px solid var(--accent)" : "1.5px solid var(--hairline)",
  background: active ? "var(--accent-soft)" : "var(--canvas)",
  color: active ? "var(--accent)" : "var(--ink-secondary)",
});
const delBtn: React.CSSProperties = {
  position: "absolute", top: -5, right: -5, width: 18, height: 18, borderRadius: "50%",
  display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  border: "1px solid var(--hairline)", background: "var(--canvas)", color: "var(--error)",
  boxShadow: "var(--shadow-soft)", padding: 0,
};
const closeBtn: React.CSSProperties = {
  border: "none", background: "transparent", cursor: "pointer",
  fontSize: 16, color: "var(--ink-tertiary)", lineHeight: 1, padding: 4,
};
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  height: 40, padding: "0 16px", borderRadius: "var(--r-md)", cursor: "pointer",
  border: "1px solid var(--hairline)", background: "var(--canvas)",
  fontSize: 14, fontWeight: 500, color: "var(--ink-secondary)",
};
