"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { formatPrice, minOrderQty } from "@/lib/format";
import NoPhoto from "@/components/NoPhoto";
import ChestnyZnakBadge from "@/components/ChestnyZnakBadge";
import type { Product } from "@/types/product";

// Мини-фото с превью по наведению (большое фото рядом, не обрезанное).
function ProductThumb({ product }: { product: Product }) {
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  const hasImg = !!product.image_url;
  const SIZE = 260;

  function onEnter(e: React.MouseEvent) {
    if (!hasImg) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let left = r.right + 12;
    if (left + SIZE > window.innerWidth - 8) left = r.left - SIZE - 12; // у правого края — показываем слева
    const top = Math.max(8, Math.min(r.top + r.height / 2 - SIZE / 2, window.innerHeight - SIZE - 8));
    setBox({ left, top });
  }

  return (
    <Link href={`/products/${product.id}`} onMouseEnter={onEnter} onMouseLeave={() => setBox(null)}
      style={{ display: "block", width: 44, height: 44, borderRadius: 8, overflow: "hidden",
        background: "var(--paper)", border: "1px solid var(--hairline-soft)", position: "relative" }}>
      {hasImg
        ? <img src={`/api/v1/products/${product.id}/image`} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        : <NoPhoto />}
      {box && (
        // Всплывашка ровно по размеру картинки: без подложки и полей — только само фото.
        <span style={{ position: "fixed", left: box.left, top: box.top, zIndex: 60, pointerEvents: "none",
          borderRadius: 12, overflow: "hidden", boxShadow: "0 12px 44px rgba(0,0,0,.22)", display: "block" }}>
          <img src={`/api/v1/products/${product.id}/image`} alt={product.name}
            style={{ display: "block", maxWidth: SIZE, maxHeight: SIZE, width: "auto", height: "auto" }} />
        </span>
      )}
    </Link>
  );
}

// Ячейка количества: − [число] + . Кратность (партия N) — из «Минимального количества для
// заказа»: шаг и минимум = N, кладём в корзину кратно N; ввод округляется к кратному.
function QtyCell({ product }: { product: Product }) {
  const { items, setItemQuantity } = useCart();
  const step = minOrderQty(product.attributes) ?? 1;
  const qty = items.find((i) => i.id === product.id)?.quantity ?? 0;
  const [val, setVal] = useState(qty ? String(qty) : "");
  useEffect(() => { setVal(qty ? String(qty) : ""); }, [qty]);

  const disabled = !product.available;
  const item = { id: product.id, name: product.name, article: product.article, price: product.price };
  const commit = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) { setItemQuantity(item, 0); return; }
    setItemQuantity(item, Math.max(step, Math.round(n / step) * step));
  };

  const btn: React.CSSProperties = {
    width: 30, height: 34, border: "1px solid var(--hairline)", background: "var(--paper)",
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 18, lineHeight: 1, color: "var(--ink)",
    display: "flex", alignItems: "center", justifyContent: "center", flex: "none",
  };

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div style={{ display: "inline-flex", alignItems: "center", borderRadius: 8, overflow: "hidden", opacity: disabled ? 0.45 : 1 }}>
        <button type="button" style={{ ...btn, borderRadius: "8px 0 0 8px" }} disabled={disabled || qty <= 0}
          onClick={() => commit(qty - step)} aria-label="Меньше">−</button>
        <input value={val} disabled={disabled} inputMode="numeric"
          onChange={(e) => setVal(e.target.value.replace(/\D/g, "").slice(0, 5))}
          onBlur={() => commit(parseInt(val || "0", 10))}
          onKeyDown={(e) => { if (e.key === "Enter") { commit(parseInt(val || "0", 10)); (e.target as HTMLInputElement).blur(); } }}
          placeholder="0"
          style={{ width: 56, height: 34, border: "1px solid var(--hairline)", borderLeft: "none", borderRight: "none",
            textAlign: "center", fontSize: 14, fontWeight: 600, color: "var(--ink)", outline: "none",
            background: qty > 0 ? "var(--stock-soft)" : "var(--paper)" }} />
        <button type="button" style={{ ...btn, borderRadius: "0 8px 8px 0" }} disabled={disabled}
          onClick={() => commit(qty === 0 ? step : qty + step)} aria-label="Больше">+</button>
      </div>
      {step > 1 && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", whiteSpace: "nowrap" }}>кратно {step} шт.</span>}
    </div>
  );
}

