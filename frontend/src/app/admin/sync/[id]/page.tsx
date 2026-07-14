"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import HelpHint from "@/components/HelpHint";
import { adminFetch, adminFetchText } from "@/lib/adminApi";
import { formatMsk } from "@/lib/format";

interface SyncDetail {
  id: number; source: string; status: string;
  products_created: number; products_updated: number;
  error_message: string | null; started_at: string; finished_at: string | null;
  changes_only: boolean; products_in_xml: number; has_xml: boolean;
  counts: { created: number; updated: number; skipped: number };
}

interface SyncChange {
  id: number; product_id: string | null; moysklad_id: string; name: string;
  action: string; changed_fields: Record<string, [unknown, unknown]>;
  has_image_field: boolean; images_in_xml: string[];
}

const ACTION_LABEL: Record<string, string> = { created: "создан", updated: "изменён", skipped: "без изменений" };
const ACTION_COLOR: Record<string, string> = { created: "var(--success)", updated: "var(--primary)", skipped: "var(--ink-secondary)" };
const FIELD_LABEL: Record<string, string> = {
  name: "Название", article: "Артикул", code: "Код", category_id: "Категория",
  price: "Цена", stock: "Остаток", description: "Описание", attributes: "Характеристики",
  images: "Изображения", is_new: "Новинка", is_sale: "Распродажа", is_hot: "Убойные цены",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "— (пусто)";
  return String(v);
}

