"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";
import HelpHint from "@/components/HelpHint";
import { adminFetch } from "@/lib/adminApi";
import { formatMsk } from "@/lib/format";
import { useIsMobile } from "@/lib/useIsMobile";
import { IconCheckCircle, IconClock, IconPencil, IconInfo, IconOrders, IconTrash } from "@/components/icons";

interface AdminUser {
  id: string; email: string; phone: string; customer_type: string;
  customer_name: string; inn: string | null; discount_percent: string; created_at: string;
  is_active: boolean; moysklad_ext_code: string | null;
}

interface UserOrder {
  id: string; number: string; status: string; moysklad_status?: string | null; total_amount: string;
  items_count: number; exported_at: string | null; created_at: string;
}

const TYPE_LABEL: Record<string, string> = { individual: "Физлицо", ip: "ИП", ooo: "ООО" };
const ORDER_STATUS_LABEL: Record<string, string> = { new: "Новый", cancelled: "Отменён", confirmed: "Подтверждён", shipped: "Отправлен", delivered: "Доставлен" };
const TABLE_COLS = 10;  // число колонок таблицы покупателей (для colSpan строки истории)

type SortKey = "is_active" | "customer_name" | "customer_type" | "inn" | "email" | "phone" | "discount_percent" | "moysklad_ext_code" | "created_at";
// Колонки таблицы: label + ключ сортировки (null — колонка не сортируется).
const COLS: { label: string; key: SortKey | null }[] = [
  { label: "Статус", key: "is_active" },
  { label: "Наименование", key: "customer_name" },
  { label: "Тип", key: "customer_type" },
  { label: "ИНН", key: "inn" },
  { label: "Email", key: "email" },
  { label: "Телефон", key: "phone" },
  { label: "Скидка %", key: "discount_percent" },
  { label: "Внешний код МС", key: "moysklad_ext_code" },
  { label: "Регистрация", key: "created_at" },
  { label: "", key: null },
];

const td: React.CSSProperties = { padding: "11px 12px", verticalAlign: "top" };
const btnPrimary: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 8, cursor: "pointer", border: "none",
  background: "var(--accent-2, #E02424)", color: "#fff", fontSize: 13, fontWeight: 700,
};
const btnOutline: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, cursor: "pointer",
  border: "1px solid var(--hairline-soft)", background: "var(--canvas)", color: "var(--ink)", fontSize: 13, fontWeight: 600,
};
const codeInputStyle: React.CSSProperties = {
  width: 150, fontSize: 13, padding: "6px 10px", borderRadius: 8, fontFamily: "ui-monospace, monospace",
  border: "1px solid var(--hairline-soft)", background: "var(--canvas)", color: "var(--ink)",
};

// Иконка «!» с всплывающим пояснением при наведении (кастомный тултип — надёжнее нативного title).
function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <IconInfo style={{ width: 16, height: 16, color: "var(--accent, #003399)", cursor: "help", flexShrink: 0 }} />
      {show && (
        <span role="tooltip" style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: 0, width: 300,
          background: "#1f2937", color: "#fff", fontSize: 12, fontWeight: 400, lineHeight: 1.45,
          padding: "9px 11px", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.18)",
          zIndex: 20, whiteSpace: "normal", textAlign: "left", pointerEvents: "none",
        }}>{text}</span>
      )}
    </span>
  );
}

