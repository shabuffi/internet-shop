export const dynamic = 'force-dynamic';

import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct } from "@/lib/api";
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

  return (
    <div className="product-detail-page">
      <div className="container">
        <Link href="/" className="back-link">← Каталог</Link>

        <div className="product-detail-grid">
          <div className="product-detail-image" style={{ position: "relative", overflow: "hidden", background: "var(--surface)" }}>
            {product.image_url ? (
              <img
                src={`/api/v1/products/${product.id}/image`}
                alt={product.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>
                🛍
              </span>
            )}
          </div>

          <div className="product-detail-info">
            {product.category && (
              <p style={{ fontSize: 13, color: "var(--ink-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {product.category.name}
              </p>
            )}
            <h1 className="detail-name">{product.name}</h1>
            {product.article && <p className="detail-article">Артикул: {product.article}</p>}
            <p className="detail-price">{Number(product.price).toFixed(2)} ₽</p>

            {product.description && (
              <p className="detail-description">{product.description}</p>
            )}

            <p className={`detail-stock ${product.stock > 0 ? "in-stock" : "out-of-stock"}`}>
              {product.stock > 0 ? `✓ В наличии · ${product.stock} шт` : "✕ Нет в наличии"}
            </p>

            <AddToCartButton product={product} />
          </div>
        </div>
      </div>
    </div>
  );
}
