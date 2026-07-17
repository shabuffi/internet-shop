"use client";

import { useEffect, useMemo, useState } from "react";
import HelpHint from "@/components/HelpHint";
import AdminToggle from "@/components/AdminToggle";
import CategoryPicker from "@/components/CategoryPicker";
import CategoryImage from "@/components/CategoryImage";
import { adminFetch } from "@/lib/adminApi";
import { cleanCategoryName } from "@/lib/format";

// Категория с её собственной иконкой (иконкой управляет вкладка «Категории»).
interface Cat {
  id: string;
  name: string;
  icon: string | null;
}

const cardStyle: React.CSSProperties = {
  background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)",
  padding: "28px 32px", maxWidth: 720, marginBottom: 24,
};

/**
 * Вкладка «Топ категорий» — 8 слотов главной. В каждом ТОЛЬКО выбор категории; порядок слотов =
 * порядок плиток на главной. Иконка здесь НЕ загружается — она свойство категории (вкладка
 * «Категории»); превью показывается справочно и следует за иконкой категории автоматически.
 */
export default function TopCategoriesPanel() {
  // slots — category_id по слотам (пустая строка = слот не заполнен).
  const [slots, setSlots] = useState<string[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  // Источник блока на главной: true — новая система (слоты ниже), false — старые встроенные плитки.
  // Настройка top_categories_admin в БД; переключается тумблером (сохраняется сразу).
  const [useAdminSource, setUseAdminSource] = useState(true);
  const [sourceSaving, setSourceSaving] = useState(false);

  useEffect(() => {
    // Категории — все синхронизированные из БД (к API МойСклад не ходим).
    adminFetch<Cat[]>("/categories")
      .then((d) => setCats(d.map((c) => ({ ...c, name: cleanCategoryName(c.name) }))))
      .catch(() => setCats([]));
    adminFetch<{ slots: string[] }>("/top-categories")
      .then((d) => setSlots(d.slots || []))
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoaded(true));
    // Текущее положение переключателя источника (по умолчанию — новая система).
    adminFetch<{ top_categories_admin?: boolean }>("/settings")
      .then((d) => setUseAdminSource(d.top_categories_admin !== false))
      .catch(() => {});
  }, []);

  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const sortedCats = useMemo(
    () => [...cats].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [cats],
  );
  // Категории, уже занятые в слотах: одну категорию нельзя выбрать дважды —
  // CategoryPicker прячет их из списков остальных слотов (кроме собственного значения).
  const usedIds = useMemo(() => new Set(slots.filter(Boolean)), [slots]);

  function setSlot(i: number, category_id: string) {
    setSlots((prev) => prev.map((s, k) => (k === i ? category_id : s)));
    setSaved(false);
  }

  // Переключение источника блока — сохраняем сразу (оптимистично, с откатом при ошибке).
  // На главной изменение видно в течение ~60с (store-info кешируется revalidate:60).
  async function setSource(v: boolean) {
    setUseAdminSource(v);
    setSourceSaving(true); setError("");
    try {
      await adminFetch("/settings", {
        method: "POST",
        body: JSON.stringify({ top_categories_admin: v ? "1" : "0" }),
      });
    } catch (e) {
      setUseAdminSource(!v);   // откат
      setError(e instanceof Error ? e.message : "Не удалось переключить источник");
    } finally {
      setSourceSaving(false);
    }
  }

  async function save() {
    setSaving(true); setError("");
    try {
      await adminFetch("/top-categories", { method: "POST", body: JSON.stringify({ slots }) });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p style={{ color: "var(--ink-secondary)" }}>Загрузка…</p>;

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <p style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>Топ категорий</p>
        <HelpHint text={"Блок плиток «Популярные разделы» на главной. Ровно 8 слотов: в каждом выберите категорию. Порядок слотов = порядок плиток. Иконка берётся из самой категории (вкладка «Категории») — здесь её не загружают. Пустые слоты на главной не показываются; если не заполнен ни один — блок скрыт целиком."} />
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 20 }}>
        Только выбор категории и порядок. Иконку категории задаёт вкладка «Категории» и она подставляется автоматически.
      </p>

      {/* Переключатель источника блока на главной. */}
      <div style={{ marginBottom: 20 }}>
        <AdminToggle
          checked={useAdminSource}
          onChange={setSource}
          disabled={sourceSaving}
          label="Управлять блоком из админки"
          hint={useAdminSource
            ? "На главной показываются плитки из слотов ниже."
            : "Сейчас на главной — старые встроенные плитки. Слоты ниже вступят в силу после включения."}
          labelHint={"Переключатель источника блока «Популярные разделы» на главной. Включено — блок строится из слотов ниже (новая система: иконка — свойство категории). Выключено — показываются прежние встроенные плитки (Бытовая химия, Хозтовары и т.д.)."} />
      </div>

      {error && <p className="form-error" style={{ marginBottom: 16 }}>{error}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        {slots.map((cid, i) => {
          const cat = byId.get(cid);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
              borderRadius: 10, border: "1px solid var(--hairline-soft, #e5e7eb)", background: "var(--canvas, #fff)" }}>
              <span style={{ color: "var(--ink-secondary)", fontSize: 13, width: 60, flexShrink: 0 }}>Слот {i + 1}</span>

              {/* Изображение категории (read-only превью; следует за вкладкой «Категории»).
                  Категория выбрана, но своей иконки нет → нейтральная монограмма (не фото). */}
              <span title="Изображение категории (меняется во вкладке «Категории»)"
                style={{ width: 48, height: 48, flexShrink: 0, display: "inline-flex", alignItems: "center",
                justifyContent: "center", borderRadius: 8, background: "var(--surface, #f5f6f8)",
                border: "1px solid var(--hairline-soft)", overflow: "hidden" }}>
                {cat
                  ? <CategoryImage icon={cat.icon} name={cat.name} letterSize={22}
                      imgStyle={{ maxWidth: 40, maxHeight: 40, objectFit: "contain" }} />
                  : <span style={{ color: "var(--ink-tertiary)", fontSize: 18 }}>—</span>}
              </span>

              <CategoryPicker
                value={cid}
                onChange={(id) => setSlot(i, id)}
                options={sortedCats}
                excludeIds={usedIds}
                ariaLabel={`Категория для слота ${i + 1}`}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={save} disabled={saving} type="button" className="btn btn-primary">
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
        {saved && <span style={{ color: "var(--stock, #16794a)", fontSize: 14, fontWeight: 600 }}>✓ Сохранено</span>}
      </div>
    </div>
  );
}