// Одна строка покупателя: активация (как новый / как существующий) + редактирование кода (через карандаш).
function UserRow({ u, busy, isMobile, onPatch, onSaveDiscount, onDelete }: {
  u: AdminUser;
  busy: boolean;
  isMobile: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onSaveDiscount: (raw: string) => void;
  onDelete: () => void;
}) {
  const [activateExisting, setActivateExisting] = useState(false);
  const [editCode, setEditCode] = useState(false);
  const [codeInput, setCodeInput] = useState(u.moysklad_ext_code ?? "");
  const [showOrders, setShowOrders] = useState(false);
  const [orders, setOrders] = useState<UserOrder[] | null>(null);

  async function toggleOrders() {
    const next = !showOrders;
    setShowOrders(next);
    if (next && orders === null) {
      try {
        const d = await adminFetch<{ items: UserOrder[] }>(`/orders?user_id=${u.id}`);
        setOrders(d.items);
      } catch { setOrders([]); }
    }
  }

  // История заказов — компактный список (общий для мобилы и десктопа)
  const ordersHistory = orders === null
    ? <span style={{ fontSize: 13, color: "var(--ink-secondary)" }}>Загрузка…</span>
    : orders.length === 0
    ? <span style={{ fontSize: 13, color: "var(--ink-secondary)" }}>Заказов пока нет</span>
    : (
      <div style={{ border: "1px solid var(--hairline-soft)", borderRadius: 12, overflow: "hidden", background: "var(--canvas)" }}>
        {orders.map((o, i) => (
          <div key={o.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            flexWrap: "wrap", padding: "11px 14px", borderTop: i ? "1px solid var(--hairline-soft)" : "none" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
              <b style={{ fontSize: 13 }}>{o.number}</b>
              <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>{formatMsk(o.created_at)}</span>
              <span style={{ fontSize: 12, color: "var(--ink-tertiary)" }}>· {o.items_count} поз.</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600,
                padding: "3px 10px", borderRadius: 999, background: "var(--accent-soft, #e7edff)", color: "var(--accent, #003399)", whiteSpace: "nowrap" }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor" }} />
                {o.moysklad_status || ORDER_STATUS_LABEL[o.status] || o.status}
              </span>
              <b style={{ fontSize: 13, whiteSpace: "nowrap" }}>{Number(o.total_amount).toFixed(2)} ₽</b>
              <span title={o.exported_at ? "Выгружен в МойСклад" : "Ожидает выгрузки"}
                style={{ fontSize: 13, color: o.exported_at ? "var(--stock, #16794a)" : "var(--ink-tertiary)" }}>
                {o.exported_at ? "✓" : "…"}
              </span>
            </div>
          </div>
        ))}
      </div>
    );

  // ─── Мобильная карточка ───
  if (isMobile) {
    return (
      <div style={{ background: u.is_active ? "var(--canvas)" : "var(--accent-2-soft, #fdeaea)", border: "1px solid var(--hairline-soft)", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ fontWeight: 600, minWidth: 0 }}>{u.customer_name}</div>
          {u.is_active
            ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--stock, #16794a)", whiteSpace: "nowrap" }}><IconCheckCircle style={{ width: 15, height: 15 }} /> Активен</span>
            : <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--accent-2, #E02424)", whiteSpace: "nowrap" }}><IconClock style={{ width: 14, height: 14 }} /> Новый</span>}
        </div>

        {!u.is_active && (
          <div style={{ marginBottom: 12 }}>
            {!activateExisting ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" style={btnPrimary} disabled={busy} onClick={() => onPatch({ is_active: true })}>Активировать как нового</button>
                <button type="button" style={btnOutline} disabled={busy} onClick={() => { setCodeInput(u.moysklad_ext_code ?? ""); setActivateExisting(true); }}>Как существующего</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>«Внешний код» контрагента из МойСклад:</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="Внешний код МойСклад" style={codeInputStyle} />
                  <button type="button" style={btnPrimary} disabled={busy || !codeInput.trim()} onClick={() => { onPatch({ is_active: true, moysklad_ext_code: codeInput.trim() }); setActivateExisting(false); }}>Активировать</button>
                  <button type="button" style={btnOutline} disabled={busy} onClick={() => setActivateExisting(false)}>Отмена</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", fontSize: 13, marginBottom: 12 }}>
          <span style={{ color: "var(--ink-secondary)" }}>{TYPE_LABEL[u.customer_type] ?? u.customer_type}</span>
          {u.inn && <span style={{ color: "var(--ink-secondary)" }}>ИНН {u.inn}</span>}
          <span>{u.email}</span>
          <span style={{ color: "var(--ink-secondary)" }}>{u.phone}</span>
          <span style={{ color: "var(--ink-tertiary)" }}>{formatMsk(u.created_at)}</span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px", alignItems: "center", marginBottom: 12 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-secondary)" }}>
            Скидка %
            <input type="number" min={-30} max={9} step={1} defaultValue={Number(u.discount_percent)} aria-label={`Скидка ${u.customer_name}`} disabled={busy}
              onBlur={(e) => { if (Number(e.target.value) !== Number(u.discount_percent)) onSaveDiscount(e.target.value); }}
              style={{ width: 72, fontSize: 14, fontWeight: 600, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--hairline-soft)", background: "var(--canvas)", color: "var(--ink)", opacity: busy ? 0.5 : 1 }} />
          </label>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-secondary)", flexWrap: "wrap" }}>
            Код МС:
            {editCode ? (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="Внешний код" style={codeInputStyle} autoFocus />
                <button type="button" style={btnPrimary} disabled={busy} onClick={() => { onPatch({ moysklad_ext_code: codeInput.trim() }); setEditCode(false); }}>Сохранить</button>
                <button type="button" style={btnOutline} disabled={busy} onClick={() => { setCodeInput(u.moysklad_ext_code ?? ""); setEditCode(false); }}>Отмена</button>
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "ui-monospace, monospace", color: u.moysklad_ext_code ? "var(--ink)" : "var(--ink-tertiary)" }}>{u.moysklad_ext_code || "— не задан"}</span>
                <button type="button" onClick={() => { setCodeInput(u.moysklad_ext_code ?? ""); setEditCode(true); }} title="Изменить внешний код" disabled={busy}
                  style={{ display: "inline-flex", padding: 6, borderRadius: 8, cursor: "pointer", border: "1px solid var(--hairline-soft)", background: "var(--canvas)", color: "var(--ink-secondary)" }}>
                  <IconPencil style={{ width: 15, height: 15 }} />
                </button>
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--hairline-soft)", paddingTop: 12 }}>
          <button type="button" onClick={toggleOrders}
            style={{ padding: "6px 12px", borderRadius: 8, cursor: "pointer", border: "1px solid var(--hairline-soft)", background: "var(--canvas)", color: "var(--ink)", fontSize: 13, fontWeight: 600 }}>
            {showOrders ? "Скрыть заказы" : "Заказы"}
          </button>
          <button type="button" onClick={onDelete} disabled={busy}
            style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 8, cursor: busy ? "default" : "pointer", border: "1px solid var(--danger, #c0392b)", background: "transparent", color: "var(--danger, #c0392b)", fontSize: 13, fontWeight: 600, opacity: busy ? 0.5 : 1 }}>
            Удалить
          </button>
        </div>

        {showOrders && (
          <div style={{ marginTop: 12, borderTop: "1px solid var(--hairline-soft)", paddingTop: 10 }}>{ordersHistory}</div>
        )}
      </div>
    );
  }

  return (
    <>
    <tr style={{ borderBottom: showOrders ? "none" : "1px solid var(--hairline-soft)", background: u.is_active ? "transparent" : "var(--accent-2-soft, #fdeaea)" }}>
      {/* Статус / активация (ширину не форсируем — «Активен» узкий; кнопки активации переносятся) */}
      <td style={{ ...td, whiteSpace: "nowrap" }}>
        {u.is_active ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: "var(--stock, #16794a)" }}>
            <IconCheckCircle style={{ width: 16, height: 16 }} /> Активен
          </span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: "var(--accent-2, #E02424)" }}>
              <IconClock style={{ width: 15, height: 15 }} /> Новый
            </span>
            {!activateExisting ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" style={btnPrimary} disabled={busy} onClick={() => onPatch({ is_active: true })}>
                  Активировать как нового
                </button>
                <button type="button" style={btnOutline} disabled={busy} onClick={() => { setCodeInput(u.moysklad_ext_code ?? ""); setActivateExisting(true); }}>
                  Как существующего
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>Введите «Внешний код» контрагента из МойСклад:</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="Внешний код МойСклад" style={codeInputStyle} />
                  <button type="button" style={btnPrimary} disabled={busy || !codeInput.trim()}
                    onClick={() => { onPatch({ is_active: true, moysklad_ext_code: codeInput.trim() }); setActivateExisting(false); }}>
                    Активировать
                  </button>
                  <button type="button" style={btnOutline} disabled={busy} onClick={() => setActivateExisting(false)}>Отмена</button>
                </div>
              </div>
            )}
          </div>
        )}
      </td>

      <td style={{ ...td, fontWeight: 600 }}>{u.customer_name}</td>
      <td style={{ ...td, color: "var(--ink-secondary)" }}>{TYPE_LABEL[u.customer_type] ?? u.customer_type}</td>
      <td style={{ ...td, color: "var(--ink-secondary)" }}>{u.inn ?? "—"}</td>
      <td style={td}>{u.email}</td>
      <td style={{ ...td, color: "var(--ink-secondary)" }}>{u.phone}</td>

      {/* Скидка (правится сразу — не критично) */}
      <td style={td}>
        <input type="number" min={-30} max={9} step={1} defaultValue={Number(u.discount_percent)}
          aria-label={`Скидка ${u.customer_name}`} disabled={busy}
          onBlur={(e) => { if (Number(e.target.value) !== Number(u.discount_percent)) onSaveDiscount(e.target.value); }}
          style={{ width: 72, fontSize: 14, fontWeight: 600, padding: "6px 10px", borderRadius: 8,
            border: "1px solid var(--hairline-soft)", background: "var(--canvas)", color: "var(--ink)", opacity: busy ? 0.5 : 1 }} />
      </td>

      {/* Внешний код — меняется только через карандаш (явное действие) */}
      <td style={{ ...td, whiteSpace: "nowrap" }}>
        {editCode ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="Внешний код" style={codeInputStyle} autoFocus />
            <button type="button" style={btnPrimary} disabled={busy}
              onClick={() => { onPatch({ moysklad_ext_code: codeInput.trim() }); setEditCode(false); }}>Сохранить</button>
            <button type="button" style={btnOutline} disabled={busy}
              onClick={() => { setCodeInput(u.moysklad_ext_code ?? ""); setEditCode(false); }}>Отмена</button>
          </div>
        ) : (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: u.moysklad_ext_code ? "var(--ink)" : "var(--ink-tertiary)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}
              title={u.moysklad_ext_code ?? ""}>
              {u.moysklad_ext_code || "— не задан"}
            </span>
            <button type="button" onClick={() => { setCodeInput(u.moysklad_ext_code ?? ""); setEditCode(true); }}
              title="Изменить внешний код" disabled={busy}
              style={{ display: "inline-flex", padding: 6, borderRadius: 8, cursor: "pointer",
                border: "1px solid var(--hairline-soft)", background: "var(--canvas)", color: "var(--ink-secondary)" }}>
              <IconPencil style={{ width: 15, height: 15 }} />
            </button>
          </div>
        )}
      </td>

      <td style={{ ...td, color: "var(--ink-secondary)" }}>{formatMsk(u.created_at)}</td>
      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
        <div style={{ display: "inline-flex", gap: 6 }}>
          <button type="button" onClick={toggleOrders} title={showOrders ? "Скрыть заказы" : "История заказов покупателя"}
            aria-label="История заказов"
            style={{ display: "inline-flex", padding: 7, borderRadius: 8, cursor: "pointer",
              border: "1px solid " + (showOrders ? "var(--accent, #003399)" : "var(--hairline-soft)"),
              background: showOrders ? "var(--accent-soft, #e7edff)" : "var(--canvas)",
              color: showOrders ? "var(--accent, #003399)" : "var(--ink-secondary)" }}>
            <IconOrders style={{ width: 16, height: 16 }} />
          </button>
          <button type="button" onClick={onDelete} disabled={busy} title="Удалить покупателя" aria-label="Удалить"
            style={{ display: "inline-flex", padding: 7, borderRadius: 8, cursor: busy ? "default" : "pointer",
              border: "1px solid var(--danger, #c0392b)", background: "transparent",
              color: "var(--danger, #c0392b)", opacity: busy ? 0.5 : 1 }}>
            <IconTrash style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </td>
    </tr>
    {showOrders && (
      <tr style={{ borderBottom: "1px solid var(--hairline-soft)", background: u.is_active ? "var(--surface, #fafafa)" : "var(--accent-2-soft, #fdeaea)" }}>
        <td colSpan={TABLE_COLS} style={{ padding: "4px 16px 16px" }}>{ordersHistory}</td>
      </tr>
    )}
    </>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Единый контрагент для гостевых заказов (глобальная настройка ShopSettings)
  const [guestCode, setGuestCode] = useState("");
  const [guestSaving, setGuestSaving] = useState(false);
  const [guestSaved, setGuestSaved] = useState(false);
  // Поиск и сортировка (клиентские — покупателей немного)
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "created_at", dir: "desc" });
  const isMobile = useIsMobile();

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? users.filter((u) =>
          [u.customer_name, u.email, u.phone, u.inn ?? "", u.moysklad_ext_code ?? ""]
            .some((v) => v.toLowerCase().includes(q)))
      : users;
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (u: AdminUser): string | number => {
      if (sort.key === "is_active") return u.is_active ? 1 : 0;
      if (sort.key === "discount_percent") return Number(u.discount_percent);
      if (sort.key === "created_at") return u.created_at;   // ISO — сортируется хронологически
      return (u[sort.key] ?? "").toString().toLowerCase();
    };
    return [...list].sort((a, b) => {
      const av = val(a), bv = val(b);
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [users, query, sort]);

  function load() {
    adminFetch<AdminUser[]>("/users").then(setUsers).catch(() => {});
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    adminFetch<{ guest_moysklad_ext_code?: string }>("/settings")
      .then((s) => setGuestCode(s.guest_moysklad_ext_code ?? "")).catch(() => {});
  }, []);

  async function saveGuest() {
    setGuestSaving(true); setError("");
    try {
      await adminFetch("/settings", { method: "POST", body: JSON.stringify({ guest_moysklad_ext_code: guestCode.trim() }) });
      setGuestSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally { setGuestSaving(false); }
  }

  async function patchUser(id: string, patch: Record<string, unknown>) {
    setError(""); setBusyId(id);
    try {
      const updated = await adminFetch<AdminUser>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setUsers((us) => us.map((u) => (u.id === id ? updated : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
      load();
    } finally { setBusyId(null); }
  }

  async function saveDiscount(id: string, raw: string) {
    const pct = Number(raw);
    if (Number.isNaN(pct) || pct < -30 || pct > 9) { setError("Скидка должна быть числом от −30 до +9"); load(); return; }
    await patchUser(id, { discount_percent: pct });
  }

  async function deleteUser(id: string, name: string) {
    if (!confirm(`Удалить покупателя «${name}»? Аккаунт будет удалён безвозвратно. Его заказы сохранятся (станут гостевыми).`)) return;
    setError(""); setBusyId(id);
    try {
      await adminFetch(`/users/${id}`, { method: "DELETE" });
      setUsers((us) => us.filter((u) => u.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally { setBusyId(null); }
  }

  const pending = users.filter((u) => !u.is_active).length;

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Покупатели</h1>
        <HelpHint text={"Новые аккаунты ждут активации. «Активировать как нового» — контрагент создастся в МойСклад при первом заказе. «Как существующего» — впишите «Внешний код» контрагента из МойСклад, и заказы привяжутся к нему. Внешний код меняется кнопкой-карандашом.\n\nЦена: без регистрации — базовая цена МойСклад +10%; зарегистрированный клиент платит базовую цену (0%). В колонке «Скидка %» можно дать клиенту персональную скидку (например −10) или наценку (до +9). 0 — базовая цена."} />
        <span style={{ fontSize: 14, color: "var(--ink-secondary)" }}>
          {query ? `${visible.length} из ${users.length}` : `${users.length} всего`}
        </span>
        {pending > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-2, #E02424)" }}>{pending} ждут активации</span>}
        {error && <span style={{ fontSize: 13, color: "var(--critical, #c0392b)" }}>{error}</span>}
      </div>

      {/* Пояснение перенесено в «?» рядом с заголовком (не занимает место на странице). */}

      {/* Единый контрагент для гостевых заказов — компактная строка */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <InfoTooltip text="Все заказы без регистрации привязываются к этому контрагенту в МойСклад. В заказ добавляется «Гость: имя, телефон», чтобы под общим контрагентом было видно, кто заказал. Пусто → заказ уходит по телефону." />
          <label htmlFor="guest-code" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
            Гостевой контрагент МойСклад
          </label>
        </span>
        <input id="guest-code" value={guestCode} placeholder="Внешний код (пусто → по телефону)"
          onChange={(e) => { setGuestCode(e.target.value); setGuestSaved(false); }}
          style={{ ...codeInputStyle, width: 240 }} />
        <button type="button" onClick={saveGuest} disabled={guestSaving} style={{ ...btnOutline, fontWeight: 700 }}>
          {guestSaving ? "Сохраняем…" : "Сохранить"}
        </button>
        {guestSaved && <span style={{ fontSize: 13, color: "var(--stock, #16794a)", fontWeight: 600 }}>✓ Сохранено</span>}
      </div>

      {/* Поиск по покупателям */}
      <div style={{ marginBottom: 12, maxWidth: 360 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск: имя, email, телефон, ИНН, код…"
          style={{ width: "100%", fontSize: 14, padding: "8px 12px", borderRadius: 8,
            border: "1px solid var(--hairline-soft)", background: "var(--canvas)", color: "var(--ink)" }} />
      </div>

      {/* Сортировка на мобиле (на десктопе — клик по заголовку колонки) */}
      {isMobile && users.length > 0 && (
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--ink-secondary)" }}>Сортировка:</span>
          <select value={`${sort.key}:${sort.dir}`}
            onChange={(e) => { const [k, d] = e.target.value.split(":"); setSort({ key: k as SortKey, dir: d as "asc" | "desc" }); }}
            style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--hairline-soft)", background: "var(--canvas)", color: "var(--ink)" }}>
            <option value="created_at:desc">Сначала новые</option>
            <option value="created_at:asc">Сначала старые</option>
            <option value="customer_name:asc">Имя А–Я</option>
            <option value="is_active:asc">Сначала «Новые»</option>
            <option value="discount_percent:asc">Скидка ↑</option>
          </select>
        </div>
      )}

      {users.length === 0 ? (
        <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)" }}>
          <p style={{ padding: 32, color: "var(--ink-secondary)", textAlign: "center" }}>Зарегистрированных покупателей пока нет</p>
        </div>
      ) : visible.length === 0 ? (
        <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)" }}>
          <p style={{ padding: 32, color: "var(--ink-secondary)", textAlign: "center" }}>Ничего не найдено по «{query}»</p>
        </div>
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visible.map((u) => (
            <UserRow key={u.id} u={u} isMobile busy={busyId === u.id}
              onPatch={(patch) => patchUser(u.id, patch)}
              onSaveDiscount={(raw) => saveDiscount(u.id, raw)}
              onDelete={() => deleteUser(u.id, u.customer_name)} />
          ))}
        </div>
      ) : (
        <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                {COLS.map((col, i) => {
                  const activeSort = col.key && sort.key === col.key;
                  return (
                    <th key={col.label || i}
                      onClick={col.key ? () => toggleSort(col.key!) : undefined}
                      style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600,
                        color: activeSort ? "var(--ink)" : "var(--ink-secondary)", fontSize: 12, whiteSpace: "nowrap",
                        cursor: col.key ? "pointer" : "default", userSelect: "none" }}>
                      {col.label}{activeSort ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => (
                <UserRow key={u.id} u={u} isMobile={false} busy={busyId === u.id}
                  onPatch={(patch) => patchUser(u.id, patch)}
                  onSaveDiscount={(raw) => saveDiscount(u.id, raw)}
                  onDelete={() => deleteUser(u.id, u.customer_name)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
