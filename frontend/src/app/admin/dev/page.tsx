"use client";

import { useEffect, useState } from "react";
import { devFetch } from "@/lib/adminApi";
import SiteSettingsCard from "@/components/SiteSettingsCard";
import { IconEye, IconEyeOff } from "@/components/icons";

// Техническая форма (ВК / SMTP). Поля приходят с /dev/settings; секреты — маской «***».
interface DevForm {
  vk_group_token: string; vk_env: boolean; vk_peer_set: boolean; email_to: string;
  smtp_host: string; smtp_port: string; smtp_user: string; smtp_password: string; smtp_from: string;
}

const EMPTY: DevForm = {
  vk_group_token: "", vk_env: false, vk_peer_set: false, email_to: "",
  smtp_host: "", smtp_port: "587", smtp_user: "", smtp_password: "", smtp_from: "",
};

type Section = "vk" | "smtp";
const TEST_TO_KEY = "dev.testEmailTo";
type Note = { ok: boolean; text: string } | null;
interface TestResp { results: Record<string, string>; details?: Record<string, string>; to?: string }

const card: React.CSSProperties = {
  background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)",
  padding: "28px 32px", maxWidth: 520, margin: "0 auto",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 };
const outlineBtn: React.CSSProperties = {
  padding: "0 16px", height: 38, borderRadius: "var(--radius-md)", cursor: "pointer",
  border: "1px solid var(--graphite)", background: "transparent", color: "var(--ink)", fontWeight: 600, fontSize: 14,
};
const ghostBtn: React.CSSProperties = {
  padding: "0 12px", height: 32, borderRadius: "var(--radius-md)", cursor: "pointer", flexShrink: 0,
  border: "1px solid var(--hairline-soft)", background: "var(--canvas)", color: "var(--ink)", fontWeight: 600, fontSize: 13,
};

type Tab = "integration" | "site" | "diag" | "danger";
const TABS: { id: Tab; label: string }[] = [
  { id: "integration", label: "Интеграция" },
  { id: "site", label: "Настройки сайта" },
  { id: "diag", label: "Диагностика" },
  { id: "danger", label: "Опасная зона" },
];

// Цветная плашка статуса канала.
function StatusBadge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999,
      fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
      background: ok ? "var(--stock-soft)" : "var(--cloud)",
      color: ok ? "var(--stock)" : "var(--ink-secondary)",
      border: `1px solid ${ok ? "var(--stock)" : "var(--hairline-soft)"}` }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: ok ? "var(--stock)" : "var(--out)" }} />
      {text}
    </span>
  );
}

// Сообщение под кнопками (зелёное — успех, красное — ошибка).
function NoteLine({ note }: { note: Note }) {
  if (!note) return null;
  return (
    <p role="status" style={{ marginTop: 12, fontSize: 13, lineHeight: 1.45, fontWeight: 500,
      color: note.ok ? "var(--stock)" : "var(--error)" }}>
      {note.ok ? "✓ " : "✕ "}{note.text}
    </p>
  );
}

