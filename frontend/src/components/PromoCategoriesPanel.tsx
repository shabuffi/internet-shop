"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminToggle from "@/components/AdminToggle";
import HelpHint from "@/components/HelpHint";
import PromoIconPicker, { type PromoIconLibraryItem } from "@/components/PromoIconPicker";
import { IconInfo, IconPencil, IconPlus, IconTrash } from "@/components/icons";
import { adminFetch, adminUpload } from "@/lib/adminApi";
import { parsePromoIcon, promoGlyphTransform, promoIconUrl } from "@/lib/promo";
import PromoLucideIcon from "@/lib/promoIcons";

/** Промо-категория в админке. slug сюда не приходит — это техническая деталь. */
interface PromoCategoryAdmin {
  id: string;
  title: string;
  subtitle: string | null;
  icon: string | null;
  display_order: number;
  priority: number;
  show_in_menu: boolean;
  show_on_home: boolean;
  show_old_price: boolean;
  is_active: boolean;
  product_count: number;
  source_field_id: string | null;
  source_field_name: string | null;
}

/** Доп-поле МойСклад для выпадающего списка. */
interface MoySkladProperty {
  id: string;
  name: string;
  origin: string;
  last_seen_at: string | null;
  product_count: number;
  looks_like_flag: boolean;
  taken_by: string | null;
}

const NO_FIELD = "";

/** Подпись поля со значком «?» — тот же HelpHint, что и в шапках страниц админки. */
function FieldLabel({ text, hint }: { text: string; hint: string }) {
  return (
    <span className="form-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {text}
      <HelpHint text={hint} />
    </span>
  );
}

const card: React.CSSProperties = {
  background: "var(--canvas)", borderRadius: "var(--radius-lg)",
  border: "1px solid var(--hairline-soft)", padding: "20px 22px",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "не приходило в обмене";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

/** Русское склонение после числа — иначе счётчики читаются как машинный вывод. */
function plural2(n: number, one: string, few: string, many: string): string {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

/** Небольшая плашка-статус. */
function Chip({ text, tone }: { text: string; tone: "ok" | "off" | "warn" | "plain" }) {
  const tones = {
    ok:    { bg: "var(--stock-soft)", fg: "#1F7A4C" },
    off:   { bg: "var(--fog)", fg: "var(--ink-secondary)" },
    warn:  { bg: "var(--accent-2-soft)", fg: "var(--accent-2-deep)" },
    plain: { bg: "var(--cloud)", fg: "var(--ink-secondary)" },
  }[tone];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", flexShrink: 0, padding: "3px 9px",
      borderRadius: 999, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap",
      background: tones.bg, color: tones.fg,
    }}>
      {text}
    </span>
  );
}

/** Бейдж раздела в админке. Настроенная иконка рисуется теми же классами, что и на витрине.
 *  Легаси-иконка (имя файла без цвета) на витрине лежит на цвете своего слага, а здесь — на
 *  нейтральном круге: slug в админку не отдаётся, так что цвет тут просто неоткуда взять. */
function IconPreview({ icon, size = 34 }: { icon: string | null; size?: number }) {
  const spec = parsePromoIcon(icon);
  if (!spec) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        border: "1.5px dashed var(--steel)", color: "var(--ink-tertiary)", fontSize: 10,
      }}>
        нет
      </span>
    );
  }
  return (
    <span
      className="pcard__promo pcard__promo--icon"
      style={{
        position: "static", width: size, height: size, minWidth: size,
        background: spec.color ? `#${spec.color}` : "var(--steel)",
      }}
    >
      {spec.kind === "lucide"
        ? <PromoLucideIcon name={spec.name} className="pcard__promo__glyph"
            style={{ transform: promoGlyphTransform(spec.scale) }} />
        : <img src={promoIconUrl(spec.file)} alt="" className="pcard__promo__glyph"
            style={{ transform: promoGlyphTransform(spec.scale) }} />}
    </span>
  );
}

/**
 * Выбор доп-поля МойСклад — ТОЛЬКО из списка, руками имя не вводится.
 *
 * Поле уже занятое другой категорией показываем неактивным с подписью, кем занято: владелец
 * видит причину, а не просто отсутствие пункта. Поля-«галочки» бэкенд отдаёт первыми — это
 * подсказка, а не запрет: выбрать можно любое.
 */
