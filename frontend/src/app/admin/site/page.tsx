"use client";

import { useEffect, useRef, useState } from "react";
import AdminShell from "@/components/AdminShell";
import HelpHint from "@/components/HelpHint";
import PasswordField from "@/components/PasswordField";
import { adminFetch, adminUpload } from "@/lib/adminApi";
import { brandImageUrl, type Brand } from "@/lib/brands";

interface ShopSettings {
  shop_name: string; contact_phone: string; contact_email: string; contact_hours: string;
  company_legal_name: string; company_inn: string; company_ogrn: string; warehouse_address: string;
  warehouse_coords: string; delivery_info: string;
  show_stock_qty: boolean;
}

const EMPTY: ShopSettings = {
  shop_name: "", contact_phone: "", contact_email: "", contact_hours: "",
  company_legal_name: "", company_inn: "", company_ogrn: "", warehouse_address: "",
  warehouse_coords: "", delivery_info: "", show_stock_qty: true,
};

const cardStyle: React.CSSProperties = {
  background: "var(--canvas)", borderRadius: "var(--radius-lg)", border: "1px solid var(--hairline-soft)",
  padding: "28px 32px", maxWidth: 720, marginBottom: 24,
};
const inputStyle = { display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 16 };

// «Настройка сайта» — всё, что владелец меняет на витрине: магазин/контакты/реквизиты,
// показ остатка, логотипы брендов, а также смена пароля входа в админку.
export default function AdminSitePage() {
  // ── Магазин + показ остатка ──
  const [form, setForm] = useState<ShopSettings>(EMPTY);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [error, setError] = useState("");

  // ── Бренды ──
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingBrands, setSavingBrands] = useState(false);
  const [savedBrands, setSavedBrands] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Перетаскивание карточек бренда: индекс «взятой» карточки и индекс, над которым висим.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // ── Пароль админа ──
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    adminFetch<ShopSettings>("/settings")
      .then(d => setForm({
        shop_name: d.shop_name || "", contact_phone: d.contact_phone || "", contact_email: d.contact_email || "",
        contact_hours: d.contact_hours || "", company_legal_name: d.company_legal_name || "",
        company_inn: d.company_inn || "", company_ogrn: d.company_ogrn || "",
        warehouse_address: d.warehouse_address || "", warehouse_coords: d.warehouse_coords || "",
        delivery_info: d.delivery_info || "", show_stock_qty: d.show_stock_qty !== false,
      }))
      .catch(() => {});
    adminFetch<{ brands: Brand[] }>("/brands")
      .then((d) => { setBrands(d.brands || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const set = (k: keyof ShopSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  // Сохраняет поля одного блока (значения приводим к строке; булев show_stock_qty → «1»/«0»)
  async function saveSection(e: React.FormEvent, id: string, keys: (keyof ShopSettings)[]) {
    e.preventDefault();
    setError(""); setSavedSection(null); setSavingSection(id);
    const body: Record<string, string> = {};
    for (const k of keys) {
      const v = form[k];
      body[k] = typeof v === "boolean" ? (v ? "1" : "0") : String(v ?? "");
    }
    try {
      await adminFetch("/settings", { method: "POST", body: JSON.stringify(body) });
      setSavedSection(id);
      setTimeout(() => setSavedSection(s => (s === id ? null : s)), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally { setSavingSection(null); }
  }

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

  // ── Бренды: загрузка (множественная), порядок, удаление, сохранение ──
  async function onUpload(files?: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    setUploading(true); setError("");
    const added: Brand[] = [];
    const failed: string[] = [];
    for (const file of list) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        added.push(await adminUpload<Brand>("/brands/upload", fd));
      } catch {
        failed.push(file.name);
      }
    }
    if (added.length) { setBrands((prev) => [...prev, ...added]); setSavedBrands(false); }
    if (failed.length) setError(`Не удалось загрузить: ${failed.join(", ")}`);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  // Перемещает карточку с позиции from на позицию to (drag-and-drop) — любой порядок.
  function reorderBrand(from: number, to: number) {
    setBrands((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setSavedBrands(false);
  }

  function removeBrand(i: number) {
    setBrands((prev) => prev.filter((_, k) => k !== i));
    setSavedBrands(false);
  }

  async function saveBrands() {
    setSavingBrands(true); setError("");
    try {
      const d = await adminFetch<{ brands: Brand[] }>("/brands", {
        method: "POST", body: JSON.stringify({ brands }),
      });
      setBrands(d.brands || []);
      setSavedBrands(true); setTimeout(() => setSavedBrands(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSavingBrands(false);
    }
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

  const iconBtn: React.CSSProperties = {
    width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center",
    borderRadius: 8, border: "1px solid var(--hairline-soft, #e5e7eb)", background: "var(--canvas, #fff)",
    color: "var(--ink)", cursor: "pointer", fontSize: 15, lineHeight: 1,
  };

  return (
    <AdminShell>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Настройка сайта</h1>
        <HelpHint text={"Всё, что видно покупателю: название и контакты магазина, реквизиты, показ остатка, логотипы брендов. Здесь же — смена пароля входа в админку.\n\nКаждый блок сохраняется своей кнопкой."} />
      </div>

      {error && <p className="form-error" style={{ maxWidth: 520, marginBottom: 16 }}>{error}</p>}

      {/* Магазин */}
      <form style={cardStyle} onSubmit={e => saveSection(e, "shop", ["shop_name", "contact_phone", "contact_email", "contact_hours", "company_legal_name", "company_inn", "company_ogrn", "warehouse_address", "warehouse_coords", "delivery_info"])}>
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
          <label className="form-label">Координаты для метки на карте</label>
          <input className="form-input" value={form.warehouse_coords} onChange={set("warehouse_coords")} placeholder="например: 56.859611, 35.911896" />
          <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>
            Необязательно. Откройте <a href="https://yandex.ru/maps" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Яндекс.Карты</a>,
            правый клик по нужной точке → «Что здесь?» → скопируйте координаты (широта, долгота).
            С координатами карта покажет аккуратную метку без кнопок поиска. Пусто — карта ищет по адресу.
          </p>
        </div>
        <div style={inputStyle}>
          <label className="form-label">Доставка (на странице товара)</label>
          <input className="form-input" value={form.delivery_info} onChange={set("delivery_info")} placeholder="например, 1–3 дня по России" />
          <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>Один текст для всех товаров. Пусто — строка не показывается.</p>
        </div>
        {saveRow("shop")}
      </form>

      {/* Показ остатка на витрине */}
      <form style={cardStyle} onSubmit={e => saveSection(e, "stock", ["show_stock_qty"])}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <p style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>Показ остатка</p>
          <HelpHint text={"Как показывать наличие товара на карточках и в списке каталога. Выберите одно — точное число или просто «В наличии» (чтобы не дублировать)."} />
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 12 }}>
          Что видит покупатель у товара в наличии.
        </p>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10,
          border: "1px solid " + (form.show_stock_qty ? "var(--accent, #003399)" : "var(--hairline-soft)"), marginBottom: 8, cursor: "pointer" }}>
          <input type="radio" name="stock_mode" checked={form.show_stock_qty} onChange={() => setForm(p => ({ ...p, show_stock_qty: true }))} style={{ marginTop: 3 }} />
          <span>
            <b>Точный остаток</b> — например «12 шт.»
            <span style={{ display: "block", fontSize: 12, color: "var(--ink-secondary)" }}>Покупатель видит, сколько штук на складе.</span>
          </span>
        </label>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10,
          border: "1px solid " + (!form.show_stock_qty ? "var(--accent, #003399)" : "var(--hairline-soft)"), marginBottom: 4, cursor: "pointer" }}>
          <input type="radio" name="stock_mode" checked={!form.show_stock_qty} onChange={() => setForm(p => ({ ...p, show_stock_qty: false }))} style={{ marginTop: 3 }} />
          <span>
            <b>Только «В наличии»</b> — без числа
            <span style={{ display: "block", fontSize: 12, color: "var(--ink-secondary)" }}>Показываем только факт наличия.</span>
          </span>
        </label>
        {saveRow("stock")}
      </form>

      {/* Бренды */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <p style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>Бренды</p>
          <HelpHint text={"Логотипы брендов показываются слайдером над футером главной. Можно выбрать сразу несколько файлов (PNG лучше с прозрачным фоном, или JPG); порядок задаётся перетаскиванием карточек."} />
        </div>

        <div style={{ background: "var(--surface, #f5f6f8)", borderRadius: 10, padding: "12px 14px",
          fontSize: 13, lineHeight: 1.6, color: "var(--ink-secondary, #4b5563)", marginBottom: 16 }}>
          <b style={{ color: "var(--ink)" }}>Рекомендации к логотипам:</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            <li><b>PNG с прозрачным фоном</b> — покажется на фоне сайта; <b>JPG</b> — как есть (свой фон).</li>
            <li>Все логотипы выравниваются по высоте, ряд подстраивается под самый высокий.</li>
            <li>Желательно: высота от 100&nbsp;px, горизонтальная ориентация, вес до&nbsp;~300&nbsp;КБ.</li>
          </ul>
        </div>

        {!loaded ? (
          <p style={{ color: "var(--ink-secondary)" }}>Загрузка…</p>
        ) : (
          <>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
              padding: "9px 16px", borderRadius: 10, border: "1px dashed var(--accent, #003399)",
              color: "var(--accent, #003399)", fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
              {uploading ? "Загрузка…" : "＋ Загрузить логотипы"}
              <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/svg+xml"
                style={{ display: "none" }} disabled={uploading}
                onChange={(e) => onUpload(e.target.files)} />
            </label>

            {brands.length === 0 ? (
              <p style={{ color: "var(--ink-secondary)", fontSize: 14, marginBottom: 16 }}>
                Логотипов пока нет — загрузите первый.
              </p>
            ) : (
              <>
                <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginBottom: 10 }}>
                  Перетаскивайте карточки за ручку&nbsp;<b style={{ color: "var(--ink)" }}>⠿</b>&nbsp;слева, чтобы задать порядок.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {brands.map((b, i) => {
                    const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
                    return (
                      <div key={b.id}
                        draggable
                        onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = "move"; }}
                        onDragEnter={() => setOverIndex(i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) reorderBrand(dragIndex, i); setDragIndex(null); setOverIndex(null); }}
                        onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                        style={{ display: "flex", alignItems: "center", gap: 12,
                          padding: "8px 12px", borderRadius: 10,
                          border: "1px solid " + (isOver ? "var(--accent, #003399)" : "var(--hairline-soft, #e5e7eb)"),
                          boxShadow: isOver ? "0 0 0 1px var(--accent, #003399) inset" : "none",
                          background: "var(--canvas, #fff)", opacity: dragIndex === i ? 0.4 : 1 }}>
                        <span aria-label="Перетащить" title="Перетащите, чтобы изменить порядок"
                          style={{ cursor: "grab", color: "var(--ink-tertiary)", fontSize: 20, lineHeight: 1, userSelect: "none", padding: "0 2px" }}>⠿</span>
                        <span style={{ color: "var(--ink-secondary)", fontSize: 13, width: 20, textAlign: "center" }}>{i + 1}</span>
                        {/* Превью без «шахматного» фона (он визуально уменьшал логотип) —
                            на нейтральном светлом фоне, крупнее, чтобы оценить как на сайте. */}
                        <span style={{ height: 60, width: 160, display: "inline-flex", alignItems: "center", justifyContent: "center",
                          borderRadius: 8, background: "var(--surface, #f5f6f8)" }}>
                          <img src={brandImageUrl(b.image)} alt="" draggable={false} style={{ maxHeight: 52, maxWidth: 150, objectFit: "contain", display: "block" }} />
                        </span>
                        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
                          <button type="button" style={{ ...iconBtn, color: "var(--danger, #c0392b)" }} onClick={() => removeBrand(i)} aria-label="Удалить" title="Удалить">✕</button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button onClick={saveBrands} disabled={savingBrands} type="button" className="btn btn-primary">
                {savingBrands ? "Сохранение…" : "Сохранить бренды"}
              </button>
              {savedBrands && <span style={{ color: "var(--stock, #16794a)", fontSize: 14, fontWeight: 600 }}>✓ Сохранено</span>}
            </div>
          </>
        )}
      </div>

      {/* Смена пароля админа */}
      <form style={cardStyle} onSubmit={handleChangePassword}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <p style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>Пароль входа в админку</p>
          <HelpHint text={"Пароль, которым вы входите в эту панель управления. Это не пароль обмена с МойСклад."} />
        </div>
        <div style={inputStyle}>
          <label className="form-label">Текущий пароль</label>
          <PasswordField className="form-input" value={pw.current_password}
            onChange={e => setPw(p => ({ ...p, current_password: e.target.value }))} autoComplete="current-password" required />
        </div>
        <div style={inputStyle}>
          <label className="form-label">Новый пароль</label>
          <PasswordField className="form-input" value={pw.new_password}
            onChange={e => setPw(p => ({ ...p, new_password: e.target.value }))} autoComplete="new-password" required minLength={8} />
          <p style={{ fontSize: 12, color: "var(--ink-secondary)" }}>Минимум 8 символов</p>
        </div>
        {pwMsg && (
          <p style={{ fontSize: 14, marginBottom: 8, color: pwMsg.ok ? "var(--stock)" : "var(--danger, #c0392b)" }}>
            {pwMsg.ok ? "✓ " : "✕ "}{pwMsg.text}
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={pwLoading} style={{ marginTop: 8 }}>
          {pwLoading ? "Меняем..." : "Сменить пароль"}
        </button>
      </form>
    </AdminShell>
  );
}