// Поле секрета (ключ / пароль). Сохранённое значение с сервера не приходит — показываем
// «задан» и кнопку «Заменить»; новое значение можно посмотреть глазком перед сохранением.
function SecretField({
  label, isSet, replacing, value, placeholder, onReplace, onCancel, onChange,
}: {
  label: string; isSet: boolean; replacing: boolean; value: string; placeholder: string;
  onReplace: () => void; onCancel: () => void; onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  const editing = replacing || !isSet;
  return (
    <div style={field}>
      <label className="form-label">{label}</label>
      {!editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 42, padding: "0 6px 0 14px",
          border: "1px solid var(--hairline-soft)", borderRadius: "var(--radius-md)", background: "var(--cloud)" }}>
          <span style={{ flex: 1, fontSize: 14, color: "var(--ink-secondary)" }}>
            <span style={{ letterSpacing: 2 }}>••••••••</span>&nbsp; сохранён
          </span>
          <button type="button" onClick={onReplace} style={ghostBtn}>Заменить</button>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <input className="form-input" type={show ? "text" : "password"} value={value}
            onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
            autoComplete="new-password" spellCheck={false} autoFocus={replacing}
            style={{ paddingRight: 44, width: "100%" }} />
          <button type="button" onClick={() => setShow((v) => !v)}
            aria-label={show ? "Скрыть" : "Показать"} title={show ? "Скрыть" : "Показать"}
            style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 34, height: 34,
              display: "grid", placeItems: "center", border: 0, background: "transparent", cursor: "pointer",
              color: "var(--ink-secondary)" }}>
            {show ? <IconEyeOff width={18} height={18} /> : <IconEye width={18} height={18} />}
          </button>
        </div>
      )}
      {replacing && isSet && (
        <button type="button" onClick={onCancel}
          style={{ alignSelf: "flex-start", border: 0, background: "none", padding: 0, cursor: "pointer",
            fontSize: 12, color: "var(--ink-secondary)", textDecoration: "underline" }}>
          Отмена — оставить сохранённый
        </button>
      )}
    </div>
  );
}

// Карточка одного канала: заголовок + статус, поля, «Сохранить» и «Проверить».
function SectionCard({
  title, hint, badge, children, onSave, saving, dirty, onTest, testing, testLabel, note,
}: {
  title: string; hint: React.ReactNode; badge: React.ReactNode; children: React.ReactNode;
  onSave: () => void; saving: boolean; dirty: boolean;
  onTest: () => void; testing: boolean; testLabel: string; note: Note;
}) {
  return (
    <section style={{ ...card, margin: "0 auto 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <p style={{ fontWeight: 600, fontSize: 16 }}>{title}</p>
        {badge}
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 18, lineHeight: 1.45 }}>{hint}</p>
      <form onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        {children}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
          <button className="btn btn-primary" type="submit" disabled={saving || !dirty}
            style={{ opacity: saving || !dirty ? 0.5 : 1 }}>
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
          <button type="button" onClick={onTest} disabled={testing || dirty} style={{ ...outlineBtn,
            opacity: testing || dirty ? 0.5 : 1, cursor: testing || dirty ? "not-allowed" : "pointer" }}
            title={dirty ? "Сначала сохраните изменения" : undefined}>
            {testing ? "Отправляем…" : testLabel}
          </button>
          {dirty && <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>Есть несохранённые изменения</span>}
        </div>
        <NoteLine note={note} />
      </form>
    </section>
  );
}

// Необратимое действие с защитой от случайного нажатия: кнопка активна только после
// того, как пользователь вручную ввёл точную фразу-подтверждение.
function DangerAction({
  title, desc, phrase, button, onRun, result, danger = true,
}: {
  title: string; desc: string; phrase: string; button: string;
  onRun: () => void | Promise<void>; result?: string; danger?: boolean;
}) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const armed = val.trim() === phrase;
  const color = danger ? "var(--danger, #c0392b)" : "var(--ink)";
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{title}</p>
      <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 12 }}>{desc}</p>
      <div style={field}>
        <label className="form-label" style={{ fontSize: 12 }}>
          Чтобы подтвердить, введите <b style={{ color }}>{phrase}</b>
        </label>
        <input className="form-input" value={val} onChange={(e) => setVal(e.target.value)}
          placeholder={phrase} autoComplete="off" spellCheck={false} />
      </div>
      <button type="button" disabled={!armed || busy}
        onClick={async () => { setBusy(true); try { await onRun(); setVal(""); } finally { setBusy(false); } }}
        style={{ padding: "0 16px", height: 38, borderRadius: "var(--radius-md)",
          cursor: armed && !busy ? "pointer" : "not-allowed",
          border: `1px solid ${color}`, background: armed ? color : "transparent",
          color: armed ? "#fff" : color, fontWeight: 600, fontSize: 14,
          opacity: armed && !busy ? 1 : 0.5, transition: "background .15s, opacity .15s" }}>
        {busy ? "Выполняется…" : button}
      </button>
      {result && <p style={{ marginTop: 10, fontSize: 13, color: "var(--ink-secondary)" }}>{result}</p>}
    </div>
  );
}

