import type { PromoCategory } from "@/types/product";

// Легаси-URL 3 стартовых категорий сохраняем без изменений; остальные — под /promo/<slug>.
const LEGACY_PATHS: Record<string, string> = {
  hot: "/hot", novinki: "/novinki", special: "/special",
};

/** Публичный путь раздела промо-категории (легаси-URL для стартовых, /promo/<slug> для новых). */
export function promoPath(slug: string): string {
  return LEGACY_PATHS[slug] ?? `/promo/${slug}`;
}

/** URL иконки промо-категории — переиспользуем публичную отдачу медиа (как логотипы брендов). */
export function promoIconUrl(icon: string): string {
  return `/api/v1/admin/media/${icon}`;
}

/* ─────────────────────────── Иконка бейджа ───────────────────────────
 * Вид бейджа держим в единственном строковом поле `icon` (String(255)) — отдельных колонок
 * под имя иконки, цвет и масштаб нет и заводить их не стали. Формы значения:
 *
 *   null                                    — иконки нет, бейдж рисуется фолбэком по слагу
 *   "upload_<uuid>.png"                     — ЛЕГАСИ: просто имя файла, цвет не задан
 *   "lucide:<имя>:<HEX6>"                   — иконка из набора + цвет круга
 *   "upload:<имя файла>:<HEX6>"             — своя картинка + цвет круга
 *   "lucide:<имя>:<HEX6>:<scale>"           — то же + масштаб штриха (напр. 1.3)
 *   "upload:<имя файла>:<HEX6>:<scale>"     — то же + масштаб штриха
 *
 * Масштаб — необязательный 4-й сегмент; при масштабе 1 он в строку НЕ пишется, поэтому
 * значения существующих разделов остаются байт-в-байт прежними (ничего не мигрируем).
 * Разделитель `:` безопасен: media_storage генерирует имена как `upload_<uuid>.<ext>` —
 * двоеточий там не бывает, а префикс `upload:` не спутать с именем `upload_...`.
 * Легаси-строки продолжают работать как раньше — этим и оправдана возня с форматом.
 */

/** Цвет круга по умолчанию, если в значении его нет (легаси-иконки). */
export const PROMO_ICON_DEFAULT_COLOR = "003399";

/** Масштаб штриха внутри круга. Круг и отступы не меняются — трансформируется только сам глиф. */
export const PROMO_ICON_DEFAULT_SCALE = 1;
export const PROMO_ICON_MIN_SCALE = 0.5;
export const PROMO_ICON_MAX_SCALE = 2;

/** Держим масштаб в разумных границах и отбрасываем мусор (NaN и т.п. → значение по умолчанию). */
export function clampPromoIconScale(n: number): number {
  if (!Number.isFinite(n)) return PROMO_ICON_DEFAULT_SCALE;
  return Math.min(PROMO_ICON_MAX_SCALE, Math.max(PROMO_ICON_MIN_SCALE, n));
}

export type PromoIconSpec =
  | { kind: "lucide"; name: string; color: string; scale: number }
  | { kind: "upload"; file: string; color: string | null; scale: number };

const LUCIDE_RE = /^lucide:([a-z0-9-]+):([0-9A-Fa-f]{6})(?::(\d+(?:\.\d+)?))?$/;
const UPLOAD_RE = /^upload:([^:]+):([0-9A-Fa-f]{6})(?::(\d+(?:\.\d+)?))?$/;

/** Масштаб из 4-го сегмента: пусто → значение по умолчанию. */
function parseScale(raw: string | undefined): number {
  return raw ? clampPromoIconScale(parseFloat(raw)) : PROMO_ICON_DEFAULT_SCALE;
}

/** Разбирает значение поля `icon`. null — иконки нет (рисуем фолбэк по слагу). */
export function parsePromoIcon(icon: string | null | undefined): PromoIconSpec | null {
  if (!icon) return null;
  const lucide = LUCIDE_RE.exec(icon);
  if (lucide) {
    return { kind: "lucide", name: lucide[1], color: lucide[2].toUpperCase(), scale: parseScale(lucide[3]) };
  }
  const upload = UPLOAD_RE.exec(icon);
  if (upload) {
    return { kind: "upload", file: upload[1], color: upload[2].toUpperCase(), scale: parseScale(upload[3]) };
  }
  // Ни одна форма не подошла — значит легаси-имя файла без цвета.
  return { kind: "upload", file: icon, color: null, scale: PROMO_ICON_DEFAULT_SCALE };
}

/** Собирает значение поля `icon` обратно в строку для PATCH. */
export function formatPromoIcon(spec: PromoIconSpec): string {
  const base = spec.kind === "lucide"
    ? `lucide:${spec.name}:${spec.color.toUpperCase()}`
    : `upload:${spec.file}:${(spec.color ?? PROMO_ICON_DEFAULT_COLOR).toUpperCase()}`;
  // Масштаб 1 не сериализуем — иначе у существующих разделов «на ровном месте» менялось бы
  // хранимое значение. Дробь округляем, чтобы не тащить в строку хвост float-погрешности.
  const scale = clampPromoIconScale(spec.scale ?? PROMO_ICON_DEFAULT_SCALE);
  return scale === PROMO_ICON_DEFAULT_SCALE ? base : `${base}:${Math.round(scale * 100) / 100}`;
}

/** transform для глифа в бейдже: круг/отступы не трогаем, масштабируем только сам штрих.
 *  Масштаб 1 → undefined, чтобы не навешивать лишний inline-стиль на обычные иконки. */
export function promoGlyphTransform(scale: number | undefined): string | undefined {
  const s = scale ?? PROMO_ICON_DEFAULT_SCALE;
  return s === PROMO_ICON_DEFAULT_SCALE ? undefined : `scale(${s})`;
}

export interface NavLink {
  href: string;
  label: string;
}

// Фиксированные пункты меню до и после промо-разделов.
const NAV_HEAD: NavLink[] = [
  { href: "/", label: "Главная" },
  { href: "/catalog", label: "Каталог" },
];
const NAV_TAIL: NavLink[] = [
  { href: "/about", label: "О компании" },
  { href: "/contacts", label: "Контакты" },
];

/** Пункты главного меню: фиксированные + промо-разделы из конфига (show_in_menu,
 *  порядок display_order). Общий источник для десктопного и мобильного меню. */
export function navLinks(promo: PromoCategory[] | undefined): NavLink[] {
  const promoLinks = (promo ?? [])
    .filter((c) => c.show_in_menu)
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((c) => ({ href: promoPath(c.slug), label: c.title }));
  return [...NAV_HEAD, ...promoLinks, ...NAV_TAIL];
}

/** «Основная» промо-категория товара для бейджа: первая в promo_slugs, сопоставленная с
 *  конфигом категорий. Порядок задаёт backend (сильнейшая по priority — первая), поэтому
 *  здесь просто берём первую совпавшую. null — бейджа нет. */
export function primaryPromo(
  slugs: string[] | undefined,
  byslug: Map<string, PromoCategory>,
): PromoCategory | null {
  for (const s of slugs ?? []) {
    const c = byslug.get(s);
    if (c) return c;
  }
  return null;
}
