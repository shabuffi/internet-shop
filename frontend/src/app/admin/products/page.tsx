"use client";

import { useEffect, useRef, useState } from "react";
import AdminShell from "@/components/AdminShell";
import HelpHint from "@/components/HelpHint";
import OrphanImagesDrawer from "@/components/OrphanImagesDrawer";
import { IconCloud, IconImage, IconPlus } from "@/components/icons";
import { adminFetch, adminUpload } from "@/lib/adminApi";
import { formatMsk } from "@/lib/format";
import { useIsMobile } from "@/lib/useIsMobile";

interface AdminProduct { id: string; name: string; article: string | null; price: string; stock: number; available: boolean; images: string[]; images_manual: boolean; is_active: boolean; synced_at: string | null; }

export default function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [query, setQuery] = useState("");                  // активный поисковый запрос
  const [search, setSearch] = useState("");                // текст в поле (до отправки)
  const [filters, setFilters] = useState({ photo: "", desc: "", avail: "" }); // фильтры каталога
  const [ver, setVer] = useState(0);                       // для сброса кэша миниатюр
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ id: string; filename: string } | null>(null);
  // Библиотека бесхозных изображений (правая панель)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTarget, setDrawerTarget] = useState<{ id: string; name: string } | null>(null);
  const [attached, setAttached] = useState<string[]>([]);   // файлы, привязанные в этой сессии — прячем в панели
  const [dropId, setDropId] = useState<string | null>(null); // товар под курсором при drag&drop
  // Меню у «+»: загрузить с компьютера / выбрать из библиотеки
  const [photoMenu, setPhotoMenu] = useState<{ product: AdminProduct; x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const pages = Math.max(1, Math.ceil(total / pageSize));

  function load(p = page, q = query, f = filters) {
    const qs = new URLSearchParams({ page: String(p) });
    if (q.trim()) qs.set("q", q.trim());
    if (f.photo) qs.set("photo", f.photo);
    if (f.desc) qs.set("desc", f.desc);
    if (f.avail) qs.set("avail", f.avail);
    adminFetch<{ items: AdminProduct[]; total: number; page_size: number }>(`/products?${qs}`)
      .then(d => { setProducts(d.items); setTotal(d.total); setPageSize(d.page_size || 50); })
      .catch(() => {});
  }
  useEffect(() => { load(page, query, filters); }, [page, query, filters]);

  // Меню «+» закрывается по Esc
  useEffect(() => {
    if (!photoMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPhotoMenu(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoMenu]);

  // Смена фильтра — на первую страницу.
  function setFilter(key: "photo" | "desc" | "avail", value: string) {
    setPage(1);
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  const selStyle: React.CSSProperties = {
    height: 36, padding: "0 32px 0 12px", border: "1px solid var(--hairline-soft)",
    borderRadius: "var(--radius-md)", fontSize: 13, color: "var(--ink)", cursor: "pointer",
    // Белый фон + своя стрелка (нативный вид селекта убираем — «не вылетающий»)
    appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
    backgroundColor: "#fff",
    backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
    backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
  };
  const hasFilters = filters.photo || filters.desc || filters.avail;

  // Кнопка «+ фото» и меню под ней (стили рядом с разметкой — страница уже так написана)
  const photoMenuCss = `
    .photo-add { position: relative; width: 40px; height: 40px; padding: 0; border-radius: 8px;
      border: 1px dashed var(--hairline-soft); background: transparent; color: var(--ink-tertiary);
      display: flex; align-items: center; justify-content: center;
      transition: border-color .12s, background .12s, color .12s; }
    .photo-add:hover, .photo-add[data-open] { border-style: solid; border-color: var(--accent, var(--ink));
      background: var(--cloud); color: var(--accent, var(--ink)); }
    .photo-add:active { transform: translateY(1px); }
    .photo-add:focus-visible { outline: 2px solid var(--accent, var(--ink)); outline-offset: 2px; }
    .photo-add__plus { position: absolute; right: 3px; bottom: 3px; }
    .photo-menu { animation: photo-menu-in .12s ease-out; }
    @keyframes photo-menu-in { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }
    .photo-menu__item { display: flex; align-items: center; gap: 10px; width: 100%; height: 42px;
      padding: 0 14px; font-size: 14px; text-align: left; border: none; background: transparent;
      color: var(--ink); cursor: pointer; transition: background .1s; }
    .photo-menu__item:hover { background: var(--cloud); }
    .photo-menu__item:active { background: var(--hairline-soft); }
    .photo-menu__item:focus-visible { outline: none; background: var(--cloud); box-shadow: inset 2px 0 0 var(--accent, var(--ink)); }
    .photo-menu__item svg { flex: none; color: var(--ink-secondary); }
  `;

  // Поиск: сбрасываем на первую страницу и фиксируем запрос
  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setQuery(search);
  }

  async function toggleAvailability(id: string, next: boolean) {
    setProducts(ps => ps.map(p => p.id === id ? { ...p, available: next } : p)); // оптимистично
    try {
      await adminFetch(`/products/${id}/availability`, { method: "PATCH", body: JSON.stringify({ available: next }) });
    } catch {
      load(); // при ошибке — перечитываем с сервера
    }
  }

  async function uploadImage(id: string, file: File | undefined) {
    if (!file) return;
    setBusyId(id);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await adminUpload<{ images: string[] }>(`/products/${id}/images`, fd);
      setProducts(ps => ps.map(p => p.id === id ? { ...p, images: r.images } : p));
      setVer(v => v + 1);
    } catch { /* ignore */ } finally { setBusyId(null); }
  }

  async function deleteImage(id: string, filename: string) {
    setBusyId(id);
    try {
      const r = await adminFetch<{ images: string[] }>(`/products/${id}/images?filename=${encodeURIComponent(filename)}`, { method: "DELETE" });
      setProducts(ps => ps.map(p => p.id === id ? { ...p, images: r.images } : p));
      setVer(v => v + 1);
    } catch { /* ignore */ } finally { setBusyId(null); }
  }

  // Привязка бесхозной картинки к товару (файл уже лежит в хранилище — новых не создаём)
  async function attachImage(id: string, filename: string) {
    setBusyId(id);
    try {
      const r = await adminFetch<{ images: string[] }>(`/products/${id}/images/attach`, {
        method: "POST", body: JSON.stringify({ filename }),
      });
      setProducts(ps => ps.map(p => p.id === id ? { ...p, images: r.images } : p)); // обновляем только строку
      setAttached(a => [...a, filename]);                                           // и убираем из панели
      setVer(v => v + 1);
      setToast("Изображение привязано");
      setTimeout(() => setToast(null), 2500);
    } catch {
      setToast("Не удалось привязать изображение");
      setTimeout(() => setToast(null), 2500);
    } finally { setBusyId(null); }
  }

  function openLibrary(p: AdminProduct) {
    setDrawerTarget({ id: p.id, name: p.name });
    setDrawerOpen(true);
  }

  // Общие элементы (таблица + мобильные карточки)
  const photoStrip = (p: AdminProduct) => (
    <div
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDropId(p.id); }}
      onDragLeave={() => setDropId(d => (d === p.id ? null : d))}
      onDrop={e => {
        e.preventDefault();
        setDropId(null);
        const filename = e.dataTransfer.getData("text/plain");
        if (filename) attachImage(p.id, filename);
      }}
      style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
        padding: 4, margin: -4, borderRadius: 8, transition: "background .12s, box-shadow .12s",
        background: dropId === p.id ? "var(--cloud)" : "transparent",
        boxShadow: dropId === p.id ? "inset 0 0 0 2px var(--ink)" : "none" }}
    >
      {p.images.map((img, i) => (
        <span key={img} style={{ position: "relative", lineHeight: 0 }}>
          <img src={`/api/v1/products/${p.id}/image?n=${i}&v=${ver}`} alt="" width={40} height={40}
            style={{ objectFit: "cover", borderRadius: 6, border: "1px solid var(--hairline-soft)" }} />
          <button onClick={() => setConfirmDel({ id: p.id, filename: img })} title="Удалить фото"
            style={{ position: "absolute", top: -7, right: -7, width: 18, height: 18, borderRadius: 999,
              border: "none", background: "var(--ink)", color: "#fff", fontSize: 12, lineHeight: "16px", cursor: "pointer", padding: 0 }}>×</button>
        </span>
      ))}
      <button
        className="photo-add"
        aria-haspopup="menu"
        aria-expanded={photoMenu?.product.id === p.id}
        data-open={photoMenu?.product.id === p.id ? "1" : undefined}
        onClick={e => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setPhotoMenu(m => m?.product.id === p.id ? null : { product: p, x: r.left, y: r.bottom + 6 });
        }}
        title="Добавить фото"
        aria-label="Добавить фото"
        style={{ cursor: busyId === p.id ? "wait" : "pointer", opacity: busyId === p.id ? 0.5 : 1 }}>
        <IconImage width={17} height={17} />
        <IconPlus width={11} height={11} className="photo-add__plus" />
      </button>
    </div>
  );
  const availBtn = (p: AdminProduct) => {
    // «В наличии» (с числом остатка) — только если товар реально на складе (stock > 0).
    // available — ручной флаг видимости на сайте: если выключен, товар «Скрыт».
    const inStock = p.available && p.stock > 0;
    const label = !p.available ? "Скрыт" : p.stock > 0 ? `${p.stock} шт.` : "Нет";
    const title = inStock
      ? `На складе: ${p.stock} шт. Нажмите, чтобы скрыть с сайта`
      : p.available
      ? "Нет на складе. Нажмите, чтобы скрыть с сайта"
      : "Скрыт с сайта. Нажмите, чтобы показать";
    return (
      <button onClick={() => toggleAvailability(p.id, !p.available)} title={title}
        style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
          border: "1px solid " + (inStock ? "var(--stock)" : "var(--hairline-soft)"),
          background: inStock ? "var(--stock-soft)" : "var(--cloud)",
          color: inStock ? "var(--stock)" : "var(--ink-tertiary)" }}>
        {label}
      </button>
    );
  };

  return (
    <AdminShell>
      <style>{photoMenuCss}</style>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Товары</h1>
        <HelpHint text="Каталог загружается из МойСклад. Здесь можно фильтровать товары, скрыть/показать их на сайте и задать фото." />
        <span style={{ fontSize: 14, color: "var(--ink-secondary)" }}>
          {query ? `найдено: ${total}` : `${total} всего`}
        </span>
      </div>

      <form onSubmit={submitSearch} style={{ display: "flex", gap: 8, marginBottom: 20, maxWidth: 480 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по названию или артикулу"
          style={{ flex: 1, height: 40, padding: "0 14px", border: "1px solid var(--hairline-soft)",
            borderRadius: "var(--radius-md)", fontSize: 14, background: "var(--canvas)", color: "var(--ink)" }}
        />
        <button type="submit" className="btn btn--primary btn--sm">Найти</button>
        {query && (
          <button type="button" className="btn btn--outline btn--sm"
            onClick={() => { setSearch(""); setQuery(""); setPage(1); }}>Сброс</button>
        )}
      </form>

      <div style={{ display: isMobile ? "grid" : "flex",
        gridTemplateColumns: isMobile ? "1fr 1fr" : undefined,
        gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {!isMobile && <span style={{ fontSize: 13, color: "var(--ink-secondary)" }}>Фильтры:</span>}
        <select aria-label="Фильтр по картинкам" value={filters.photo} onChange={e => setFilter("photo", e.target.value)} style={{ ...selStyle, width: isMobile ? "100%" : undefined }}>
          <option value="">Картинки: все</option>
          <option value="with">С фото</option>
          <option value="without">Без фото</option>
        </select>
        <select aria-label="Фильтр по описанию" value={filters.desc} onChange={e => setFilter("desc", e.target.value)} style={{ ...selStyle, width: isMobile ? "100%" : undefined }}>
          <option value="">Описание: все</option>
          <option value="with">С описанием</option>
          <option value="without">Без описания</option>
        </select>
        <select aria-label="Фильтр по наличию" value={filters.avail} onChange={e => setFilter("avail", e.target.value)} style={{ ...selStyle, width: isMobile ? "100%" : undefined }}>
          <option value="">Наличие: все</option>
          <option value="yes">В наличии</option>
          <option value="no">Нет в наличии</option>
        </select>
        {hasFilters && (
          <button type="button" className="btn btn--outline btn--sm"
            style={isMobile ? { gridColumn: "1 / -1" } : undefined}
            onClick={() => { setPage(1); setFilters({ photo: "", desc: "", avail: "" }); }}>Сбросить фильтры</button>
        )}
      </div>

      {products.length === 0 ? (
        <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)" }}>
          <p style={{ padding: 32, color: "var(--ink-secondary)", textAlign: "center" }}>
            {query ? `По запросу «${query}» ничего не найдено` : "Товаров нет — запустите синхронизацию"}
          </p>
        </div>
      ) : isMobile ? (
        /* Мобильный вид — карточки вместо таблицы */
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {products.map(p => (
            <div key={p.id} style={{ background: "var(--canvas)", border: "1px solid var(--hairline-soft)", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ fontWeight: 600, minWidth: 0, lineHeight: 1.35 }}>{p.name}</div>
                <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{Number(p.price).toFixed(2)} ₽</div>
              </div>
              <div style={{ marginBottom: 12 }}>{photoStrip(p)}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center", fontSize: 13, color: "var(--ink-secondary)" }}>
                {availBtn(p)}
                <span style={{ fontWeight: 600, color: p.is_active ? "var(--success)" : "var(--ink-tertiary)" }}>{p.is_active ? "Активен" : "Скрыт"}</span>
                {p.article && <span>Арт. {p.article}</span>}
                <span>{formatMsk(p.synced_at)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                {["Фото", "Название", "Артикул", "Цена", "В наличии", "Статус", "Синхронизирован"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "var(--ink-secondary)", fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                  <td style={{ padding: "12px 16px" }}>{photoStrip(p)}</td>
                  <td style={{ padding: "14px 16px", fontWeight: 500 }}>{p.name}</td>
                  <td style={{ padding: "14px 16px", color: "var(--ink-secondary)" }}>{p.article ?? "—"}</td>
                  <td style={{ padding: "14px 16px", fontWeight: 600, whiteSpace: "nowrap" }}>{Number(p.price).toFixed(2)} ₽</td>
                  <td style={{ padding: "14px 16px" }}>{availBtn(p)}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: p.is_active ? "var(--success)" : "var(--ink-tertiary)" }}>
                      {p.is_active ? "Активен" : "Скрыт"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 12, color: "var(--ink-secondary)" }}>{formatMsk(p.synced_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 24 }}>
          <button className="btn btn--outline btn--sm" disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}>‹ Назад</button>
          <span style={{ fontSize: 14, color: "var(--ink-secondary)" }}>
            Страница {page} из {pages}
          </span>
          <button className="btn btn--outline btn--sm" disabled={page >= pages}
            onClick={() => setPage(p => Math.min(pages, p + 1))}>Вперёд ›</button>
        </div>
      )}
      {/* Один общий file-input: «Загрузить с компьютера» из меню «+» */}
      <input ref={fileInputRef} type="file" accept="image/*" hidden
        onChange={e => { if (uploadFor) uploadImage(uploadFor, e.target.files?.[0]); e.target.value = ""; }} />

      {photoMenu && (
        <>
          <div onClick={() => setPhotoMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 950 }} />
          <div role="menu" aria-label="Добавить фото" className="photo-menu"
            style={{ position: "fixed", zIndex: 951,
              // Мобильный — лист снизу на всю ширину; десктоп — под кнопкой, с флипом вверх у нижнего края
              top: isMobile ? undefined
                : photoMenu.y + 100 > window.innerHeight ? photoMenu.y - 112 : photoMenu.y,
              left: isMobile ? 12 : Math.min(photoMenu.x, window.innerWidth - 244),
              right: isMobile ? 12 : undefined, bottom: isMobile ? 12 : undefined,
              width: isMobile ? undefined : 232,
              background: "var(--paper, #fff)", border: "1px solid var(--hairline-soft)", borderRadius: 12,
              boxShadow: "0 6px 24px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.06)",
              padding: 4, overflow: "hidden" }}>
            <button role="menuitem" className="photo-menu__item" style={{ borderRadius: 8 }} autoFocus
              onClick={() => { setUploadFor(photoMenu.product.id); setPhotoMenu(null); fileInputRef.current?.click(); }}>
              <IconCloud width={16} height={16} />
              Загрузить с компьютера
            </button>
            <button role="menuitem" className="photo-menu__item" style={{ borderRadius: 8 }}
              onClick={() => { const p = photoMenu.product; setPhotoMenu(null); openLibrary(p); }}>
              <IconImage width={16} height={16} />
              Выбрать из библиотеки
            </button>
          </div>
        </>
      )}

      <OrphanImagesDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerTarget(null); }}
        target={drawerTarget}
        hidden={attached}
        onAttach={attachImage}
      />

      {toast && (
        <div style={{ position: "fixed", right: drawerOpen && !isMobile ? 376 : 16, bottom: 16, zIndex: 1100,
          background: "var(--ink)", color: "#fff", padding: "10px 16px", borderRadius: 10,
          fontSize: 13, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
          {toast}
        </div>
      )}

      {confirmDel && (
        <div onClick={() => setConfirmDel(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
            style={{ background: "var(--paper, #fff)", borderRadius: 14, padding: "22px 22px 18px",
              maxWidth: 380, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
            <p style={{ fontWeight: 700, fontSize: 17, margin: "0 0 8px" }}>Удалить фото?</p>
            <p style={{ fontSize: 14, color: "var(--ink-secondary)", margin: "0 0 18px", lineHeight: 1.5 }}>
              Фото товара исчезнет с сайта. Если оно есть в МойСклад, вернётся при следующей выгрузке этого товара.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDel(null)}
                style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--hairline-soft)",
                  background: "#fff", color: "var(--ink)", cursor: "pointer", fontSize: 14 }}>Отмена</button>
              <button onClick={() => { if (!confirmDel) return; const d = confirmDel; setConfirmDel(null); deleteImage(d.id, d.filename); }}
                style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "none",
                  background: "#d33", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
