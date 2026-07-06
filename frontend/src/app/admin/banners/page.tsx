"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import HelpHint from "@/components/HelpHint";
import BannersEditor from "@/components/BannersEditor";
import { adminFetch } from "@/lib/adminApi";

// Управление баннерами слайдера — для владельца магазина (обычная админка).
export default function AdminBannersPage() {
  const [enabled, setEnabled] = useState(false);
  const [json, setJson] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch<{ banners_enabled: boolean; home_banners: string }>("/banners")
      .then((d) => { setEnabled(!!d.banners_enabled); setJson(d.home_banners || ""); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true); setError("");
    try {
      await adminFetch("/banners", { method: "POST", body: JSON.stringify({ banners_enabled: enabled, home_banners: json }) });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Баннеры</h1>
        <HelpHint text={"Слайдер баннеров показывается вверху каталога. Добавляйте баннеры, загружайте картинки (без картинки — заглушка-градиент), меняйте порядок. Пусто → встроенные Новинки/Акции."} />
      </div>

      {!loaded ? (
        <p style={{ color: "var(--ink-secondary)" }}>Загрузка…</p>
      ) : (
        <div style={{ maxWidth: 620 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, cursor: "pointer" }}>
            <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setSaved(false); }} />
            <span style={{ fontSize: 15, fontWeight: 600 }}>Показывать слайдер на сайте</span>
          </label>

          <BannersEditor value={json} onChange={(v) => { setJson(v); setSaved(false); }} />

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 20 }}>
            <button onClick={save} disabled={saving} type="button" style={{
              padding: "11px 24px", borderRadius: "var(--radius-md)", border: "none",
              background: "var(--primary, #003399)", color: "#fff", fontWeight: 600, fontSize: 14,
              cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
            }}>{saving ? "Сохранение…" : "Сохранить"}</button>
            {saved && <span style={{ color: "var(--stock, #16794a)", fontSize: 14, fontWeight: 600 }}>✓ Сохранено</span>}
            {error && <span style={{ color: "var(--danger, #c0392b)", fontSize: 14 }}>{error}</span>}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
