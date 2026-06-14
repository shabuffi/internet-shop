"use client";

import { useEffect, useState } from "react";
import { devFetch } from "@/lib/adminApi";

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

export default function DevPage() {
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
      setForm(d); setAuthed(true); return true;
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
    if (!confirm("Удалить ВСЕ заказы? Действие необратимо. Обычно нужно только для очистки тестовых данных.")) return;
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
    if (!confirm("Удалить ВСЕ товары и категории? Заказы сохранятся. Нужно при смене склада — потом запустите обмен заново.")) return;
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
      <div style={{ maxWidth: 520, margin: "0 auto 20px" }}>
        <div style={{ fontSize: 12, color: "var(--ink-tertiary)", letterSpacing: ".06em", textTransform: "uppercase" }}>Служебное</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Разработчик</h1>
        <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginTop: 4 }}>
          Техническая настройка интеграции. Эта страница защищена отдельным паролем — владельцу магазина сюда не нужно.
        </p>
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
        <div style={card}>
          <form onSubmit={handleSave}>
            {/* ВК — ключ сообщества (peer_id владелец вводит у себя в Настройках) */}
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

            {/* Email / SMTP (адрес получателя владелец вводит в Настройках) */}
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
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? "Сохраняем…" : "Сохранить"}
              </button>
              <button type="button" onClick={handleLogout}
                style={{ padding: "0 18px", height: 40, borderRadius: "var(--radius-md)", cursor: "pointer",
                  border: "1px solid var(--graphite)", background: "transparent", color: "var(--ink)", fontWeight: 600, fontSize: 14 }}>
                Выйти
              </button>
            </div>
            <p style={{ fontSize: 12, color: "var(--ink-secondary)", marginTop: 14 }}>
              Проверить отправку (ВК / Email) можно у владельца в Настройках — кнопками «Отправить тест».
            </p>
          </form>

          {/* Диагностика обмена — что прислал склад в последнем import.xml */}
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--hairline-soft)" }}>
            <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Диагностика обмена</p>
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

          {/* Опасная зона — очистка каталога (при смене склада) */}
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--hairline-soft)" }}>
            <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Очистить каталог</p>
            <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 12 }}>
              Удаляет все товары и категории (заказы сохраняются). Нужно при подключении другого
              склада — старые товары исчезнут, затем запустите обмен заново.
            </p>
            <button type="button" onClick={handleWipe}
              style={{ padding: "0 16px", height: 38, borderRadius: "var(--radius-md)", cursor: "pointer",
                border: "1px solid var(--danger, #c0392b)", background: "transparent",
                color: "var(--danger, #c0392b)", fontWeight: 600, fontSize: 14 }}>
              Очистить каталог
            </button>
            {wipeMsg && <p style={{ marginTop: 10, fontSize: 13, color: "var(--ink-secondary)" }}>{wipeMsg}</p>}

            <p style={{ fontWeight: 600, fontSize: 14, margin: "20px 0 4px" }}>Удалить все заказы</p>
            <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 12 }}>
              Полностью удаляет все заказы и их позиции. Для очистки тестовых данных.
            </p>
            <button type="button" onClick={handleWipeOrders}
              style={{ padding: "0 16px", height: 38, borderRadius: "var(--radius-md)", cursor: "pointer",
                border: "1px solid var(--danger, #c0392b)", background: "transparent",
                color: "var(--danger, #c0392b)", fontWeight: 600, fontSize: 14 }}>
              Удалить все заказы
            </button>
            {ordersMsg && <p style={{ marginTop: 10, fontSize: 13, color: "var(--ink-secondary)" }}>{ordersMsg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