export default function DevPage() {
  const [tab, setTab] = useState<Tab>("integration");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState("");
  // saved — то, что сейчас на сервере; form — то, что в полях. Секреты в form: "" (не трогаем)
  // или новое значение, если нажали «Заменить».
  const [saved, setSaved] = useState<DevForm>(EMPTY);
  const [form, setForm] = useState<DevForm>(EMPTY);
  const [replacing, setReplacing] = useState<Record<Section, boolean>>({ vk: false, smtp: false });
  const [saving, setSaving] = useState<Section | null>(null);
  const [testing, setTesting] = useState<Section | null>(null);
  const [notes, setNotes] = useState<Record<Section, Note>>({ vk: null, smtp: null });
  // Куда слать пробное письмо: свой ящик разработчика, а не владельца. Помним в этом браузере.
  const [testTo, setTestTo] = useState("");
  useEffect(() => {
    try { setTestTo(localStorage.getItem(TEST_TO_KEY) ?? ""); } catch { /* приватный режим */ }
  }, []);
  function changeTestTo(v: string) {
    setTestTo(v);
    try { localStorage.setItem(TEST_TO_KEY, v.trim()); } catch { /* приватный режим */ }
  }

  async function loadSettings(): Promise<boolean> {
    try {
      const d = await devFetch<DevForm>("/dev/settings");
      // Берём только vk/smtp-поля: настройки сайта живут в отдельной карточке
      // (SiteSettingsCard) со своим сохранением — иначе эта форма их перезатрёт.
      const next: DevForm = {
        vk_group_token: d.vk_group_token, vk_env: d.vk_env, vk_peer_set: d.vk_peer_set, email_to: d.email_to ?? "",
        smtp_host: d.smtp_host, smtp_port: d.smtp_port, smtp_user: d.smtp_user,
        smtp_password: d.smtp_password, smtp_from: d.smtp_from,
      };
      setSaved(next);
      setForm({ ...next, vk_group_token: "", smtp_password: "" });
      setReplacing({ vk: false, smtp: false });
      setAuthed(true); return true;
    } catch { return false; }
  }

  const vkSet = saved.vk_group_token === "***";
  const smtpPwSet = saved.smtp_password === "***";
  const smtpOk = !!(saved.smtp_host && saved.smtp_user && smtpPwSet);
  const dirtyVk = form.vk_group_token.trim() !== "";
  const dirtySmtp = form.smtp_password.trim() !== "" ||
    (["smtp_host", "smtp_port", "smtp_user", "smtp_from"] as const).some((k) => form[k].trim() !== (saved[k] ?? "").trim());

  const note = (sec: Section, n: Note) => setNotes((p) => ({ ...p, [sec]: n }));

  async function saveSection(sec: Section) {
    const body: Record<string, string> = sec === "vk"
      ? { vk_group_token: form.vk_group_token.trim() }
      : {
          smtp_host: form.smtp_host.trim(), smtp_port: form.smtp_port.trim() || "587",
          smtp_user: form.smtp_user.trim(), smtp_from: form.smtp_from.trim(),
          ...(form.smtp_password.trim() ? { smtp_password: form.smtp_password.trim() } : {}),
        };
    setSaving(sec); note(sec, null);
    try {
      await devFetch("/dev/settings", { method: "POST", body: JSON.stringify(body) });
      await loadSettings();
      note(sec, { ok: true, text: "Сохранено. Нажмите «Проверить», чтобы убедиться, что всё работает." });
    } catch (err) {
      note(sec, { ok: false, text: err instanceof Error ? err.message : "Не удалось сохранить" });
    } finally { setSaving(null); }
  }

  async function testSection(sec: Section) {
    const ch = sec === "vk" ? "vk" : "email";
    setTesting(sec); note(sec, null);
    try {
      const to = sec === "smtp" && testTo.trim() ? `&to=${encodeURIComponent(testTo.trim())}` : "";
      const r = await devFetch<TestResp>(`/dev/test-notification?channel=${ch}${to}`, { method: "POST" });
      const st = r.results[ch]; const detail = r.details?.[ch];
      note(sec, st === "sent"
        ? { ok: true, text: sec === "vk" ? "Сообщение отправлено — проверьте ВК владельца." : `Письмо отправлено на ${r.to}.` }
        : { ok: false, text: detail || (st === "failed" ? "Не удалось отправить — проверьте данные." : "Канал не настроен.") });
    } catch (err) {
      note(sec, { ok: false, text: err instanceof Error ? err.message : "Ошибка" });
    } finally { setTesting(null); }
  }

  useEffect(() => {
    devFetch<{ enabled: boolean }>("/dev/status").then(d => setEnabled(d.enabled)).catch(() => setEnabled(false));
    loadSettings();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setLoginErr("");
    try {
      await devFetch("/dev/login", { method: "POST", body: JSON.stringify({ password }) });
      setPassword(""); await loadSettings();
    } catch (err) {
      setLoginErr(err instanceof Error ? err.message : "Ошибка входа");
    }
  }

  async function handleLogout() {
    await devFetch("/dev/logout", { method: "POST" }).catch(() => {});
    setAuthed(false); setForm(EMPTY); setSaved(EMPTY);
  }

  const [diag, setDiag] = useState<string>("");
  async function handleDiagnose() {
    setDiag("Загрузка…");
    try {
      const d = await devFetch<unknown>("/dev/diagnose-import");
      setDiag(JSON.stringify(d, null, 2));
    } catch (err) {
      setDiag(err instanceof Error ? err.message : "Ошибка");
    }
  }

  const [ordersMsg, setOrdersMsg] = useState("");
  async function handleWipeOrders() {
    setOrdersMsg("");
    try {
      const r = await devFetch<{ orders: number }>("/dev/orders", { method: "DELETE" });
      setOrdersMsg(`Удалено заказов: ${r.orders}.`);
    } catch (err) {
      setOrdersMsg(err instanceof Error ? err.message : "Ошибка");
    }
  }

  const [wipeMsg, setWipeMsg] = useState("");
  async function handleWipe() {
    setWipeMsg("");
    try {
      const r = await devFetch<{ products: number; categories: number; files: number }>("/dev/catalog", { method: "DELETE" });
      setWipeMsg(`Удалено товаров: ${r.products}, категорий: ${r.categories}, файлов фото: ${r.files}. Запустите обмен в МойСклад заново.`);
    } catch (err) {
      setWipeMsg(err instanceof Error ? err.message : "Ошибка");
    }
  }

  const set = (k: keyof DevForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div style={{ minHeight: "100vh", background: "var(--cloud)", padding: "48px 20px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-tertiary)", letterSpacing: ".06em", textTransform: "uppercase" }}>Служебное</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Разработчик</h1>
          <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginTop: 4 }}>
            Техническая настройка интеграции. Эта страница защищена отдельным паролем — владельцу магазина сюда не нужно.
          </p>
        </div>
        {authed && (
          <button type="button" onClick={handleLogout}
            style={{ flexShrink: 0, padding: "0 16px", height: 38, borderRadius: "var(--radius-md)", cursor: "pointer",
              border: "1px solid var(--graphite)", background: "transparent", color: "var(--ink)", fontWeight: 600, fontSize: 14 }}>
            Выйти
          </button>
        )}
      </div>

      {enabled === false && !authed ? (
        <div style={card}>
          <p style={{ fontSize: 14, color: "var(--ink-secondary)" }}>
            Страница отключена. Задайте <code>DEV_PASSWORD</code> в <code>.env.prod</code> на сервере и перезапустите.
          </p>
        </div>
      ) : !authed ? (
        <div style={card}>
          <form onSubmit={handleLogin}>
            <div style={field}>
              <label className="form-label">Пароль разработчика</label>
              <input className="form-input" type="password" value={password}
                onChange={e => setPassword(e.target.value)} placeholder="DEV_PASSWORD" autoFocus />
            </div>
            {loginErr && <p className="form-error">{loginErr}</p>}
            <button className="btn btn-primary" type="submit" style={{ marginTop: 4 }}>Войти</button>
          </form>
        </div>
      ) : (
        <>
        {/* Вкладки */}
        <div style={{ maxWidth: 520, margin: "0 auto 16px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                style={{ padding: "8px 14px", borderRadius: "var(--radius-md)", cursor: "pointer", fontSize: 14,
                  fontWeight: active ? 700 : 500, transition: "background .15s, color .15s",
                  border: `1px solid ${active ? "var(--ink)" : "var(--hairline-soft)"}`,
                  background: active ? "var(--ink)" : "var(--canvas)",
                  color: active ? "#fff" : (t.id === "danger" ? "var(--danger, #c0392b)" : "var(--ink)") }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Интеграция: ВК и почта — отдельные карточки со своим сохранением и проверкой */}
        {tab === "integration" && (
        <>
          <SectionCard
            title="ВКонтакте — уведомления о заказах"
            hint={<>Ключ доступа сообщества (Управление → Работа с API) с правом <b>«сообщения сообщества»</b>.
              Свой id в ВК владелец указывает сам в Настройках.</>}
            badge={form.vk_env ? <StatusBadge ok text="Задан на сервере" />
              : vkSet && saved.vk_peer_set ? <StatusBadge ok text="Подключено" />
              : vkSet ? <StatusBadge ok={false} text="Нет id владельца" />
              : <StatusBadge ok={false} text="Не настроено" />}
            onSave={() => saveSection("vk")} saving={saving === "vk"} dirty={dirtyVk}
            onTest={() => testSection("vk")} testing={testing === "vk"} testLabel="Проверить ВК" note={notes.vk}>
            {form.vk_env && (
              <p style={{ fontSize: 13, color: "var(--stock)", marginBottom: 12 }}>
                ✓ Ключ ВК задан на сервере (.env.prod) и важнее этого поля.
              </p>
            )}
            <SecretField label="Ключ доступа сообщества" isSet={vkSet} replacing={replacing.vk}
              value={form.vk_group_token} placeholder="vk1.a.…"
              onReplace={() => setReplacing((p) => ({ ...p, vk: true }))}
              onCancel={() => { setReplacing((p) => ({ ...p, vk: false })); setForm((p) => ({ ...p, vk_group_token: "" })); }}
              onChange={(v) => setForm((p) => ({ ...p, vk_group_token: v }))} />
          </SectionCard>

          <SectionCard
            title="Почта (SMTP)"
            hint={<>Ящик, с которого сайт отправляет письма: уведомления о заказах, письма покупателям и ночной бэкап.
</>}
            badge={smtpOk ? <StatusBadge ok text="Подключено" /> : <StatusBadge ok={false} text="Не настроено" />}
            onSave={() => saveSection("smtp")} saving={saving === "smtp"} dirty={dirtySmtp}
            onTest={() => testSection("smtp")} testing={testing === "smtp"} testLabel="Отправить тестовое письмо"
            note={notes.smtp}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px", gap: 12 }}>
              <div style={field}>
                <label className="form-label">Сервер</label>
                <input className="form-input" value={form.smtp_host} onChange={set("smtp_host")}
                  placeholder="smtp.yandex.ru" autoComplete="off" spellCheck={false} />
              </div>
              <div style={field}>
                <label className="form-label">Порт</label>
                <input className="form-input" value={form.smtp_port} onChange={set("smtp_port")}
                  placeholder="587" inputMode="numeric" autoComplete="off" />
              </div>
            </div>
            <div style={field}>
              <label className="form-label">Логин (адрес ящика)</label>
              <input className="form-input" value={form.smtp_user} onChange={set("smtp_user")}
                placeholder="shop@yandex.ru" autoComplete="off" spellCheck={false} />
            </div>
            <SecretField label="Пароль (для Яндекса/Mail — пароль приложения)" isSet={smtpPwSet} replacing={replacing.smtp}
              value={form.smtp_password} placeholder="новый пароль"
              onReplace={() => setReplacing((p) => ({ ...p, smtp: true }))}
              onCancel={() => { setReplacing((p) => ({ ...p, smtp: false })); setForm((p) => ({ ...p, smtp_password: "" })); }}
              onChange={(v) => setForm((p) => ({ ...p, smtp_password: v }))} />
            <div style={field}>
              <label className="form-label">Адрес «От кого» <span style={{ color: "var(--ink-tertiary)", fontWeight: 400 }}>— необязательно</span></label>
              <input className="form-input" type="email" value={form.smtp_from} onChange={set("smtp_from")}
                placeholder="пусто = логин" autoComplete="off" />
            </div>
            <div style={{ ...field, paddingTop: 14, borderTop: "1px dashed var(--hairline-soft)" }}>
              <label className="form-label">Куда отправить пробное письмо</label>
              <input className="form-input" type="email" value={testTo} onChange={(e) => changeTestTo(e.target.value)}
                placeholder={saved.email_to ? `пусто = владельцу (${saved.email_to})` : "ваш email"}
                autoComplete="email" spellCheck={false} />
              <span style={{ fontSize: 12, color: "var(--ink-tertiary)" }}>
                Только для кнопки проверки, не сохраняется на сайте. Запоминается в этом браузере.
              </span>
            </div>
          </SectionCard>
        </>
        )}

        {/* Настройки сайта */}
        {tab === "site" && <SiteSettingsCard />}

        {/* Диагностика обмена */}
        {tab === "diag" && (
        <div style={card}>
          <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Диагностика обмена</p>
          <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 12 }}>
            Показывает, что прислал склад в последнем обмене (есть ли описание/артикул/картинки и в каких тегах).
            Сначала запустите обмен в МойСклад, потом нажмите.
          </p>
          <button type="button" onClick={handleDiagnose}
            style={{ padding: "0 16px", height: 38, borderRadius: "var(--radius-md)", cursor: "pointer",
              border: "1px solid var(--graphite)", background: "transparent", color: "var(--ink)", fontWeight: 600, fontSize: 14 }}>
            Показать диагностику
          </button>
          {diag && (
            <pre style={{ marginTop: 12, padding: 14, background: "var(--cloud)", borderRadius: "var(--radius-md)",
              border: "1px solid var(--hairline-soft)", fontSize: 12, lineHeight: 1.5, overflow: "auto", maxHeight: 360,
              whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{diag}</pre>
          )}
        </div>
        )}

        {/* Опасная зона — необратимые действия с подтверждением вводом фразы */}
        {tab === "danger" && (
        <div style={card}>
          <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: "var(--danger, #c0392b)" }}>Опасная зона</p>
          <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 22 }}>
            Необратимые действия. Кнопка активируется только после того, как вы вручную введёте фразу-подтверждение.
          </p>
          <DangerAction
            title="Очистить каталог"
            desc="Удаляет все товары и категории (заказы сохраняются). Нужно при подключении другого склада — старые товары исчезнут, затем запустите обмен заново."
            phrase="ОЧИСТИТЬ КАТАЛОГ" button="Очистить каталог" onRun={handleWipe} result={wipeMsg} />
          <DangerAction
            title="Удалить все заказы"
            desc="Полностью удаляет все заказы и их позиции. Для очистки тестовых данных."
            phrase="УДАЛИТЬ ЗАКАЗЫ" button="Удалить все заказы" onRun={handleWipeOrders} result={ordersMsg} />
        </div>
        )}
        </>
      )}
    </div>
  );
}
