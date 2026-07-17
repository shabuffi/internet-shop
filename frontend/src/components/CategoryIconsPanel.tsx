"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HelpHint from "@/components/HelpHint";
import CategoryImage from "@/components/CategoryImage";
import { adminFetch, adminUpload } from "@/lib/adminApi";
import { cleanCategoryName } from "@/lib/format";

// Категория с её собственной иконкой (свойство категории, не блока «Топ категорий»).
interface Cat {
  id: string;
  name: string;
  icon: string | null;   // имя файла в media_storage либо null (без иконки)
}

const cardStyle: React.CSSProperties = {
  background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)",
  padding: "28px 32px", maxWidth: 720, marginBottom: 24,
};

/**
 * Вкладка «Категории» — иконка КАЖДОЙ категории (одна на категорию, свойство самой категории).
 * Иконка автоматически используется везде, где показывается категория (главная «Топ категорий»
 * и др.). Список — все синхронизированные из МойСклад категории (к API МойСклад не ходим).
 */
export default function CategoryIconsPanel() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  // id категории, у которой прямо сейчас грузится иконка (блокируем её кнопки).
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    adminFetch<Cat[]>("/categories")
      .then((d) => setCats(d.map((c) => ({ ...c, name: cleanCategoryName(c.name) }))))
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoaded(true));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...cats].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    if (!q) return sorted;
    return sorted.filter((c) => c.name.toLowerCase().includes(q));
  }, [cats, query]);

  function patch(id: string, icon: string | null) {
    setCats((prev) => prev.map((c) => (c.id === id ? { ...c, icon } : c)));
  }

  async function onUpload(id: string, file?: File | null) {
    if (!file) return;
    setBusyId(id); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { name } = await adminUpload<{ name: string }>(`/categories/${id}/icon`, fd);
      patch(id, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить иконку");
    } finally {
      setBusyId(null);
      const el = fileRefs.current[id];
      if (el) el.value = "";
    }
  }

  async function onDelete(id: string) {
    setBusyId(id); setError("");
    try {
      await adminFetch(`/categories/${id}/icon`, { method: "DELETE" });
      patch(id, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить иконку");
    } finally {
      setBusyId(null);
    }
  }

  if (!loaded) return <p style={{ color: "var(--ink-secondary)" }}>Загрузка…</p>;

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <p style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>Категории</p>
        <HelpHint text={"Иконка КАЖДОЙ категории. Иконка — свойство самой категории: одна на категорию, автоматически используется везде, где категория показывается (в том числе в блоке «Топ категорий» на главной). Без своей иконки категория показывается с аккуратной нейтральной заглушкой (первая буква названия) — не с фото. Список — все категории, синхронизированные из МойСклад."} />
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 16 }}>
        Загрузите, замените или удалите иконку категории. Без своей иконки — аккуратная нейтральная заглушка (первая буква названия).
      </p>

      {error && <p className="form-error" style={{ marginBottom: 16 }}>{error}</p>}

      <input
        className="form-input"
        placeholder="Поиск категории…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 16 }}
        aria-label="Поиск категории"
      />

      {filtered.length === 0 ? (
        <p style={{ color: "var(--ink-secondary)", fontSize: 14 }}>
          {cats.length === 0 ? "Категорий пока нет — они появятся после синхронизации с МойСклад." : "Ничего не найдено."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((c) => {
            const busy = busyId === c.id;
            return (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                borderRadius: 10, border: "1px solid var(--hairline-soft, #e5e7eb)", background: "var(--canvas, #fff)" }}>
                <span style={{ width: 44, height: 44, flexShrink: 0, display: "inline-flex", alignItems: "center",
                  justifyContent: "center", borderRadius: 8, background: "var(--surface, #f5f6f8)",
                  border: "1px solid var(--hairline-soft)", overflow: "hidden" }}>
                  {/* Своя иконка есть → показываем её; нет → нейтральная монограмма. */}
                  <CategoryImage icon={c.icon} name={c.name} letterSize={20}
                    imgStyle={{ maxWidth: 36, maxHeight: 36, objectFit: "contain" }} />
                </span>

                <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap" }}>{c.name}</span>

                <input
                  ref={(el) => { fileRefs.current[c.id] = el; }}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  style={{ display: "none" }}
                  onChange={(e) => onUpload(c.id, e.target.files?.[0])}
                />
                <button type="button" disabled={busy}
                  onClick={() => fileRefs.current[c.id]?.click()}
                  style={{ flexShrink: 0, whiteSpace: "nowrap", padding: "7px 12px", fontSize: 13,
                    border: "1px solid var(--hairline-soft)", borderRadius: 8, cursor: "pointer",
                    background: "var(--canvas)", color: "var(--ink)" }}>
                  {busy ? "…" : c.icon ? "Заменить" : "Иконка"}
                </button>
                {c.icon && (
                  <button type="button" onClick={() => onDelete(c.id)} disabled={busy}
                    aria-label={`Удалить иконку категории ${c.name}`} title="Удалить иконку"
                    style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, cursor: "pointer",
                      border: "1px solid var(--hairline-soft)", background: "var(--canvas)",
                      color: "var(--danger, #c0392b)", fontSize: 15, lineHeight: 1 }}>✕</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