function FieldSelect({
  value, props, onChange, disabledHint,
}: {
  value: string | null;
  props: MoySkladProperty[];
  onChange: (id: string | null) => void;
  disabledHint?: string;
}) {
  return (
    <select
      className="form-input"
      value={value ?? NO_FIELD}
      onChange={(e) => onChange(e.target.value === NO_FIELD ? null : e.target.value)}
      title={disabledHint}
    >
      <option value={NO_FIELD}>— поле не выбрано —</option>
      {props.map((p) => (
        <option
          key={p.id}
          value={p.id}
          // Занятое поле выбрать нельзя (одно поле — одна категория), кроме текущего.
          disabled={!!p.taken_by && p.id !== value}
        >
          {p.name} ({p.product_count})
          {p.taken_by && p.id !== value ? ` — занято: ${p.taken_by}` : ""}
          {!p.looks_like_flag ? " · не похоже на галочку" : ""}
        </option>
      ))}
    </select>
  );
}

/** Порядок и приоритет владелец видит с 1, а хранятся они с 0 — витрина сортирует по ним
 *  и менять хранение ради подписи незачем. Пересчёт держим в одном месте, чтобы смещение
 *  не разъехалось между показом и сохранением. */
const toUi = (stored: number) => stored + 1;
const toStored = (ui: number) => Math.max(1, Math.round(ui || 1)) - 1;