// Табличный «бланк заказа»: строки-товары, быстрый ввод количества.
// Липкая панель корзины вынесена на уровень страницы (общая для «Плитки» и «Списка»).
// showQty=false — показываем только «В наличии» без числа (настройка «Показ остатка»).
export default function CatalogList({ products, showQty = true }: { products: Product[]; showQty?: boolean }) {
  const th: React.CSSProperties = { textAlign: "left", padding: "10px 14px", fontSize: 12, fontWeight: 600,
    color: "var(--ink-secondary)", textTransform: "uppercase", letterSpacing: ".03em", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "10px 14px", borderTop: "1px solid var(--hairline-soft)", verticalAlign: "middle" };

  return (
    <>
      {/* Десктоп: таблица (на телефоне прячется) */}
      <div className="clist-desktop" style={{ overflowX: "auto", border: "1px solid var(--hairline-soft)", borderRadius: "var(--radius-lg)", marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 720 }}>
          <thead>
            <tr style={{ background: "var(--cloud)" }}>
              <th style={{ ...th, width: 56 }}></th>
              <th style={th}>Товар</th>
              <th style={th}>Артикул</th>
              <th style={th}>Остаток</th>
              <th style={{ ...th, textAlign: "right" }}>Цена</th>
              <th style={{ ...th, textAlign: "center", width: 150 }}>Количество</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td style={td}><ProductThumb product={p} /></td>
                <td style={td}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {p.chestnyZnak && <ChestnyZnakBadge size={15} />}
                    <Link href={`/products/${p.id}`} style={{ fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}>{p.name}</Link>
                  </span>
                  {p.category?.name && <div style={{ fontSize: 12, color: "var(--ink-tertiary)" }}>{p.category.name}</div>}
                </td>
                <td style={{ ...td, color: "var(--ink-secondary)", fontVariantNumeric: "tabular-nums" }}>{p.article || "—"}</td>
                <td style={td}>
                  {p.available && p.stock > 0
                    ? <span style={{ fontSize: 13, fontWeight: 600, color: "var(--stock)" }}>{showQty ? `${p.stock} шт.` : "В наличии"}</span>
                    : <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-tertiary)" }}>Нет</span>}
                </td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{Number(p.price) > 0 ? formatPrice(p.price) : "—"}</td>
                <td style={{ ...td, textAlign: "center" }}><QtyCell product={p} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Мобильный: компактные строки без фото. Сверху — название + цена;
          снизу отдельной строкой — артикул/наличие слева и степпер справа (не «плавает»). */}
      <div className="clist-mobile" style={{ flexDirection: "column", border: "1px solid var(--hairline-soft)",
        borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: 24 }}>
        {products.map((p, i) => (
          <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px",
            borderTop: i === 0 ? "none" : "1px solid var(--hairline-soft)" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                {p.chestnyZnak && <ChestnyZnakBadge size={14} />}
                <Link href={`/products/${p.id}`} style={{ fontWeight: 600, color: "var(--ink)", textDecoration: "none",
                  fontSize: 14, lineHeight: 1.35 }}>{p.name}</Link>
              </span>
              <span style={{ fontWeight: 700, whiteSpace: "nowrap", fontSize: 14 }}>
                {Number(p.price) > 0 ? formatPrice(p.price) : "—"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--ink-tertiary)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
                {p.article && <span style={{ fontVariantNumeric: "tabular-nums" }}>Арт. {p.article}</span>}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", color: p.available ? "var(--stock)" : "var(--ink-tertiary)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor" }} />
                  {p.available && p.stock > 0 ? (showQty ? `${p.stock} шт.` : "В наличии") : "Нет"}
                </span>
              </div>
              <QtyCell product={p} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
