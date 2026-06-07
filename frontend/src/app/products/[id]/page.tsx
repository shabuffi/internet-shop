export const dynamic = 'force-dynamic';

import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import AddToCartButton from "@/components/AddToCartButton";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;

  let product;
  try {
    product = await getProduct(id);
  } catch {
    notFound();
  }

  const inStock = product.stock > 0;
  const specs: [string, string][] = [
    ["Артикул", product.article || "—"],
    ["Категория", product.category?.name || "—"],
    ["Наличие", inStock ? `На складе · ${product.stock} шт` : "Под заказ"],
    ["Доставка", "1–3 дня"],
  ];

  return (
    <div className="page">
      <div className="container">
        <div className="breadcrumb">
          <Link href="/">Каталог</Link>
          {product.category && <><span>›</span><span>{product.category.name}</span></>}
          <span>›</span>
          <span style={{ color: "var(--charcoal)" }}>{product.name}</span>
        </div>

        <div className="pdp" style={{ paddingTop: "var(--s-6)", paddingBottom: "var(--s-16)" }}>
          <div className="pdp__media">
            <div className="pdp__hero">
              <div className="photo">
                {product.image_url
                  ? <img src={`/api/v1/products/${product.id}/image`} alt={product.name} />
                  : <span className="photo__ph" style={{ fontSize: 64 }}>🛍</span>}
              </div>
            </div>
          </div>

          <div className="pdp__info">
            {product.category && <div className="pdp__cat">{product.category.name}</div>}
            <h1 className="pdp__title">{product.name}</h1>
            <div className="row" style={{ gap: "var(--s-4)" }}>
              {product.article && <span className="pdp__sku">Арт. {product.article}</span>}
              {inStock
                ? <span className="badge badge--stock"><span className="badge__dot" />В наличии</span>
                : <span className="badge badge--out"><span className="badge__dot" />Нет в наличии</span>}
            </div>

            <div className="pdp__price">{formatPrice(product.price)}</div>

            {product.description && <p className="pdp__desc">{product.description}</p>}

            <AddToCartButton product={product} />

            <div className="notice">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="13" height="11" rx="1" /><path d="M14 9h4l3 3v5h-7" /><circle cx="6" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></svg>
              Бесплатная доставка при заказе от 5 000 ₽
            </div>

            <div className="pdp__divider" />
            <div className="pdp__specs">
              {specs.map(([k, v]) => (
                <div className="srow" key={k}><span>{k}</span><span style={{ fontWeight: 500 }}>{v}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
