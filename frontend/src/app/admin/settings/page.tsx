"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { adminFetch } from "@/lib/adminApi";

interface OwnerSettings {
  shop_name: string; contact_phone: string; contact_email: string; contact_hours: string;
  company_legal_name: string; company_inn: string; company_ogrn: string; warehouse_address: string;
  delivery_info: string;
  exchange_login: string; exchange_password: string;
  vk_peer_id: string; notify_email: string;
  vk_ready?: boolean; email_ready?: boolean; has_logo?: boolean;
  exchange_last_seen?: string | null;
}

const EMPTY: OwnerSettings = {
  shop_name: "", contact_phone: "", contact_email: "", contact_hours: "",
  company_legal_name: "", company_inn: "", company_ogrn: "", warehouse_address: "",
  delivery_info: "",
  exchange_login: "", exchange_password: "", vk_peer_id: "", notify_email: "",
};
const CH_LABEL: Record<string, string> = { vk: "ВКонтакте", email: "Email" };
// Сообщество ВК магазина — фиксированная ссылка для инструкции (куда заходить отвечать клиентам).
const VK_COMMUNITY_URL = "https://vk.com/club239539981";

const cardStyle: React.CSSProperties = {
  background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)",
  padding: "28px 32px", maxWidth: 680, marginBottom: 24,
};

// Статус обмена по метке «последний контакт МойСклад» (порог простоя — 24ч, как в бэкенде).
function exchangeStatus(iso?: string | null): { text: string; color: string } {
  if (!iso) return { text: "обмена ещё не было", color: "var(--ink-tertiary)" };
  const ageH = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (ageH < 24) {
    const ago = ageH < 1 ? "менее часа назад" : `${Math.round(ageH)} ч назад`;
    return { text: `на связи · ${ago}`, color: "var(--stock, #16794a)" };
  }
  return { text: `обмена не было ${Math.round(ageH)} ч`, color: "var(--accent-2, #E02424)" };
}
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

  useEffect(() => {
    adminFetch<OwnerSettings>("/settings")
      .then(d => { setForm(d); setVkReady(!!d.vk_ready); setEmailReady(!!d.email_ready); })
      .catch(() => {});
  }, []);

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
      <form style={cardStyle} onSubmit={e => saveSection(e, "shop", ["shop_name", "contact_phone", "contact_email", "contact_hours", "company_legal_name", "company_inn", "company_ogrn", "warehouse_address", "delivery_info"])}>
        <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Магазин</p>
        <div style={inputStyle}>
          <label className="form-label">Название магазина</label>
          <input className="form-input" value={form.shop_name} onChange={set("shop_name")} placeholder="Магазин" />
          <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>В футере и на вкладке браузера; в шапке — если не задан логотип</p>
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
          <label className="form-label">Юр. наименование</label>
          <input className="form-input" value={form.company_legal_name} onChange={set("company_legal_name")} placeholder="ООО «Инженер» / ИП Иванов И. И." />
          <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>Страницы «О компании» / «Контакты» и подвал.</p>
        </div>
        <div style={inputStyle}>
          <label className="form-label">ИНН</label>
          <input className="form-input" value={form.company_inn} onChange={set("company_inn")} placeholder="7700000000" />
        </div>
        <div style={inputStyle}>
          <label className="form-label">ОГРН / ОГРНИП</label>
          <input className="form-input" value={form.company_ogrn} onChange={set("company_ogrn")} placeholder="необязательно" />
        </div>
        <div style={inputStyle}>
          <label className="form-label">Адрес склада</label>
          <input className="form-input" value={form.warehouse_address} onChange={set("warehouse_address")} placeholder="г. Тверь, ул. …, д. …" />
          <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>Покажется на «Контактах» с картой.</p>
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
          <p style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>Обмен с МойСклад</p>
          {(() => { const s = exchangeStatus(form.exchange_last_seen); return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: s.color }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: "currentColor", flexShrink: 0 }} />
              {s.text}
            </span>
          ); })()}
        </div>
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
              <li>
                Откройте <a href={VK_COMMUNITY_URL} target="_blank" rel="noopener noreferrer"
                  style={{ color: "var(--accent, #2563eb)", fontWeight: 600 }}>сообщество магазина в ВК</a>{" "}
                и <b>напишите ему любое сообщение</b> от своего личного аккаунта (например, «привет»).
              </li>
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
