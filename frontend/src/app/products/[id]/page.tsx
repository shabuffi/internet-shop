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

  const inStock = product.stock > 0;

  return (
    <div className="product-detail">
      <Link href="/" className="back-link">← Назад в каталог</Link>

      <h1 className="detail-name">{product.name}</h1>

      {product.article && (
        <p className="detail-article">Артикул: {product.article}</p>
      )}

      <p className="detail-price">{Number(product.price).toFixed(2)} ₽</p>

      {product.description && (
        <p className="detail-description">{product.description}</p>
      )}

      <p className={`detail-stock ${inStock ? "in-stock" : "out-of-stock"}`}>
        {inStock ? `В наличии: ${product.stock} шт` : "Нет в наличии"}
      </p>

      <AddToCartButton product={product} />
    </div>
  );
}
