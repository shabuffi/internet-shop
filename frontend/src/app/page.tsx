export const dynamic = 'force-dynamic';

import Link from "next/link";
import { getProducts } from "@/lib/api";

export default async function CatalogPage() {
  const data = await getProducts();

  return (
    <div className="catalog-page">
      <div className="container">
        <div className="catalog-header">
          <h1 className="catalog-title">Каталог</h1>
          <span className="catalog-count">{data.total} товаров</span>
        </div>

        {data.items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <p className="empty-state-title">Товары не найдены</p>
            <p className="empty-state-body">Каталог пока пустой — синхронизация ещё не запускалась</p>
          </div>
        ) : (
          <div className="product-grid">
            {data.items.map((product) => (
              <Link key={product.id} href={`/products/${product.id}`} style={{ textDecoration: "none" }}>
                <div className="product-card">
                  <div className="product-card-image">🛍</div>
                  <div className="product-card-body">
                    {product.stock > 0
                      ? <span className="product-badge">В наличии</span>
                      : <span className="product-badge product-badge-oos">Нет в наличии</span>
                    }
                    <p className="product-name">{product.name}</p>
                    {product.article && <p className="product-article">Арт. {product.article}</p>}
                    <p className="product-price">{Number(product.price).toFixed(2)} ₽</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
