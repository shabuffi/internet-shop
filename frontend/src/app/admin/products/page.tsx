"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { adminFetch, adminUpload } from "@/lib/adminApi";

interface AdminProduct { id: string; name: string; article: string | null; price: string; stock: number; available: boolean; images: string[]; images_manual: boolean; is_active: boolean; synced_at: string | null; }

export default function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [ver, setVer] = useState(0);                       // для сброса кэша миниатюр
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    adminFetch<{ items: AdminProduct[]; total: number }>("/products").then(d => { setProducts(d.items); setTotal(d.total); }).catch(() => {});
  }
  useEffect(() => { load(); }, []);

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

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Товары</h1>
        <span style={{ fontSize: 14, color: "var(--ink-secondary)" }}>{total} всего</span>
      </div>

      <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", overflow: "hidden" }}>
        {products.length === 0 ? (
          <p style={{ padding: 32, color: "var(--ink-secondary)", textAlign: "center" }}>Товаров нет — запустите синхронизацию</p>
        ) : (
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
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {p.images.map((img, i) => (
                        <span key={img} style={{ position: "relative", lineHeight: 0 }}>
                          <img src={`/api/v1/products/${p.id}/image?n=${i}&v=${ver}`} alt=""
                            width={40} height={40}
                            style={{ objectFit: "cover", borderRadius: 6, border: "1px solid var(--hairline-soft)" }} />
                          <button onClick={() => deleteImage(p.id, img)} title="Удалить фото"
                            style={{ position: "absolute", top: -7, right: -7, width: 18, height: 18, borderRadius: 999,
                              border: "none", background: "var(--ink)", color: "#fff", fontSize: 12, lineHeight: "16px",
                              cursor: "pointer", padding: 0 }}>×</button>
                        </span>
                      ))}
                      <label title="Загрузить фото"
                        style={{ width: 40, height: 40, borderRadius: 6, border: "1px dashed var(--graphite)",
                          display: "flex", alignItems: "center", justifyContent: "center", cursor: busyId === p.id ? "wait" : "pointer",
                          color: "var(--graphite)", fontSize: 20, opacity: busyId === p.id ? 0.5 : 1 }}>
                        ＋
                        <input type="file" accept="image/*" hidden
                          onChange={e => { uploadImage(p.id, e.target.files?.[0]); e.target.value = ""; }} />
                      </label>
                    </div>
                  </td>
                  <td style={{ padding: "14px 16px", fontWeight: 500 }}>{p.name}</td>
                  <td style={{ padding: "14px 16px", color: "var(--ink-secondary)" }}>{p.article ?? "—"}</td>
                  <td style={{ padding: "14px 16px", fontWeight: 600 }}>{Number(p.price).toFixed(2)} ₽</td>
                  <td style={{ padding: "14px 16px" }}>
                    <button
                      onClick={() => toggleAvailability(p.id, !p.available)}
                      title="Нажмите, чтобы переключить наличие"
                      style={{
                        fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 999, cursor: "pointer",
                        border: "1px solid " + (p.available ? "var(--stock)" : "var(--hairline-soft)"),
                        background: p.available ? "var(--stock-soft)" : "var(--cloud)",
                        color: p.available ? "var(--stock)" : "var(--ink-tertiary)",
                      }}
                    >
                      {p.available ? "В наличии" : "Нет"}
                    </button>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: p.is_active ? "var(--success)" : "var(--ink-tertiary)" }}>
                      {p.is_active ? "Активен" : "Скрыт"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 12, color: "var(--ink-secondary)" }}>
                    {p.synced_at ? new Date(p.synced_at).toLocaleString("ru") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
