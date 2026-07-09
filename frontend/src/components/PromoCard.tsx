import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { IconImage } from "@/components/icons";
import AddToCartCard from "@/components/AddToCartCard";
import ChestnyZnakBadge from "@/components/ChestnyZnakBadge";
import ProductName from "@/components/ProductName";
import type { Product } from "@/types/product";

/** Карточка товара с бейджем NEW / % — для секций и страниц «Новинки»/«Спецпредложения».
 *  `compact` (только на главной) — витринный вид: вся карточка ссылка на товар, без степера,
 *  название режется до 2 строк. На страницах — обычный вид со степером и разворотом названия. */
export default function PromoCard({ p, kind, compact = false }: { p: Product; kind: "new" | "sale"; compact?: boolean }) {
  const badge = <span className={`pcard__promo pcard__promo--${kind}`}>{kind === "new" ? "NEW" : "%"}</span>;
  const media = (
    <div className="photo photo--square">
      {p.image_url
        ? <img src={`/api/v1/products/${p.id}/image`} alt={p.name} />
        : <span className="photo__ph"><IconImage /></span>}
    </div>
  );
  const price = <span className="price">{Number(p.price) > 0 ? formatPrice(p.price) : "—"}</span>;

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

  // Разделы (каталог/новинки/спец): картинка и название — ссылки, снизу цена + степер.
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
