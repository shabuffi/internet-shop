"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import HelpHint from "@/components/HelpHint";
import { adminFetch } from "@/lib/adminApi";

interface NotifySettings {
  vk_peer_id: string; notify_email: string;
  vk_ready?: boolean; email_ready?: boolean;
}

const CH_LABEL: Record<string, string> = { vk: "ВКонтакте", email: "Email" };
// Сообщество ВК магазина — фиксированная ссылка для инструкции (куда заходить отвечать клиентам).
const VK_COMMUNITY_URL = "https://vk.com/club239539981";

const cardStyle: React.CSSProperties = {
  background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)",
  padding: "28px 32px", maxWidth: 680, marginBottom: 24,
};
const inputStyle = { display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 16 };

// Уведомления владельцу о новых заказах: ВКонтакте и Email. Технические ключи (токен
// сообщества ВК / SMTP) задаёт разработчик на /admin/dev — здесь только адрес получателя.
export default function NotificationsPage() {
  const [form, setForm] = useState<NotifySettings>({ vk_peer_id: "", notify_email: "" });
  const [vkReady, setVkReady] = useState(false);
  const [emailReady, setEmailReady] = useState(false);
  const [error, setError] = useState("");
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; text: string } | undefined>>({});

  useEffect(() => {
    adminFetch<NotifySettings>("/settings")
      .then(d => { setForm({ vk_peer_id: d.vk_peer_id || "", notify_email: d.notify_email || "" });
        setVkReady(!!d.vk_ready); setEmailReady(!!d.email_ready); })
      .catch(() => {});
  }, []);

  async function saveSection(e: React.FormEvent, id: string, keys: (keyof NotifySettings)[]) {
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

  const set = (k: keyof NotifySettings) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Уведомления</h1>
        <HelpHint text={"Куда присылать оповещения о новых заказах: в личные сообщения ВКонтакте и/или на email.\n\nКаждый блок сохраняется отдельной кнопкой; кнопкой «Отправить тест» можно проверить доставку."} />
      </div>

      {error && <p className="form-error" style={{ maxWidth: 520, marginBottom: 16 }}>{error}</p>}

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

      <p style={{ fontSize: 12, color: "var(--ink-tertiary)", maxWidth: 520 }}>
        Для разработчика: ключ сообщества ВК и SMTP-сервер — на странице{" "}
        <a href="/admin/dev" style={{ color: "var(--ink-secondary)", textDecoration: "underline" }}>/admin/dev</a>.
      </p>
    </AdminShell>
  );
}
