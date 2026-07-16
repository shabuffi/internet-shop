import Link from "next/link";
import NoPhoto from "@/components/NoPhoto";
import AddToCartCard from "@/components/AddToCartCard";
import ChestnyZnakBadge from "@/components/ChestnyZnakBadge";
import ProductName from "@/components/ProductName";
import ProductPrice from "@/components/ProductPrice";
import PromoBadge from "@/components/PromoBadge";
import type { Product, PromoCategory } from "@/types/product";

/** Карточка товара с бейджем промо-категории — для секций и страниц промо-категорий.
 *  `category` — категория раздела (её бейдж рисуем поверх фото); нет — без бейджа.
 *  `compact` (только на главной) — витринный вид: вся карточка ссылка, без степера. */
export default function PromoCard({
  p, category, compact = false,
}: {
  p: Product;
  category?: Pick<PromoCategory, "slug" | "title" | "icon"> | null;
  compact?: boolean;
}) {
  const badge = category ? <PromoBadge category={category} /> : null;
  const media = (
    <div className="photo photo--square">
      {p.image_url
        ? <img src={`/api/v1/products/${p.id}/image`} alt={p.name} />
        : <NoPhoto />}
    </div>
  );
  const price = <ProductPrice p={p} />;

  // Главная: вся карточка — одна ссылка на товар, без степера (витрина-тизер).
  if (compact) {
    return (
      <article className="pcard pcard--compact">
        <Link href={`/products/${p.id}`} className="pcard__link" aria-label={p.name}>
          <div className="pcard__media">{badge}{media}</div>
          <div className="pcard__body">
            <div className="pcard__namewrap">
              {p.chestnyZnak && <ChestnyZnakBadge size={15} />}
              <span className="pcard__name">{p.name}</span>
            </div>
            <div className="pcard__sku">{p.article ? `Арт. ${p.article}` : " "}</div>
            <div className="pcard__foot">{price}</div>
          </div>
        </Link>
      </article>
    );
  }

  // Разделы (каталог/промо-страницы): картинка и название — ссылки, снизу цена + степер.
  return (
    <article className="pcard">
      <Link href={`/products/${p.id}`} className="pcard__media" aria-label={p.name}>
        {badge}{media}
      </Link>
      <div className="pcard__body">
        <div className="pcard__cat">{p.category?.name ?? " "}</div>
        <div className="pcard__namewrap" style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
          {p.chestnyZnak && <ChestnyZnakBadge size={15} />}
          <ProductName id={p.id} name={p.name} />
        </div>
        <div className="pcard__sku">{p.article ? `Арт. ${p.article}` : " "}</div>
        <div className="pcard__foot">
          {price}
          <AddToCartCard product={p} />
        </div>
      </div>
    </article>
  );
}
