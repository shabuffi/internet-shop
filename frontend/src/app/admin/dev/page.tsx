"use client";

import { useEffect, useState } from "react";
import { devFetch } from "@/lib/adminApi";
import SiteSettingsCard from "@/components/SiteSettingsCard";

// Техническая форма (обмен / ВК / SMTP). Поля приходят с /dev/settings.
interface DevForm {
  vk_group_token: string; vk_env: boolean;
  smtp_host: string; smtp_port: string; smtp_user: string; smtp_password: string; smtp_from: string;
}

const EMPTY: DevForm = {
  vk_group_token: "", vk_env: false,
  smtp_host: "", smtp_port: "587", smtp_user: "", smtp_password: "", smtp_from: "",
};

const card: React.CSSProperties = {
  background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)",
  padding: "28px 32px", maxWidth: 520, margin: "0 auto",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 };

type Tab = "integration" | "site" | "diag" | "danger";
const TABS: { id: Tab; label: string }[] = [
  { id: "integration", label: "Интеграция" },
  { id: "site", label: "Настройки сайта" },
  { id: "diag", label: "Диагностика" },
  { id: "danger", label: "Опасная зона" },
];

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
  const [form, setForm] = useState<DevForm>(EMPTY);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadSettings(): Promise<boolean> {
    try {
      const d = await devFetch<DevForm>("/dev/settings");
      // Берём только vk/smtp-поля: настройки сайта живут в отдельной карточке
      // (SiteSettingsCard) со своим сохранением — иначе эта форма их перезатрёт.
      setForm({
        vk_group_token: d.vk_group_token, vk_env: d.vk_env,
        smtp_host: d.smtp_host, smtp_port: d.smtp_port, smtp_user: d.smtp_user,
        smtp_password: d.smtp_password, smtp_from: d.smtp_from,
      });
      setAuthed(true); return true;
    } catch { return false; }
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaved(false); setLoading(true);
    try {
      await devFetch("/dev/settings", { method: "POST", body: JSON.stringify(form) });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  async function handleLogout() {
    await devFetch("/dev/logout", { method: "POST" }).catch(() => {});
    setAuthed(false); setForm(EMPTY);
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

        {/* Интеграция: ключ ВК + SMTP */}
        {tab === "integration" && (
        <div style={card}>
          <form onSubmit={handleSave}>
            <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>ВКонтакте — ключ сообщества</p>
            <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 16 }}>
              Ключ доступа сообщества (бот). Свой id (peer_id) владелец вводит сам в Настройках.
            </p>
            {form.vk_env && (
              <p style={{ fontSize: 13, color: "var(--stock)", marginBottom: 12 }}>
                ✓ ВК задан на сервере (.env.prod) — это поле игнорируется, можно не заполнять.
              </p>
            )}
            <div style={field}>
              <label className="form-label">Ключ доступа сообщества</label>
              <input className="form-input" type="password" value={form.vk_group_token} onChange={set("vk_group_token")}
                placeholder="vk1.a.… или оставьте ***" autoComplete="off" />
            </div>

            <div style={{ height: 1, background: "var(--hairline-soft)", margin: "20px 0" }} />

            <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Почтовый сервер (SMTP)</p>
            <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 16 }}>
              Через какой ящик отправлять письма. Адрес получателя (email владельца) задаётся в Настройках.
            </p>
            <div style={field}>
              <label className="form-label">SMTP-сервер (host)</label>
              <input className="form-input" value={form.smtp_host} onChange={set("smtp_host")}
                placeholder="smtp.yandex.ru" autoComplete="off" />
            </div>
            <div style={field}>
              <label className="form-label">Порт</label>
              <input className="form-input" value={form.smtp_port} onChange={set("smtp_port")}
                placeholder="587" autoComplete="off" />
            </div>
            <div style={field}>
              <label className="form-label">Логин (email отправителя)</label>
              <input className="form-input" value={form.smtp_user} onChange={set("smtp_user")}
                placeholder="shop@yandex.ru" autoComplete="off" />
            </div>
            <div style={field}>
              <label className="form-label">Пароль SMTP (пароль приложения)</label>
              <input className="form-input" type="password" value={form.smtp_password} onChange={set("smtp_password")}
                placeholder="пароль приложения или оставьте ***" autoComplete="off" />
            </div>
            <div style={field}>
              <label className="form-label">Адрес «От кого» (необязательно)</label>
              <input className="form-input" type="email" value={form.smtp_from} onChange={set("smtp_from")}
                placeholder="оставьте пустым (= логин)" autoComplete="off" />
            </div>

            {saved && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 12,
                background: "var(--stock-soft)", border: "1px solid var(--stock)", borderRadius: "var(--radius-md)",
                color: "var(--stock)", fontSize: 14, fontWeight: 600 }}>
                <span>✓</span> Сохранено
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? "Сохраняем…" : "Сохранить"}
            </button>
            <p style={{ fontSize: 12, color: "var(--ink-secondary)", marginTop: 14 }}>
              Проверить отправку (ВК / Email) можно у владельца в Настройках — кнопками «Отправить тест».
            </p>
          </form>
        </div>
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
