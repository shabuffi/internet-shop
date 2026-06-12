"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { adminFetch } from "@/lib/adminApi";

// Раскрывающийся блок «Как настроить» — пошаговая инструкция рядом с полями (свёрнут по умолчанию).
function HelpBox({ title, steps, note }: { title: string; steps: React.ReactNode[]; note?: React.ReactNode }) {
  return (
    <details style={{ marginBottom: 18, border: "1px solid var(--hairline-soft)", borderRadius: 10, background: "var(--surface)" }}>
      <summary style={{ cursor: "pointer", padding: "11px 14px", fontSize: 13, fontWeight: 600, color: "var(--primary)" }}>
        {title}
      </summary>
      <ol style={{ margin: 0, padding: "0 16px 6px 30px", fontSize: 13, color: "var(--ink-secondary)", lineHeight: 1.65 }}>
        {steps.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}
      </ol>
      {note && <p style={{ padding: "0 16px 14px", margin: 0, fontSize: 12, color: "var(--ink-tertiary)" }}>{note}</p>}
    </details>
  );
}

export default function SettingsPage() {
  const [form, setForm] = useState({ exchange_login: "", exchange_password: "", shop_name: "", contact_phone: "", contact_email: "", contact_hours: "", vk_group_token: "", vk_peer_id: "", notify_email: "", smtp_host: "", smtp_port: "587", smtp_user: "", smtp_password: "", smtp_from: "" });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; text: string } | undefined>>({});
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    adminFetch<typeof form>("/settings").then(data => setForm(data)).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSaved(false); setLoading(true);
    try {
      await adminFetch("/settings", { method: "POST", body: JSON.stringify(form) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally { setLoading(false); }
  }

  const CH_LABEL: Record<string, string> = { vk: "ВКонтакте", email: "Email" };

  // Сохраняет настройки и шлёт пробное уведомление в ОДИН выбранный канал
  async function handleTest(channel: string) {
    setError(""); setTestResults(prev => ({ ...prev, [channel]: undefined })); setTestingChannel(channel);
    try {
      await adminFetch("/settings", { method: "POST", body: JSON.stringify(form) });
      const r = await adminFetch<{ results: Record<string, string> }>(`/test-notification?channel=${channel}`, { method: "POST" });
      const st = r.results[channel];
      const where = channel === "email" ? "почту" : "сообщения сообщества";
      const res = st === "sent" ? { ok: true, text: `${CH_LABEL[channel]}: отправлено — проверьте ${where}` }
        : st === "failed" ? { ok: false, text: `${CH_LABEL[channel]}: не удалось (проверьте данные/доступ)` }
        : { ok: false, text: `${CH_LABEL[channel]} не настроен — заполните поля выше` };
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

  const inputStyle = { display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 16 };

  // Кнопка «Отправить тест» + результат для одного канала
  function renderTest(channel: string, label: string) {
    const r = testResults[channel];
    return (
      <div style={{ marginBottom: 18 }}>
        <button type="button" onClick={() => handleTest(channel)} disabled={testingChannel !== null}
          style={{ padding: "0 16px", height: 38, borderRadius: "var(--radius-md)", border: "1px solid var(--graphite)",
            background: "transparent", color: "var(--ink)", fontWeight: 600, fontSize: 14,
            cursor: testingChannel ? "wait" : "pointer", opacity: testingChannel && testingChannel !== channel ? 0.5 : 1 }}>
          {testingChannel === channel ? "Отправляем…" : label}
        </button>
        {r && (
          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: r.ok ? "var(--stock)" : "var(--danger, #c0392b)" }}>
            {r.ok ? "✓ " : "✕ "}{r.text}
          </div>
        )}
      </div>
    );
  }

  return (
    <AdminShell>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: -0.3 }}>Настройки</h1>
      <p style={{ fontSize: 14, color: "var(--ink-secondary)", marginBottom: 32 }}>
        Интеграция с МойСклад работает через обмен CommerceML — пароль от аккаунта МойСклад
        не требуется. Хранится в базе данных, не в .env файле.
      </p>

      <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", padding: "28px 32px", maxWidth: 520 }}>
        <form onSubmit={handleSubmit}>
          <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Данные для обмена (CommerceML)</p>
          <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 20 }}>
            Придумайте любую пару логин/пароль и впишите её сюда <b>и</b> в МойСклад
            (Онлайн-торговля → Адрес магазина). Сайт будет пускать обмен, только если они совпадают.
            Пока поля пустые — обмен открыт для всех.
          </p>

          <div style={inputStyle}>
            <label className="form-label">Логин обмена</label>
            <input className="form-input" value={form.exchange_login}
              onChange={e => setForm(p => ({...p, exchange_login: e.target.value}))}
              placeholder="например, shabshop_exchange" autoComplete="off" />
          </div>

          <div style={inputStyle}>
            <label className="form-label">Пароль обмена</label>
            <input className="form-input" value={form.exchange_password}
              onChange={e => setForm(p => ({...p, exchange_password: e.target.value}))}
              placeholder="Введите новый пароль или оставьте ***"
              type="password" autoComplete="off" />
          </div>

          <div style={{ height: 1, background: "var(--hairline-soft)", margin: "20px 0" }} />

          <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Уведомления о заказах</p>
          <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 20 }}>
            Куда слать оповещение о новом заказе вам, владельцу. Доступны два канала —
            <b> ВКонтакте</b> и <b>Email</b>. Заполните любой (или оба) — пустые игнорируются.
            Не знаете, где взять ключ? Откройте «Как настроить» под каналом.
          </p>

          <HelpBox
            title="Как настроить ВКонтакте →"
            steps={[
              <>ВК → «Сообщества» → «Создать сообщество» (если ещё нет).</>,
              <>В сообществе: «Управление» → «Сообщения» → включить сообщения сообщества.</>,
              <>«Управление» → «Настройки» → «Работа с API» → «Ключи доступа» → «Создать ключ» с правами <b>«Сообщения сообщества»</b> → скопируйте ключ <code>vk1.a…</code> в поле ниже.</>,
              <>Напишите <b>своему сообществу</b> любое сообщение от личного аккаунта (иначе ВК не даст боту писать вам первым).</>,
              <>Узнайте свой числовой id ВК (если адрес <code>vk.com/id123</code> — это оно; иначе через сервис «узнать id ВКонтакте») → впишите в «ВК — peer_id».</>,
            ]}
          />

          <div style={inputStyle}>
            <label className="form-label">ВК — ключ доступа сообщества</label>
            <input className="form-input" value={form.vk_group_token}
              onChange={e => setForm(p => ({...p, vk_group_token: e.target.value}))}
              placeholder="vk1.a.… или оставьте ***" type="password" autoComplete="off" />
          </div>

          <div style={inputStyle}>
            <label className="form-label">ВК — peer_id получателя</label>
            <input className="form-input" value={form.vk_peer_id}
              onChange={e => setForm(p => ({...p, vk_peer_id: e.target.value}))}
              placeholder="ваш id ВКонтакте" autoComplete="off" />
          </div>

          {renderTest("vk", "Отправить тест в ВК")}

          <div style={inputStyle}>
            <label className="form-label">Email владельца (необязательно)</label>
            <input className="form-input" value={form.notify_email}
              onChange={e => setForm(p => ({...p, notify_email: e.target.value}))}
              placeholder="по умолчанию = SMTP-логин ниже" type="email" autoComplete="off" />
            <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>
              Куда присылать письма о заказах. Если оставить пустым — придут на адрес из SMTP-логина.
            </p>
          </div>

          <div style={{ height: 1, background: "var(--hairline-soft)", margin: "20px 0" }} />

          <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Почтовый сервер (SMTP)</p>
          <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 20 }}>
            Нужен, чтобы письма о заказах приходили вам на «Email владельца» (выше). Данные
            SMTP вашей почты (например, Яндекс/Mail/Gmail). Без них email-канал не работает
            (ВК работает и без SMTP).
          </p>

          <HelpBox
            title="Как получить данные SMTP (на примере Яндекса) →"
            steps={[
              <>Заведите/откройте почту магазина на <b>yandex.ru</b>.</>,
              <>Создайте <b>пароль приложения</b> (обычный пароль не подойдёт): Яндекс ID → «Безопасность» → «Пароли приложений» → «Создать» → «Почта» → получите 16-значный пароль.</>,
              <>Заполните: сервер <code>smtp.yandex.ru</code>, порт <code>587</code>, логин — ваш адрес, пароль — пароль приложения.</>,
              <>В поле «Email владельца» (выше) впишите, куда получать заказы — можно тот же адрес.</>,
            ]}
            note={<>Mail.ru: <code>smtp.mail.ru:587</code>. Gmail: <code>smtp.gmail.com:587</code> (нужен App Password при включённой 2FA).</>}
          />

          <div style={inputStyle}>
            <label className="form-label">SMTP-сервер (host)</label>
            <input className="form-input" value={form.smtp_host}
              onChange={e => setForm(p => ({...p, smtp_host: e.target.value}))}
              placeholder="smtp.yandex.ru" autoComplete="off" />
          </div>

          <div style={inputStyle}>
            <label className="form-label">Порт</label>
            <input className="form-input" value={form.smtp_port}
              onChange={e => setForm(p => ({...p, smtp_port: e.target.value}))}
              placeholder="587" autoComplete="off" />
          </div>

          <div style={inputStyle}>
            <label className="form-label">Логин (email отправителя)</label>
            <input className="form-input" value={form.smtp_user}
              onChange={e => setForm(p => ({...p, smtp_user: e.target.value}))}
              placeholder="shop@yandex.ru" autoComplete="off" />
          </div>

          <div style={inputStyle}>
            <label className="form-label">Пароль SMTP</label>
            <input className="form-input" value={form.smtp_password}
              onChange={e => setForm(p => ({...p, smtp_password: e.target.value}))}
              placeholder="пароль приложения или оставьте ***" type="password" autoComplete="off" />
          </div>

          <div style={inputStyle}>
            <label className="form-label">Адрес «От кого» (необязательно)</label>
            <input className="form-input" value={form.smtp_from}
              onChange={e => setForm(p => ({...p, smtp_from: e.target.value}))}
              placeholder="по умолчанию = логин" autoComplete="off" />
          </div>

          {renderTest("email", "Отправить тест на Email")}

          <div style={{ height: 1, background: "var(--hairline-soft)", margin: "20px 0" }} />

          <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>Магазин</p>

          <div style={inputStyle}>
            <label className="form-label">Название магазина</label>
            <input className="form-input" value={form.shop_name}
              onChange={e => setForm(p => ({...p, shop_name: e.target.value}))}
              placeholder="Магазин" />
            <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>
              Отображается в шапке, футере и на вкладке браузера
            </p>
          </div>

          <div style={inputStyle}>
            <label className="form-label">Телефон (футер сайта)</label>
            <input className="form-input" value={form.contact_phone}
              onChange={e => setForm(p => ({...p, contact_phone: e.target.value}))}
              placeholder="+7 999 123-45-67" />
          </div>

          <div style={inputStyle}>
            <label className="form-label">Email для покупателей (футер сайта)</label>
            <input className="form-input" type="email" value={form.contact_email}
              onChange={e => setForm(p => ({...p, contact_email: e.target.value}))}
              placeholder="shop@example.ru" />
          </div>

          <div style={inputStyle}>
            <label className="form-label">Часы работы (футер сайта)</label>
            <input className="form-input" value={form.contact_hours}
              onChange={e => setForm(p => ({...p, contact_hours: e.target.value}))}
              placeholder="Пн–Пт · 10:00–19:00" />
            <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>
              Пустые поля контактов в футере не показываются
            </p>
          </div>

          {error && <p className="form-error">{error}</p>}
          {saved && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 12,
              background: "var(--stock-soft)", border: "1px solid var(--stock)", borderRadius: "var(--radius-md)",
              color: "var(--stock)", fontSize: 14, fontWeight: 600 }}>
              <span>✓</span> Настройки сохранены
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? "Сохраняем..." : "Сохранить настройки"}
          </button>
        </form>
      </div>

      {/* Смена пароля админа */}
      <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)", padding: "28px 32px", maxWidth: 520, marginTop: 24 }}>
        <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>Смена пароля админа</p>
        <form onSubmit={handleChangePassword}>
          <div style={inputStyle}>
            <label className="form-label">Текущий пароль</label>
            <input className="form-input" type="password" value={pw.current_password}
              onChange={e => setPw(p => ({...p, current_password: e.target.value}))}
              autoComplete="current-password" required />
          </div>
          <div style={inputStyle}>
            <label className="form-label">Новый пароль</label>
            <input className="form-input" type="password" value={pw.new_password}
              onChange={e => setPw(p => ({...p, new_password: e.target.value}))}
              autoComplete="new-password" required minLength={8} />
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
      </div>
    </AdminShell>
  );
}
