import { IconFlame } from "@/components/icons";
import { parsePromoIcon, promoGlyphTransform, promoIconUrl } from "@/lib/promo";
import PromoLucideIcon from "@/lib/promoIcons";
import type { PromoCategory } from "@/types/product";

// Вид бейджа (цвет из CSS) для 3 стартовых слагов — чтобы их вид не менялся. Новые категории
// получают нейтральный «generic» вид; при настроенной иконке рисуется она.
const KIND_BY_SLUG: Record<string, "hot" | "new" | "sale"> = {
  hot: "hot", novinki: "new", special: "sale",
};

type BadgeCategory = Pick<PromoCategory, "slug" | "title" | "icon">;

/** Бейдж промо-категории на карточке: настроенная иконка (круг + белый штрих), иначе фолбэк
 *  по слагу (пламя/NEW/% для стартовых, первые буквы названия — для прочих). */
export default function PromoBadge({ category }: { category: BadgeCategory }) {
  const kind = KIND_BY_SLUG[category.slug] ?? "generic";
  const spec = parsePromoIcon(category.icon);

  // Иконка с выбранным цветом — единый вид со всем сайтом: цветной круг, белая иконка.
  if (spec && (spec.kind === "lucide" || spec.color)) {
    return (
      <span
        className="pcard__promo pcard__promo--icon"
        style={{ background: `#${spec.color}` }}
        aria-label={category.title}
        title={category.title}
      >
        {spec.kind === "lucide"
          ? <PromoLucideIcon name={spec.name} className="pcard__promo__glyph"
              style={{ transform: promoGlyphTransform(spec.scale) }} />
          // Свою картинку обесцвечиваем в белый силуэт — иначе разноцветный SVG выбьется
          // из общего стиля бейджей.
          : <img src={promoIconUrl(spec.file)} alt="" className="pcard__promo__glyph"
              style={{ transform: promoGlyphTransform(spec.scale) }} />}
      </span>
    );
  }

  return (
    <span className={`pcard__promo pcard__promo--${kind}`} aria-label={category.title} title={category.title}>
      {/* Легаси-иконка (имя файла без цвета) — рисуем как раньше, поверх цвета по слагу. */}
      {spec
        ? <img src={promoIconUrl(spec.file)} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        : kind === "hot" ? <IconFlame />
        : kind === "new" ? "NEW"
        : kind === "sale" ? "%"
        : category.title.slice(0, 3).toUpperCase()}
    </span>
  );
}
