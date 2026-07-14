"use client";

// Правая панель «Бесхозные изображения» — локальная библиотека картинок,
// оставшихся в медиа-хранилище после обменов CommerceML и не привязанных ни к одному товару.
// Привязка: перетаскиванием на фото товара или кнопкой «Привязать» (если панель открыта из товара).

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminApi";
import { formatMsk } from "@/lib/format";

export interface OrphanImage { filename: string; size: number; mtime: string; }

interface Props {
  open: boolean;
  onClose: () => void;
  target: { id: string; name: string } | null;   // товар, из которого открыли панель (если открыли из «+»)
  hidden: string[];                              // уже привязанные в этой сессии — убираем из списка
  onAttach: (productId: string, filename: string) => void;
}

const PAGE = 20;

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export default function OrphanImagesDrawer({ open, onClose, target, hidden, onAttach }: Props) {
  const [items, setItems] = useState<OrphanImage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("date");     // date | name | size
  const [order, setOrder] = useState("desc");   // desc | asc
  const [hover, setHover] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE), sort, order });
    if (q.trim()) qs.set("q", q.trim());
    adminFetch<{ items: OrphanImage[]; total: number }>(`/media/orphans?${qs}`)
      .then(d => { setItems(d.items); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, q, sort, order]);

  useEffect(() => { if (open) load(); }, [open, load]);

  // Дебаунс поиска
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setQ(search); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  if (!open) return null;

  const visible = items.filter(i => !hidden.includes(i.filename));
  const pages = Math.max(1, Math.ceil(Math.max(0, total - hidden.length) / PAGE));

  const selStyle: React.CSSProperties = {
    height: 32, padding: "0 8px", border: "1px solid var(--hairline-soft)",
    borderRadius: "var(--radius-md)", fontSize: 12, background: "#fff", color: "var(--ink)", cursor: "pointer",
  };

  return (
    <aside
      role="dialog"
      aria-label="Бесхозные изображения"
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 360, maxWidth: "100vw", zIndex: 900,
        background: "var(--paper, #fff)", borderLeft: "1px solid var(--hairline-soft)",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column",
        animation: "orphan-slide-in .18s ease-out",
      }}
    >
      <style>{`@keyframes orphan-slide-in { from { transform: translateX(24px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>

      <header style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--hairline-soft)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <strong style={{ fontSize: 16 }}>Бесхозные изображения</strong>
          <button onClick={onClose} aria-label="Закрыть"
            style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "var(--ink-secondary)", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-secondary)", marginTop: 4 }}>
          {loading ? "Загрузка…" : `Найдено: ${Math.max(0, total - hidden.length)}`}
        </div>
        {target && (
          <div style={{ marginTop: 8, fontSize: 12, background: "var(--cloud)", padding: "8px 10px", borderRadius: 8, lineHeight: 1.4 }}>
            Товар выбран: <b>{target.name}</b><br />
            Перетащите картинку на товар или нажмите «Привязать».
          </div>
        )}

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по имени файла"
          style={{ width: "100%", height: 34, padding: "0 10px", marginTop: 10, fontSize: 13,
            border: "1px solid var(--hairline-soft)", borderRadius: "var(--radius-md)", background: "var(--canvas)", color: "var(--ink)" }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <select aria-label="Сортировка" value={sort} onChange={e => { setPage(1); setSort(e.target.value); }} style={{ ...selStyle, flex: 1 }}>
            <option value="date">По дате</option>
            <option value="name">По имени</option>
            <option value="size">По размеру</option>
          </select>
          <select aria-label="Направление сортировки" value={order} onChange={e => { setPage(1); setOrder(e.target.value); }} style={{ ...selStyle, flex: 1 }}>
            <option value="desc">По убыванию</option>
            <option value="asc">По возрастанию</option>
          </select>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {visible.length === 0 ? (
          <p style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--ink-secondary)" }}>
            {loading ? "" : "Бесхозных изображений нет"}
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {visible.map(img => (
              <div key={img.filename}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData("text/plain", img.filename);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onMouseEnter={() => setHover(img.filename)}
                onMouseLeave={() => setHover(h => (h === img.filename ? null : h))}
                style={{ border: "1px solid var(--hairline-soft)", borderRadius: 10, overflow: "hidden", cursor: "grab", background: "var(--canvas)" }}
              >
                <div style={{ position: "relative", aspectRatio: "1 / 1", background: "var(--cloud)" }}>
                  <img src={`/api/v1/admin/media/file/${encodeURIComponent(img.filename)}`} alt={img.filename}
                    draggable={false}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  {hover === img.filename && (
                    <button
                      onClick={() => target && onAttach(target.id, img.filename)}
                      disabled={!target}
                      title={target ? `Привязать к «${target.name}»` : "Откройте панель кнопкой «+» у товара"}
                      style={{ position: "absolute", left: 8, right: 8, bottom: 8, height: 30, borderRadius: 8, border: "none",
                        background: target ? "var(--ink)" : "var(--graphite)", color: "#fff", fontSize: 12, fontWeight: 600,
                        cursor: target ? "pointer" : "not-allowed", opacity: target ? 1 : 0.7 }}>
                      Привязать
                    </button>
                  )}
                </div>
                <div style={{ padding: "6px 8px", fontSize: 11, color: "var(--ink-secondary)", lineHeight: 1.4 }}>
                  <div style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={img.filename}>
                    {img.filename}
                  </div>
                  <div>{formatMsk(img.mtime)}</div>
                  <div>{humanSize(img.size)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pages > 1 && (
        <footer style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          padding: 10, borderTop: "1px solid var(--hairline-soft)", fontSize: 12 }}>
          <button className="btn btn--outline btn--sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</button>
          <span style={{ color: "var(--ink-secondary)" }}>{page} / {pages}</span>
          <button className="btn btn--outline btn--sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>›</button>
        </footer>
      )}
    </aside>
  );
}
