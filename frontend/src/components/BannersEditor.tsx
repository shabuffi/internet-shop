"use client";

import { useState } from "react";
import { adminUpload } from "@/lib/adminApi";
import type { Banner } from "@/lib/banners";

// Редактор баннеров слайдера: список карточек с полями + загрузкой картинки.
// Значение — JSON-строка (как хранится в настройках); наверх отдаём сериализованный JSON.
function parse(value: string): Banner[] {
  try {
    const d = JSON.parse(value || "[]");
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 };

export default function BannersEditor({ value, onChange }: { value: string; onChange: (json: string) => void }) {
  const banners = parse(value);
  const [uploading, setUploading] = useState<number | null>(null);

  const commit = (next: Banner[]) => onChange(next.length ? JSON.stringify(next, null, 2) : "");
  const update = (i: number, patch: Partial<Banner>) => commit(banners.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const add = () => commit([...banners, { id: String(Date.now()), title: "Новый баннер", href: "/catalog", from: "#003399", to: "#3b7dd8" }]);
  const remove = (i: number) => commit(banners.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= banners.length) return;
    const next = [...banners];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  async function uploadImage(i: number, file?: File) {
    if (!file) return;
    setUploading(i);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { url } = await adminUpload<{ url: string }>("/banner-image", fd);
      update(i, { image: url });
    } catch { /* ignore */ } finally {
      setUploading(null);
    }
  }

  const btn: React.CSSProperties = {
    padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontSize: 13,
    border: "1px solid var(--hairline-soft)", background: "var(--canvas)", color: "var(--ink)",
  };

  return (
    <div>
      {banners.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--ink-tertiary)", margin: "0 0 12px" }}>
          Баннеров нет — на сайте показываются встроенные по умолчанию (Новинки/Акции). Добавьте свои ниже.
        </p>
      )}

      {banners.map((b, i) => (
        <div key={b.id ?? i} style={{ border: "1px solid var(--hairline-soft)", borderRadius: "var(--radius-md)", padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <b style={{ fontSize: 13 }}>Баннер {i + 1}</b>
            <span style={{ display: "flex", gap: 6 }}>
              <button type="button" style={btn} onClick={() => move(i, -1)} disabled={i === 0} title="Выше">↑</button>
              <button type="button" style={btn} onClick={() => move(i, 1)} disabled={i === banners.length - 1} title="Ниже">↓</button>
              <button type="button" style={{ ...btn, borderColor: "var(--danger, #c0392b)", color: "var(--danger, #c0392b)" }} onClick={() => remove(i)}>Удалить</button>
            </span>
          </div>

          {/* Превью картинки / заглушки */}
          <div style={{ position: "relative", height: 90, borderRadius: 8, overflow: "hidden", marginBottom: 12,
            background: `linear-gradient(120deg, ${b.from || "#003399"}, ${b.to || "#3b7dd8"})` }}>
            {b.image && <img src={b.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
            <span style={{ position: "absolute", left: 12, bottom: 8, color: "#fff", fontWeight: 700, textShadow: "0 1px 6px rgba(0,0,0,.4)" }}>{b.title}</span>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <label style={{ ...btn, background: "var(--surface, #f5f6f8)" }}>
              {uploading === i ? "Загрузка…" : "Загрузить картинку"}
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => uploadImage(i, e.target.files?.[0])} disabled={uploading === i} />
            </label>
            {b.image && <button type="button" style={btn} onClick={() => update(i, { image: "" })}>Убрать картинку</button>}
          </div>

          <div style={field}>
            <label className="form-label">Заголовок</label>
            <input className="form-input" value={b.title ?? ""} onChange={(e) => update(i, { title: e.target.value })} />
          </div>
          <div style={field}>
            <label className="form-label">Подзаголовок</label>
            <input className="form-input" value={b.subtitle ?? ""} onChange={(e) => update(i, { subtitle: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ ...field, flex: 1 }}>
              <label className="form-label">Текст кнопки</label>
              <input className="form-input" value={b.cta ?? ""} onChange={(e) => update(i, { cta: e.target.value })} placeholder="В каталог" />
            </div>
            <div style={{ ...field, flex: 1 }}>
              <label className="form-label">Ссылка</label>
              <input className="form-input" value={b.href ?? ""} onChange={(e) => update(i, { href: e.target.value })} placeholder="/catalog" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>Цвета заглушки (без картинки):</span>
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(b.from || "") ? b.from! : "#003399"} onChange={(e) => update(i, { from: e.target.value })} title="Начало градиента" />
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(b.to || "") ? b.to! : "#3b7dd8"} onChange={(e) => update(i, { to: e.target.value })} title="Конец градиента" />
          </div>
        </div>
      ))}

      <button type="button" onClick={add}
        style={{ ...btn, padding: "9px 16px", fontWeight: 600, borderStyle: "dashed" }}>
        + Добавить баннер
      </button>
    </div>
  );
}