export default function SyncDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [log, setLog] = useState<SyncDetail | null>(null);
  const [changes, setChanges] = useState<SyncChange[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [xml, setXml] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<SyncDetail>(`/sync-logs/${id}`).then(setLog).catch(() => {});
    adminFetch<SyncChange[]>(`/sync-logs/${id}/changes`).then(setChanges).catch(() => {});
  }, [id]);

  async function showXml(msId: string) {
    setXml("Загрузка…");
    try {
      setXml(await adminFetchText(`/sync-logs/${id}/products/${msId}/xml`));
    } catch {
      setXml("XML этого обмена не сохранён или товар в нём не найден.");
    }
  }

  const box = { background: "var(--canvas)", border: "1px solid var(--hairline-soft)", borderRadius: "var(--radius-lg)" };

  return (
    <AdminShell>
      <button onClick={() => router.push("/admin/sync")}
              style={{ marginBottom: 16, background: "none", border: "none", color: "var(--ink-secondary)", cursor: "pointer", fontSize: 14 }}>
        ← К журналу синхронизаций
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Обмен #{id}</h1>
        <HelpHint text="Детализация одного обмена: какие товары пришли, какие поля изменились и какие изображения прислал МойСклад." />
      </div>

      {log && (
        <div style={{ ...box, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <span style={{ fontWeight: 700, color: log.status === "error" ? "var(--critical)" : "var(--success)" }}>
              {log.status}
            </span>
            <span style={{ fontSize: 13, color: "var(--ink-secondary)" }}>{formatMsk(log.finished_at)}</span>
            {log.has_xml && (
              <a className="btn btn--ghost btn--sm" href={`/api/v1/admin/sync-logs/${id}/xml`} download
                 style={{ marginLeft: "auto" }}>
                Скачать import.xml
              </a>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
            {[
              ["Выгрузка", log.changes_only ? "дельта" : "полный каталог"],
              ["Товаров в XML", log.products_in_xml],
              ["Создано", log.counts.created],
              ["Изменено", log.counts.updated],
              ["Без изменений", log.counts.skipped],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p style={{ fontSize: 12, color: "var(--ink-secondary)", marginBottom: 2 }}>{label}</p>
                <p style={{ fontSize: 18, fontWeight: 700 }}>{value}</p>
              </div>
            ))}
          </div>

          {log.error_message && <p style={{ color: "var(--critical)", fontSize: 13, marginTop: 12 }}>{log.error_message}</p>}
        </div>
      )}

      {changes.length === 0 ? (
        <div style={{ ...box, padding: 32, textAlign: "center", color: "var(--ink-secondary)" }}>
          По этому обмену история товаров не записана (обмен прошёл до включения детализации).
        </div>
      ) : (
        <div style={{ ...box, overflow: "hidden" }}>
          {changes.map(c => (
            <div key={c.id} style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
              <div onClick={() => setOpen(open === c.id ? null : c.id)}
                   style={{ padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }}>
                <span style={{ color: ACTION_COLOR[c.action], fontWeight: 600, fontSize: 12, minWidth: 110 }}>
                  {ACTION_LABEL[c.action] ?? c.action}
                </span>
                <span style={{ flex: 1, fontSize: 14 }}>{c.name}</span>
                {c.images_in_xml.length > 0 && (
                  <span style={{
                    fontSize: 12, color: "var(--ink-secondary)", padding: "2px 8px",
                    border: "1px solid var(--hairline-soft)", borderRadius: 999, whiteSpace: "nowrap",
                  }}>
                    фото: {c.images_in_xml.length}
                  </span>
                )}
              </div>

              {open === c.id && (
                <div style={{ padding: "0 16px 16px 16px", fontSize: 13 }}>
                  <p style={{ color: "var(--ink-secondary)", marginBottom: 8 }}>Ид МойСклад: {c.moysklad_id}</p>

                  <b>Изменённые поля</b>
                  {Object.keys(c.changed_fields).length === 0 ? (
                    <p style={{ color: "var(--ink-secondary)", margin: "4px 0 12px" }}>— нет</p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", margin: "6px 0 12px" }}>
                      <tbody>
                        {Object.entries(c.changed_fields).map(([f, [was, now]]) => (
                          <tr key={f}>
                            <td style={{ padding: "4px 8px 4px 0", color: "var(--ink-secondary)", width: 140 }}>{FIELD_LABEL[f] ?? f}</td>
                            <td style={{ padding: "4px 8px" }}>{fmt(was)}</td>
                            <td style={{ padding: "4px 8px", color: "var(--ink-secondary)" }}>→</td>
                            <td style={{ padding: "4px 8px", fontWeight: 600 }}>{fmt(now)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <b>Изображения в XML</b>
                  <p style={{ color: "var(--ink-secondary)", margin: "4px 0 8px" }}>
                    Тег &lt;Картинка&gt;: {c.has_image_field ? "был" : "не приходил"}
                    {c.images_in_xml.length > 0 && ` · файлов: ${c.images_in_xml.length} (порядок как в XML)`}
                  </p>
                  {c.images_in_xml.length > 0 && c.product_id && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                      {c.images_in_xml.map((f, i) => (
                        <div key={f} style={{ textAlign: "center" }}>
                          <img src={`/api/v1/products/${c.product_id}/image?n=${i}`} alt="" width={56} height={56}
                               style={{ objectFit: "contain", border: "1px solid var(--hairline-soft)", borderRadius: 6, background: "var(--paper)" }} />
                          <p style={{ fontSize: 10, color: "var(--ink-secondary)", maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {i === 0 ? "на витрине" : `#${i + 1}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  <ul style={{ margin: "0 0 10px 16px", color: "var(--ink-secondary)", fontSize: 12 }}>
                    {c.images_in_xml.map(f => <li key={f}>{f}</li>)}
                  </ul>

                  <button onClick={() => showXml(c.moysklad_id)}
                          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--hairline-soft)", background: "var(--paper)", cursor: "pointer", fontSize: 13 }}>
                    Показать XML товара
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {xml !== null && (
        <div onClick={() => setXml(null)}
             style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 100 }}>
          <pre onClick={e => e.stopPropagation()}
               style={{ ...box, padding: 16, maxWidth: 900, maxHeight: "80vh", overflow: "auto", fontSize: 12, whiteSpace: "pre-wrap", width: "100%" }}>
            {xml}
          </pre>
        </div>
      )}
    </AdminShell>
  );
}
