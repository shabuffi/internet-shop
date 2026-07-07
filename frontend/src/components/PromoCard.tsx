import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { IconImage } from "@/components/icons";
import AddToCartCard from "@/components/AddToCartCard";
import ChestnyZnakBadge from "@/components/ChestnyZnakBadge";
import type { Product } from "@/types/product";

/** Карточка товара с бейджем NEW / % — для секций и страниц «Новинки»/«Спецпредложения». */
export default function PromoCard({ p, kind }: { p: Product; kind: "new" | "sale" }) {
  return (
    <article className="pcard">
      <Link href={`/products/${p.id}`} className="pcard__media" aria-label={p.name}>
        <span className={`pcard__promo pcard__promo--${kind}`}>{kind === "new" ? "NEW" : "%"}</span>
        <div className="photo photo--square">
          {p.image_url
            ? <img src={`/api/v1/products/${p.id}/image`} alt={p.name} />
            : <span className="photo__ph"><IconImage /></span>}
        </div>
      </Link>
      <div className="pcard__body">
        <div className="pcard__cat">{p.category?.name ?? " "}</div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
          {p.chestnyZnak && <ChestnyZnakBadge size={15} />}
          <Link href={`/products/${p.id}`} className="pcard__name">{p.name}</Link>
        </div>
        <div className="pcard__sku">{p.article ? `Арт. ${p.article}` : " "}</div>
        <div className="pcard__foot">
          <span className="price">{Number(p.price) > 0 ? formatPrice(p.price) : "—"}</span>
          <AddToCartCard product={p} />
        </div>
      </div>
    </article>
  );
}
