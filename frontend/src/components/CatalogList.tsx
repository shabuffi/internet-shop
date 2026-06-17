"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/format";
import { IconImage } from "@/components/icons";
import type { Product } from "@/types/product";

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

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
        background: "var(--cloud)", border: "1px solid var(--hairline-soft)", position: "relative" }}>
      {hasImg
        ? <img src={`/api/v1/products/${product.id}/image`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : <span style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--graphite)", opacity: .5 }}><IconImage width="1.2em" height="1.2em" /></span>}
      {box && (
        <span style={{ position: "fixed", left: box.left, top: box.top, zIndex: 60, pointerEvents: "none",
          width: SIZE, height: SIZE, borderRadius: 12, overflow: "hidden", background: "#fff",
          border: "1px solid var(--hairline-soft)", boxShadow: "0 12px 44px rgba(0,0,0,.22)" }}>
          <img src={`/api/v1/products/${product.id}/image`} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        </span>
      )}
    </Link>
  );
}

// Ячейка количества: − [число] + . Пишет точное число в корзину (на blur / Enter / кнопки).
function QtyCell({ product }: { product: Product }) {
  const { items, setItemQuantity } = useCart();
  const qty = items.find((i) => i.id === product.id)?.quantity ?? 0;
  const [val, setVal] = useState(qty ? String(qty) : "");
  useEffect(() => { setVal(qty ? String(qty) : ""); }, [qty]);

  const disabled = !product.available;
  const item = { id: product.id, name: product.name, article: product.article, price: product.price };
  const commit = (n: number) => setItemQuantity(item, Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

  const btn: React.CSSProperties = {
    width: 30, height: 34, border: "1px solid var(--hairline)", background: "var(--paper)",
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 18, lineHeight: 1, color: "var(--ink)",
    display: "flex", alignItems: "center", justifyContent: "center", flex: "none",
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", borderRadius: 8, overflow: "hidden", opacity: disabled ? 0.45 : 1 }}>
      <button type="button" style={{ ...btn, borderRadius: "8px 0 0 8px" }} disabled={disabled || qty <= 0}
        onClick={() => commit(qty - 1)} aria-label="Меньше">−</button>
      <input value={val} disabled={disabled} inputMode="numeric"
        onChange={(e) => setVal(e.target.value.replace(/\D/g, "").slice(0, 5))}
        onBlur={() => commit(parseInt(val || "0", 10))}
        onKeyDown={(e) => { if (e.key === "Enter") { commit(parseInt(val || "0", 10)); (e.target as HTMLInputElement).blur(); } }}
        placeholder="0"
        style={{ width: 56, height: 34, border: "1px solid var(--hairline)", borderLeft: "none", borderRight: "none",
          textAlign: "center", fontSize: 14, fontWeight: 600, color: "var(--ink)", outline: "none",
          background: qty > 0 ? "var(--stock-soft)" : "var(--paper)" }} />
      <button type="button" style={{ ...btn, borderRadius: "0 8px 8px 0" }} disabled={disabled}
        onClick={() => commit(qty + 1)} aria-label="Больше">+</button>
    </div>
  );
}

// Липкая панель корзины снизу — итог по всем страницам в реальном времени.
function CartBar() {
  const { items, totalItems, totalAmount } = useCart();
  const positions = items.length;
  if (totalItems === 0) return null;
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30,
      background: "var(--ink)", color: "#fff", boxShadow: "0 -6px 24px rgba(0,0,0,.18)" }}>
      <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16, padding: "14px 0", flexWrap: "wrap" }}>
        <div style={{ fontSize: 15 }}>
          Выбрано <b>{positions}</b> {plural(positions, "позиция", "позиции", "позиций")}
          {" · "}<b>{totalItems}</b> {plural(totalItems, "штука", "штуки", "штук")}
          {" · "}<b>{formatPrice(totalAmount)}</b>
        </div>
        <Link href="/cart" style={{ background: "var(--accent-2)", color: "var(--on-accent-2)", fontWeight: 700, fontSize: 15,
          padding: "10px 22px", borderRadius: 10, textDecoration: "none" }}>
          Оформить →
        </Link>
      </div>
    </div>
  );
}

// Табличный «бланк заказа»: строки-товары, быстрый ввод количества, липкая корзина.
export default function CatalogList({ products }: { products: Product[] }) {
  const th: React.CSSProperties = { textAlign: "left", padding: "10px 14px", fontSize: 12, fontWeight: 600,
    color: "var(--ink-secondary)", textTransform: "uppercase", letterSpacing: ".03em", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "10px 14px", borderTop: "1px solid var(--hairline-soft)", verticalAlign: "middle" };

  return (
    <>
      <div style={{ overflowX: "auto", border: "1px solid var(--hairline-soft)", borderRadius: "var(--radius-lg)", marginBottom: 96 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 720 }}>
          <thead>
            <tr style={{ background: "var(--cloud)" }}>
              <th style={{ ...th, width: 56 }}></th>
              <th style={th}>Товар</th>
              <th style={th}>Артикул</th>
              <th style={th}>Наличие</th>
              <th style={{ ...th, textAlign: "right" }}>Цена</th>
              <th style={{ ...th, textAlign: "center", width: 150 }}>Количество</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td style={td}><ProductThumb product={p} /></td>
                <td style={td}>
                  <Link href={`/products/${p.id}`} style={{ fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}>{p.name}</Link>
                  {p.category?.name && <div style={{ fontSize: 12, color: "var(--ink-tertiary)" }}>{p.category.name}</div>}
                </td>
                <td style={{ ...td, color: "var(--ink-secondary)", fontVariantNumeric: "tabular-nums" }}>{p.article || "—"}</td>
                <td style={td}>
                  {p.available
                    ? <span style={{ fontSize: 13, fontWeight: 600, color: "var(--stock)" }}>В наличии</span>
                    : <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-tertiary)" }}>Нет</span>}
                </td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{formatPrice(p.price)}</td>
                <td style={{ ...td, textAlign: "center" }}><QtyCell product={p} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CartBar />
    </>
  );
}