/** Панель «Промо-разделы» — вкладка страницы «Настройка сайта» (AdminShell даёт страница). */
export default function PromoCategoriesPanel() {
  const [cats, setCats] = useState<PromoCategoryAdmin[]>([]);
  const [props, setProps] = useState<MoySkladProperty[]>([]);
  const [library, setLibrary] = useState<PromoIconLibraryItem[]>([]);
  // Ид строки реестра (не имя): при переименовании поля в МойСклад привязка не рвётся.
  const [oldPriceFieldId, setOldPriceFieldId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newField, setNewField] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Ид категории, у которой сейчас открыт выбор иконки.
  const [iconFor, setIconFor] = useState<string | null>(null);
  // Номер последней запущенной загрузки — чтобы отбрасывать ответы, обогнавшие свежие.
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    // Правки сохраняются по уходу фокуса, каждая тянет за собой перезагрузку. Две подряд
    // могут вернуться не в том порядке — тогда ответ первой затёр бы данные второй, а поля
    // пересоздались бы по key со старым текстом. Применяем только самый свежий ответ.
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const [c, p, s, lib] = await Promise.all([
        adminFetch<PromoCategoryAdmin[]>("/promo-categories"),
        adminFetch<MoySkladProperty[]>("/moysklad-properties"),
        adminFetch<{ promo_old_price_field_id: string | null }>("/settings"),
        adminFetch<{ items: PromoIconLibraryItem[] }>("/promo-icons"),
      ]);
      if (seq !== loadSeq.current) return;   // ответ устарел — пришёл после более свежего
      setCats(c);
      setProps(p);
      setOldPriceFieldId(s.promo_old_price_field_id || null);
      setLibrary(lib.items);
      setErr(null);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setErr(e instanceof Error ? e.message : "Не удалось загрузить");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => Promise<unknown>, okMsg: string) {
    try {
      await fn();
      setMsg(okMsg);
      setErr(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
      setMsg(null);
    }
  }

  const patch = (id: string, body: Partial<PromoCategoryAdmin>) =>
    run(() => adminFetch(`/promo-categories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
        "Сохранено");

  const create = () =>
    run(async () => {
      await adminFetch("/promo-categories", {
        method: "POST",
        body: JSON.stringify({ title: newTitle.trim(), source_field_id: newField }),
      });
      setNewTitle("");
      setNewField(null);
      setCreating(false);
    }, "Категория создана — настройте и включите её");

  const remove = (c: PromoCategoryAdmin) => {
    const warn =
      `Удалить раздел «${c.title}»?\n\n` +
      `Обмен его НЕ восстановит — категории создаёт только администратор. ` +
      `Товары и данные МойСклад не пострадают, но адрес раздела на сайте перестанет открываться ` +
      `и при повторном создании будет другим.\n\n` +
      `Чтобы временно убрать раздел с сайта, лучше выключить его тумблером «Показывать».`;
    if (!confirm(warn)) return;
    void run(() => adminFetch(`/promo-categories/${c.id}`, { method: "DELETE" }), "Раздел удалён");
  };

  /** Кладёт файл в медиа-хранилище и добавляет его в библиотеку своих иконок. */
  async function uploadIcon(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const { name } = await adminUpload<{ name: string }>("/promo-icons", fd);
    // Файл уже на сервере — сорвавшееся обновление списка не повод объявлять загрузку
    // неудачной: иначе владелец «перезальёт» и получит второй такой же файл.
    await refreshLibrary().catch(() => {});
    return name;
  }

  /** Удаляет свою иконку. Занятую бэкенд не отдаст (409) — сообщение покажет окно выбора. */
  async function deleteIcon(name: string): Promise<void> {
    await adminFetch(`/promo-icons/${name}`, { method: "DELETE" });
    await refreshLibrary();
  }

  async function refreshLibrary() {
    const lib = await adminFetch<{ items: PromoIconLibraryItem[] }>("/promo-icons");
    setLibrary(lib.items);
  }

  const lastSeen = props
    .map((p) => p.last_seen_at)
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;

  if (loading) {
    return <div style={card}>Загрузка…</div>;
  }

  const editing = cats.find((c) => c.id === iconFor);

  return (
    <>
      <div style={{ maxWidth: 1180, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ─── Шапка ─── */}
        {/* Заголовка нет намеренно: имя раздела уже написано на вкладке. */}
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-secondary)", maxWidth: 640 }}>
              Разделы вроде «Убойные цены» или «Новинки». Товар попадает в раздел, если в МойСклад
              у него заполнено выбранное здесь доп-поле.
              {cats.length > 0 && (
                <> Сейчас: {cats.length} {plural2(cats.length, "раздел", "раздела", "разделов")},
                  из них на сайте — {cats.filter((c) => c.is_active).length}. Карточки идут в том же
                  порядке, что и пункты меню.</>
              )}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setCreating((v) => !v)} style={{ flexShrink: 0 }}>
            <IconPlus width={16} height={16} style={{ marginRight: 6 }} /> Новый раздел
          </button>
        </header>

        {(err || msg) && (
          <div style={{
            ...card, padding: "12px 16px", fontSize: 13.5,
            borderColor: err ? "var(--error)" : "var(--stock)",
            background: err ? "var(--accent-2-soft)" : "var(--stock-soft)",
            color: err ? "var(--error)" : "#1F7A4C",
          }}>
            {err ?? msg}
          </div>
        )}

        {/* ─── Свежесть списка полей ───
            Кнопки «обновить из МойСклад» здесь нет и быть не может: обмен работает только на
            приём — инициатор всегда МойСклад, магазин сам к нему не ходит. Список и так
            пополняется на каждом обмене. */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px",
          borderRadius: "var(--radius-lg)", background: "var(--cloud)",
          border: "1px solid var(--hairline-soft)",
        }}>
          <IconInfo width={16} height={16} style={{ flexShrink: 0, marginTop: 2, color: "var(--ink-tertiary)" }} />
          <div style={{ fontSize: 12.5, color: "var(--ink-secondary)", lineHeight: 1.6 }}>
            {lastSeen ? (
              <>
                <strong style={{ color: "var(--ink)" }}>Список полей МойСклад обновлён {fmtDate(lastSeen)}</strong>
                {" — "}доступно полей: {props.length}. Новые поля появляются здесь сами после
                очередного обмена.
              </>
            ) : props.length > 0 ? (
              <>Список полей восстановлен из характеристик товаров ({props.length}). После ближайшего
              обмена он обновится сам.</>
            ) : (
              <>Поля МойСклад появятся в списке после первого обмена.</>
            )}
          </div>
        </div>

        {/* ─── Создание ─── */}
        {creating && (
          <div style={{ ...card, borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Новый раздел</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={fieldCol}>
                <span className="form-label">Название на сайте</span>
                <input
                  className="form-input"
                  value={newTitle}
                  autoFocus
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Например: Хит продаж"
                  onKeyDown={(e) => e.key === "Enter" && newTitle.trim() && void create()}
                />
              </label>
              <label style={fieldCol}>
                <FieldLabel text="Доп-поле МойСклад" hint="Поле, по которому товары автоматически попадают в данный раздел." />
                <FieldSelect value={newField} props={props} onChange={setNewField} />
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" disabled={!newTitle.trim()} onClick={() => void create()}>
                Создать
              </button>
              <button className="btn btn--outline btn--sm" onClick={() => setCreating(false)}>Отмена</button>
              <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>
                Раздел создаётся выключенным — сайт не изменится, пока вы его не включите.
              </span>
            </div>
          </div>
        )}

        {/* ─── Старая цена: одно поле на весь магазин ─── */}
        <div style={{ ...card, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8 }}>
              Поле «Старая цена»
              <HelpHint text="Выберите поле МойСклад, содержащее старую цену товара." />
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--ink-secondary)" }}>
              Доп-поле МойСклад с зачёркнутой ценой — одно на весь магазин. Пока не выбрано,
              старая цена нигде не показывается. Показ включается у каждого раздела отдельно.
            </p>
          </div>
          <div style={{ flex: "0 1 320px" }}>
            <FieldSelect
              value={oldPriceFieldId}
              props={props.map((p) => ({ ...p, taken_by: null }))}   // это поле занятости не имеет
              onChange={(id) => {
                const name = props.find((p) => p.id === id)?.name ?? "";
                void run(
                  // Сохраняем ИД строки реестра, а не имя: переименуют поле в МойСклад —
                  // старая цена продолжит работать сама, без перенастройки.
                  () => adminFetch("/settings", {
                    method: "POST",
                    body: JSON.stringify({ "promo.old_price_field_id": id ?? "" }),
                  }),
                  id ? `Старая цена берётся из поля «${name}»` : "Старая цена отключена",
                );
              }}
            />
          </div>
        </div>

        {/* ─── Список разделов ─── */}
        {cats.length === 0 ? (
          <div style={{ ...card, textAlign: "center", padding: "48px 24px" }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Разделов пока нет</p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-secondary)" }}>
              Создайте первый — например «Хит продаж».
            </p>
          </div>
        ) : (
          <div style={{
            display: "grid", gap: 16,
            gridTemplateColumns: "repeat(auto-fill, minmax(430px, 1fr))",
          }}>
            {cats.map((c) => {
              const unconfigured = !c.source_field_id;
              return (
                <div key={c.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* Шапка карточки: иконка · название · статусы · действия */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button
                      onClick={() => setIconFor(c.id)}
                      title="Изменить иконку"
                      aria-label={`Изменить иконку раздела «${c.title}»`}
                      style={{ border: "none", background: "none", padding: 0, cursor: "pointer", lineHeight: 0 }}
                    >
                      <IconPreview icon={c.icon} />
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Название правится по месту: рамка проявляется только под курсором,
                          сохранение — по уходу фокуса, как и в остальных полях страницы.
                          key по значению — поле неуправляемое, и без пересоздания оно бы
                          навсегда осталось со старым текстом, если сервер его поправил. */}
                      <input
                        key={c.title}
                        defaultValue={c.title}
                        aria-label="Название на сайте"
                        style={{
                          width: "100%", border: "1px solid transparent", background: "transparent",
                          borderRadius: "var(--r-sm)", padding: "3px 6px", margin: "0 0 0 -6px",
                          fontSize: 16, fontWeight: 700, color: "var(--ink)", fontFamily: "inherit",
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = "var(--steel)";
                          e.target.style.background = "var(--canvas)";
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = "transparent";
                          e.target.style.background = "transparent";
                          if (e.target.value !== c.title) void patch(c.id, { title: e.target.value });
                        }}
                      />
                      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        {unconfigured
                          ? <Chip text="Требует настройки" tone="warn" />
                          : <Chip text={c.is_active ? "Активен" : "Выключен"} tone={c.is_active ? "ok" : "off"} />}
                        <Chip
                          text={`${c.product_count} ${plural2(c.product_count, "товар", "товара", "товаров")}`}
                          tone="plain"
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button onClick={() => setIconFor(c.id)} title="Изменить иконку"
                        aria-label="Изменить иконку" style={iconBtn}>
                        <IconPencil width={15} height={15} />
                      </button>
                      <button onClick={() => remove(c)} title="Удалить раздел"
                        aria-label={`Удалить раздел «${c.title}»`}
                        style={{ ...iconBtn, color: "var(--error)" }}>
                        <IconTrash width={15} height={15} />
                      </button>
                    </div>
                  </div>

                  {unconfigured && (
                    <p style={{
                      margin: 0, padding: "8px 10px", borderRadius: "var(--r-sm)", fontSize: 12,
                      background: "var(--accent-2-soft)", color: "var(--accent-2-deep)",
                    }}>
                      Поле МойСклад не выбрано. Товары в разделе остаются как есть, но обмен их не обновляет.
                    </p>
                  )}

                  {/* Источник + числа: связанные поля рядом */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 92px 92px", gap: 10, alignItems: "end" }}>
                    <label style={fieldCol}>
                      <FieldLabel text="Доп-поле МойСклад" hint="Поле, по которому товары автоматически попадают в данный раздел." />
                      <FieldSelect
                        value={c.source_field_id}
                        props={props}
                        onChange={(id) => void patch(c.id, { source_field_id: id })}
                      />
                    </label>
                    <label style={fieldCol}>
                      <FieldLabel
                        text="Порядок"
                        hint="Определяет порядок отображения разделов на сайте и в меню. Меньшее число отображается раньше."
                      />
                      <input
                        key={c.display_order}
                        className="form-input" type="number" min={1}
                        defaultValue={toUi(c.display_order)}
                        onBlur={(e) => {
                          const next = toStored(Number(e.target.value));
                          if (next !== c.display_order) void patch(c.id, { display_order: next });
                          else e.target.value = String(toUi(c.display_order));   // вернуть 0/мусор к норме
                        }}
                      />
                    </label>
                    <label style={fieldCol}>
                      <FieldLabel
                        text="Приоритет"
                        hint="Используется только если товар одновременно входит в несколько промо-разделов. Раздел с меньшим значением приоритета становится основным для этого товара."
                      />
                      <input
                        key={c.priority}
                        className="form-input" type="number" min={1}
                        defaultValue={toUi(c.priority)}
                        onBlur={(e) => {
                          const next = toStored(Number(e.target.value));
                          if (next !== c.priority) void patch(c.id, { priority: next });
                          else e.target.value = String(toUi(c.priority));
                        }}
                      />
                    </label>
                  </div>

                  {c.source_field_name && (
                    <p style={{ margin: "-6px 0 0", fontSize: 11.5, color: "var(--ink-tertiary)" }}>
                      Сейчас: «{c.source_field_name}». Если поле переименуют в МойСклад, подпись
                      обновится сама — связь не порвётся.
                    </p>
                  )}

                  {/* Подзаголовок печатается на странице раздела под заголовком (PromoListing).
                      У своих разделов запасного текста нет — пока поле пустое, там пусто. */}
                  <label style={fieldCol}>
                    <span className="form-label">Описание на странице раздела</span>
                    <input
                      key={c.subtitle ?? ""}
                      className="form-input"
                      defaultValue={c.subtitle ?? ""}
                      placeholder="Строка под заголовком раздела — например: Свежие поступления со склада"
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next !== (c.subtitle ?? "")) void patch(c.id, { subtitle: next || null });
                      }}
                    />
                  </label>

                  {/* Тумблеры */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <AdminToggle
                      label="Показывать раздел" hint="Виден на сайте"
                      labelHint="Неактивный раздел не отображается на сайте и не участвует в распределении товаров."
                      checked={c.is_active} onChange={(v) => void patch(c.id, { is_active: v })}
                    />
                    <AdminToggle
                      label="В меню" hint="Пункт в шапке сайта"
                      checked={c.show_in_menu} onChange={(v) => void patch(c.id, { show_in_menu: v })}
                    />
                    <AdminToggle
                      label="На главной" hint="Лента на первой странице"
                      checked={c.show_on_home} onChange={(v) => void patch(c.id, { show_on_home: v })}
                    />
                    <AdminToggle
                      label="Старая цена"
                      hint={oldPriceFieldId ? "Зачёркнутая цена" : "Сначала выберите поле выше"}
                      labelHint="При включении рядом с текущей ценой будет отображаться старая цена из выбранного поля МойСклад."
                      checked={c.show_old_price} onChange={(v) => void patch(c.id, { show_old_price: v })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <PromoIconPicker
          // Начальное состояние окна берётся из пропсов один раз — пересоздаём его на каждую
          // категорию, иначе выбор «прилипнет» от предыдущей.
          key={editing.id}
          title={editing.title}
          icon={editing.icon}
          library={library}
          onUpload={uploadIcon}
          onDeleteIcon={deleteIcon}
          onClose={() => setIconFor(null)}
          onSave={(icon) => {
            setIconFor(null);
            void run(
              () => adminFetch(`/promo-categories/${editing.id}`, {
                method: "PATCH", body: JSON.stringify({ icon }),
              }),
              icon ? "Иконка обновлена" : "Иконка убрана",
            );
          }}
        />
      )}
    </>
  );
}

const fieldCol: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const iconBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30, borderRadius: "var(--r-sm)", cursor: "pointer",
  border: "1px solid var(--hairline)", background: "var(--canvas)", color: "var(--ink-secondary)",
};
