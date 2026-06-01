import Link from "next/link";
import { getProducts } from "@/lib/api";

export default async function CatalogPage() {
  const data = await getProducts();

  return (
    <div className="catalog-page">
      <h1 className="catalog-title">Каталог товаров</h1>

      {data.items.length === 0 ? (
        <p className="empty">Товары не найдены</p>
      ) : (
        <div className="product-grid">
          {data.items.map((product) => (
            <Link key={product.id} href={`/products/${product.id}`}>
              <div className="product-card">
                <p className="product-name">{product.name}</p>
                {product.article && (
                  <p className="product-article">Арт. {product.article}</p>
                )}
                <p className="product-price">{Number(product.price).toFixed(2)} ₽</p>
                <p className={`product-stock ${product.stock > 0 ? "in-stock" : "out-of-stock"}`}>
                  {product.stock > 0 ? `В наличии: ${product.stock} шт` : "Нет в наличии"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
