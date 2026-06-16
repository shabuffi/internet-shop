"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { adminFetch, adminUpload } from "@/lib/adminApi";

interface OwnerSettings {
  shop_name: string; contact_phone: string; contact_email: string; contact_hours: string;
  delivery_info: string;
  exchange_login: string; exchange_password: string;
  vk_peer_id: string; notify_email: string;
  vk_ready?: boolean; email_ready?: boolean; has_logo?: boolean;
}

const EMPTY: OwnerSettings = {
  shop_name: "", contact_phone: "", contact_email: "", contact_hours: "", delivery_info: "",
  exchange_login: "", exchange_password: "", vk_peer_id: "", notify_email: "",
};
const CH_LABEL: Record<string, string> = { vk: "ВКонтакте", email: "Email" };

const cardStyle: React.CSSProperties = {
  background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)",
  padding: "28px 32px", maxWidth: 520, marginBottom: 24,
};
const inputStyle = { display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 16 };

export default function SettingsPage() {
  const [form, setForm] = useState<OwnerSettings>(EMPTY);
  const [vkReady, setVkReady] = useState(false);
  const [emailReady, setEmailReady] = useState(false);
  const [error, setError] = useState("");
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; text: string } | undefined>>({});
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);
  const [hasLogo, setHasLogo] = useState(false);
  const [logoVer, setLogoVer] = useState(0);   // сброс кэша превью логотипа
  const [logoBusy, setLogoBusy] = useState(false);

  useEffect(() => {
    adminFetch<OwnerSettings>("/settings")
      .then(d => { setForm(d); setVkReady(!!d.vk_ready); setEmailReady(!!d.email_ready); setHasLogo(!!d.has_logo); })
      .catch(() => {});
  }, []);

  async function handleLogoUpload(file: File | undefined) {
    if (!file) return;
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await adminUpload("/logo", fd);
      setHasLogo(true); setLogoVer(v => v + 1);
    } catch { /* ignore */ } finally { setLogoBusy(false); }
  }
  async function handleLogoRemove() {
    setLogoBusy(true);
    try {
      await adminFetch("/logo", { method: "DELETE" });
      setHasLogo(false); setLogoVer(v => v + 1);
    } catch { /* ignore */ } finally { setLogoBusy(false); }
  }

  // Сохраняет только поля одного блока
  async function saveSection(e: React.FormEvent, id: string, keys: (keyof OwnerSettings)[]) {
    e.preventDefault();
    setError(""); setSavedSection(null); setSavingSection(id);
    const body: Record<string, string> = {};
    for (const k of keys) body[k] = String(form[k] ?? "");
    try {
      await adminFetch("/settings", { method: "POST", body: JSON.stringify(body) });
      setSavedSection(id);
      setTimeout(() => setSavedSection(s => (s === id ? null : s)), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally { setSavingSection(null); }
  }

  // Сохраняет поле канала и шлёт пробное уведомление
  async function handleTest(channel: "vk" | "email") {
    setTestResults(prev => ({ ...prev, [channel]: undefined })); setTestingChannel(channel);
    try {
      const key = channel === "vk" ? "vk_peer_id" : "notify_email";
      await adminFetch("/settings", { method: "POST", body: JSON.stringify({ [key]: form[key] }) });
      const r = await adminFetch<{ results: Record<string, string>; details?: Record<string, string> }>(`/test-notification?channel=${channel}`, { method: "POST" });
      const st = r.results[channel];
      const detail = r.details?.[channel];
      const where = channel === "email" ? "почту" : "сообщения сообщества";
      const res = st === "sent" ? { ok: true, text: `Отправлено — проверьте ${where}` }
        : st === "failed" ? { ok: false, text: `Не удалось${detail ? ` — ${detail}` : " (проверьте данные)"}` }
        : { ok: false, text: "Канал не настроен" };
      setTestResults(prev => ({ ...prev, [channel]: res }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [channel]: { ok: false, text: err instanceof Error ? err.message : "Ошибка" } }));
    } finally { setTestingChannel(null); }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null); setPwLoading(true);
    try {
      await adminFetch("/change-password", { method: "POST", body: JSON.stringify(pw) });
      setPwMsg({ ok: true, text: "Пароль изменён" });
      setPw({ current_password: "", new_password: "" });
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : "Ошибка" });
    } finally { setPwLoading(false); }
  }

  const set = (k: keyof OwnerSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  function saveRow(id: string) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button className="btn btn-primary" type="submit" disabled={savingSection === id}>
          {savingSection === id ? "Сохраняем…" : "Сохранить"}
        </button>
        {savedSection === id && <span style={{ color: "var(--stock)", fontWeight: 600, fontSize: 13 }}>✓ Сохранено</span>}
      </div>
    );
  }

  function testButton(channel: "vk" | "email") {
    const r = testResults[channel];
    return (
      <div style={{ marginTop: 14 }}>
        <button type="button" onClick={() => handleTest(channel)} disabled={testingChannel !== null}
          style={{ padding: "0 14px", height: 36, borderRadius: "var(--radius-md)", border: "1px solid var(--graphite)",
            background: "transparent", color: "var(--ink)", fontWeight: 600, fontSize: 13,
            cursor: testingChannel ? "wait" : "pointer", opacity: testingChannel && testingChannel !== channel ? 0.5 : 1 }}>
          {testingChannel === channel ? "Отправляем…" : `Отправить тест (${CH_LABEL[channel]})`}
        </button>
        {r && (
          <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: r.ok ? "var(--stock)" : "var(--danger, #c0392b)" }}>
            {r.ok ? "✓ " : "✕ "}{r.text}
          </div>
        )}
      </div>
    );
  }

  function readyNote(ready: boolean, what: string) {
    return (
      <p style={{ fontSize: 12, color: ready ? "var(--stock)" : "var(--ink-tertiary)", marginBottom: 4 }}>
        {ready ? `✓ ${what} подключено разработчиком` : `${what} ещё не настроено — обратитесь к разработчику`}
      </p>
    );
  }

  return (
    <AdminShell>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: -0.3 }}>Настройки</h1>
      <p style={{ fontSize: 14, color: "var(--ink-secondary)", marginBottom: 28 }}>
        Каждый блок сохраняется отдельной кнопкой.
      </p>

      {error && <p className="form-error" style={{ maxWidth: 520, marginBottom: 16 }}>{error}</p>}

      {/* Магазин */}
      <form style={cardStyle} onSubmit={e => saveSection(e, "shop", ["shop_name", "contact_phone", "contact_email", "contact_hours", "delivery_info"])}>
        <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Магазин</p>
        <div style={inputStyle}>
          <label className="form-label">Название магазина</label>
          <input className="form-input" value={form.shop_name} onChange={set("shop_name")} placeholder="Магазин" />
          <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>В футере и на вкладке браузера; в шапке — если не задан логотип</p>
        </div>

        {/* Логотип (показывается в шапке вместо названия) */}
        <div style={inputStyle}>
          <label className="form-label">Логотип (в шапке сайта)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            {hasLogo && (
              <span style={{ display: "inline-flex", alignItems: "center", height: 44, padding: "0 12px",
                background: "var(--cloud)", border: "1px solid var(--hairline-soft)", borderRadius: 8 }}>
                <img src={`/api/v1/admin/logo?v=${logoVer}`} alt="логотип" style={{ height: 28, width: "auto", display: "block" }} />
              </span>
            )}
            <label style={{ padding: "0 16px", height: 38, display: "inline-flex", alignItems: "center", borderRadius: "var(--radius-md)",
              border: "1px solid var(--graphite)", color: "var(--ink)", fontWeight: 600, fontSize: 14,
              cursor: logoBusy ? "wait" : "pointer", opacity: logoBusy ? 0.5 : 1 }}>
              {hasLogo ? "Заменить" : "Загрузить логотип"}
              <input type="file" accept="image/*" hidden
                onChange={e => { handleLogoUpload(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {hasLogo && (
              <button type="button" onClick={handleLogoRemove} disabled={logoBusy}
                style={{ padding: "0 14px", height: 38, borderRadius: "var(--radius-md)", border: "1px solid var(--hairline-soft)",
                  background: "transparent", color: "var(--ink-secondary)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                Убрать
              </button>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>PNG/JPG/SVG. Если загружен — показывается в шапке вместо названия.</p>
        </div>
        <div style={inputStyle}>
          <label className="form-label">Телефон (футер сайта)</label>
          <input className="form-input" value={form.contact_phone} onChange={set("contact_phone")} placeholder="+7 999 123-45-67" />
        </div>
        <div style={inputStyle}>
          <label className="form-label">Email для покупателей (футер сайта)</label>
          <input className="form-input" type="email" value={form.contact_email} onChange={set("contact_email")} placeholder="shop@example.ru" />
        </div>
        <div style={inputStyle}>
          <label className="form-label">Часы работы (футер сайта)</label>
          <input className="form-input" value={form.contact_hours} onChange={set("contact_hours")} placeholder="Пн–Пт · 10:00–19:00" />
        </div>
        <div style={inputStyle}>
          <label className="form-label">Доставка (на странице товара)</label>
          <input className="form-input" value={form.delivery_info} onChange={set("delivery_info")} placeholder="например, 1–3 дня по России" />
          <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>Один текст для всех товаров. Пусто — строка не показывается.</p>
        </div>
        {saveRow("shop")}
      </form>

      {/* Обмен с МойСклад */}
      <form style={cardStyle} onSubmit={e => saveSection(e, "exchange", ["exchange_login", "exchange_password"])}>
        <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Обмен с МойСклад</p>
        <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 16 }}>
          Придумайте пару логин/пароль и впишите её сюда <b>и</b> в МойСклад (Адрес магазина).
          Это пароль обмена, а не от аккаунта МойСклад.
        </p>
        <div style={inputStyle}>
          <label className="form-label">Логин обмена</label>
          <input className="form-input" value={form.exchange_login} onChange={set("exchange_login")} placeholder="например, myshop_exchange" autoComplete="off" />
        </div>
        <div style={inputStyle}>
          <label className="form-label">Пароль обмена</label>
          <input className="form-input" type="password" value={form.exchange_password} onChange={set("exchange_password")} placeholder="новый пароль или оставьте ***" autoComplete="off" />
        </div>
        {saveRow("exchange")}
      </form>

      {/* ВКонтакте */}
      <form style={cardStyle} onSubmit={e => saveSection(e, "vk", ["vk_peer_id"])}>
        <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>ВКонтакте</p>
        <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 12 }}>
          Куда вам приходят оповещения о новых заказах в ВК.
        </p>
        <div style={inputStyle}>
          <label className="form-label">Ваш id ВКонтакте (peer_id)</label>
          <input className="form-input" value={form.vk_peer_id} onChange={set("vk_peer_id")} placeholder="например, 123456789" autoComplete="off" />
        </div>
        {readyNote(vkReady, "Сообщество")}

        <details style={{ marginBottom: 14, border: "1px solid var(--hairline-soft)", borderRadius: 10, background: "var(--surface)" }}>
          <summary style={{ cursor: "pointer", padding: "11px 14px", fontSize: 13, fontWeight: 600, color: "var(--accent, #2563eb)" }}>
            Как узнать свой id и сделать, чтобы сообщения точно приходили →
          </summary>
          <div style={{ padding: "0 16px 14px", fontSize: 13, color: "var(--ink-secondary)", lineHeight: 1.65 }}>
            <p style={{ fontWeight: 600, color: "var(--ink)", margin: "6px 0 4px" }}>1. Узнать свой id (peer_id)</p>
            <ol style={{ margin: "0 0 10px", paddingLeft: 18 }}>
              <li>Откройте свою страницу ВКонтакте.</li>
              <li>Если в адресе <code>vk.com/id123456789</code> — это число и есть ваш id.</li>
              <li>Если короткое имя (<code>vk.com/ivanov</code>) — откройте сервис <b>regvk.com/id</b>, вставьте ссылку на свою страницу → получите числовой id. Его и впишите в поле выше.</li>
            </ol>
            <p style={{ fontWeight: 600, color: "var(--ink)", margin: "6px 0 4px" }}>2. Чтобы сообщения доходили (обязательно один раз)</p>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Откройте сообщество магазина в ВК и <b>напишите ему любое сообщение</b> от своего личного аккаунта (например, «привет»).</li>
              <li>Это нужно, потому что ВК запрещает сообществу писать вам первым. После вашего сообщения — бот сможет вам отвечать.</li>
              <li>Теперь нажмите <b>«Отправить тест»</b> ниже — должно прийти сообщение в личку ВК.</li>
            </ol>
            <p style={{ marginTop: 10, fontSize: 12, color: "var(--ink-tertiary)" }}>
              Само сообщество и его ключ доступа настраивает разработчик — если выше стоит «✓ Сообщество подключено», эта часть уже готова.
            </p>
          </div>
        </details>

        {saveRow("vk")}
        {testButton("vk")}
      </form>

      {/* Email */}
      <form style={cardStyle} onSubmit={e => saveSection(e, "email", ["notify_email"])}>
        <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Email</p>
        <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 12 }}>
          Куда слать письма о новых заказах.
        </p>
        <div style={inputStyle}>
          <label className="form-label">Email владельца</label>
          <input className="form-input" type="email" value={form.notify_email} onChange={set("notify_email")} placeholder="вы получите письмо на этот адрес" autoComplete="off" />
        </div>
        {readyNote(emailReady, "Почтовый сервер")}
        {saveRow("email")}
        {testButton("email")}
      </form>

      {/* Смена пароля админа */}
      <form style={cardStyle} onSubmit={handleChangePassword}>
        <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>Смена пароля админа</p>
        <div style={inputStyle}>
          <label className="form-label">Текущий пароль</label>
          <input className="form-input" type="password" value={pw.current_password}
            onChange={e => setPw(p => ({ ...p, current_password: e.target.value }))} autoComplete="current-password" required />
        </div>
        <div style={inputStyle}>
          <label className="form-label">Новый пароль</label>
          <input className="form-input" type="password" value={pw.new_password}
            onChange={e => setPw(p => ({ ...p, new_password: e.target.value }))} autoComplete="new-password" required minLength={8} />
          <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>Минимум 8 символов</p>
        </div>
        {pwMsg && (
          <p style={{ fontSize: 14, marginBottom: 8, color: pwMsg.ok ? "var(--success)" : "var(--critical)" }}>
            {pwMsg.ok ? "✓ " : "✕ "}{pwMsg.text}
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={pwLoading} style={{ marginTop: 8 }}>
          {pwLoading ? "Меняем..." : "Сменить пароль"}
        </button>
      </form>

      <p style={{ fontSize: 12, color: "var(--ink-tertiary)", maxWidth: 520 }}>
        Для разработчика: ключ сообщества ВК и SMTP-сервер — на странице{" "}
        <a href="/admin/dev" style={{ color: "var(--ink-secondary)", textDecoration: "underline" }}>/admin/dev</a>.
      </p>
    </AdminShell>
  );
}
