"use client";

import { useEffect, useRef, useState } from "react";
import AdminShell from "@/components/AdminShell";
import HelpHint from "@/components/HelpHint";
import { adminFetch, adminUpload } from "@/lib/adminApi";
import { brandImageUrl, type Brand } from "@/lib/brands";

// «Настройка сайта» → Бренды: загрузка логотипов, порядок (стрелки), удаление, сохранение.
export default function AdminSitePage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    adminFetch<{ brands: Brand[] }>("/brands")
      .then((d) => { setBrands(d.brands || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  function markUnsaved() { setSaved(false); }

  async function onUpload(file?: File) {
    if (!file) return;
    setUploading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const added = await adminUpload<Brand>("/brands/upload", fd);
      setBrands((prev) => [...prev, added]);
      markUnsaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить логотип");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function move(i: number, dir: -1 | 1) {
    setBrands((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    markUnsaved();
  }

  function remove(i: number) {
    setBrands((prev) => prev.filter((_, k) => k !== i));
    markUnsaved();
  }

  async function save() {
    setSaving(true); setError("");
    try {
      const d = await adminFetch<{ brands: Brand[] }>("/brands", {
        method: "POST", body: JSON.stringify({ brands }),
      });
      setBrands(d.brands || []);
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  const iconBtn: React.CSSProperties = {
    width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center",
    borderRadius: 8, border: "1px solid var(--hairline-soft, #e5e7eb)", background: "var(--canvas, #fff)",
    color: "var(--ink)", cursor: "pointer", fontSize: 15, lineHeight: 1,
  };

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Настройка сайта</h1>
      </div>

      <div style={{ maxWidth: 720 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 0 6px" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Бренды</h2>
          <HelpHint text={"Логотипы брендов показываются слайдером над футером главной. Загружайте PNG (лучше с прозрачным фоном) или JPG; порядок задаётте стрелками."} />
        </div>

        {/* Рекомендации по загрузке */}
        <div style={{ background: "var(--surface, #f5f6f8)", borderRadius: 10, padding: "12px 14px",
          fontSize: 13, lineHeight: 1.6, color: "var(--ink-secondary, #4b5563)", marginBottom: 16 }}>
          <b style={{ color: "var(--ink)" }}>Рекомендации к логотипам:</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            <li><b>PNG с прозрачным фоном</b> — покажется на фоне сайта; <b>JPG</b> — как есть (свой фон).</li>
            <li>Все логотипы выравниваются по одной высоте, ширина — по пропорциям.</li>
            <li>Желательно: высота от 100&nbsp;px, горизонтальная ориентация, вес до&nbsp;~300&nbsp;КБ.</li>
          </ul>
        </div>

        {!loaded ? (
          <p style={{ color: "var(--ink-secondary)" }}>Загрузка…</p>
        ) : (
          <>
            {/* Загрузка */}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
              padding: "9px 16px", borderRadius: 10, border: "1px dashed var(--accent, #003399)",
              color: "var(--accent, #003399)", fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
              {uploading ? "Загрузка…" : "＋ Загрузить логотип"}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
                style={{ display: "none" }} disabled={uploading}
                onChange={(e) => onUpload(e.target.files?.[0])} />
            </label>

            {/* Список логотипов */}
            {brands.length === 0 ? (
              <p style={{ color: "var(--ink-secondary)", fontSize: 14, marginBottom: 16 }}>
                Логотипов пока нет — загрузите первый.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {brands.map((b, i) => (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12,
                    padding: "8px 12px", borderRadius: 10, border: "1px solid var(--hairline-soft, #e5e7eb)",
                    background: "var(--canvas, #fff)" }}>
                    <span style={{ color: "var(--ink-secondary)", fontSize: 13, width: 20, textAlign: "center" }}>{i + 1}</span>
                    {/* превью на клетчатом фоне, чтобы видеть прозрачность */}
                    <span style={{ height: 44, width: 120, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      borderRadius: 6, background: "repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 12px 12px" }}>
                      <img src={brandImageUrl(b.image)} alt="" style={{ maxHeight: 40, maxWidth: 112, objectFit: "contain", display: "block" }} />
                    </span>
                    <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
                      <button type="button" style={iconBtn} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Выше" title="Выше">↑</button>
                      <button type="button" style={iconBtn} onClick={() => move(i, 1)} disabled={i === brands.length - 1} aria-label="Ниже" title="Ниже">↓</button>
                      <button type="button" style={{ ...iconBtn, color: "var(--danger, #c0392b)" }} onClick={() => remove(i)} aria-label="Удалить" title="Удалить">✕</button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button onClick={save} disabled={saving} type="button" style={{
                padding: "11px 24px", borderRadius: "var(--radius-md)", border: "none",
                background: "var(--primary, #003399)", color: "#fff", fontWeight: 600, fontSize: 14,
                cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
              }}>{saving ? "Сохранение…" : "Сохранить"}</button>
              {saved && <span style={{ color: "var(--stock, #16794a)", fontSize: 14, fontWeight: 600 }}>✓ Сохранено</span>}
              {error && <span style={{ color: "var(--danger, #c0392b)", fontSize: 14 }}>{error}</span>}
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
