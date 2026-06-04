export const dynamic = 'force-dynamic';

import Link from "next/link";
import { getProducts, getCategories } from "@/lib/api";

interface Props {
  searchParams: Promise<{ category_id?: string; search?: string; page?: string }>;
}

// Собирает URL каталога, сохраняя выбранные фильтры. page>1 добавляем только при необходимости.
function buildHref(params: { category_id?: string; search?: string; page?: number }) {
  const q = new URLSearchParams();
  if (params.category_id) q.set("category_id", params.category_id);
  if (params.search) q.set("search", params.search);
  if (params.page && params.page > 1) q.set("page", String(params.page));
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

const chipStyle = (active: boolean) => ({
  padding: "6px 14px",
  borderRadius: 20,
  fontSize: 13,
  fontWeight: 500,
  border: "1px solid var(--hairline-soft)",
  background: active ? "var(--ink)" : "transparent",
  color: active ? "var(--canvas)" : "var(--ink)",
  textDecoration: "none",
  transition: "all 0.15s",
});

export default async function CatalogPage({ searchParams }: Props) {
  const params = await searchParams;
  const categoryId = params.category_id;
  const search = params.search;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [data, categories] = await Promise.all([
    getProducts({ category_id: categoryId, search, page }),
    getCategories(),
  ]);

  return (
    <div className="catalog-page">
      <div className="container">
        <div className="catalog-header">
          <h1 className="catalog-title">Каталог</h1>
          <span className="catalog-count">{data.total} товаров</span>
        </div>

        {/* Поиск — обычная GET-форма, фильтр по категории сохраняем через hidden, страницу сбрасываем */}
        <form action="/" method="get" style={{ display: "flex", gap: 8, marginBottom: 20, maxWidth: 480 }}>
          {categoryId && <input type="hidden" name="category_id" value={categoryId} />}
          <input
            name="search"
            defaultValue={search ?? ""}
            aria-label="Поиск по каталогу"
            placeholder="Поиск по названию или артикулу…"
            className="form-input"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary" style={{ fontSize: 14 }}>Найти</button>
          {search && (
            <Link href={buildHref({ category_id: categoryId })} className="btn btn-ghost" style={{ fontSize: 14 }}>
              Сброс
            </Link>
          )}
        </form>

        {categories.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
            <Link href={buildHref({ search })} style={chipStyle(!categoryId)}>Все</Link>
            {categories.map(cat => (
              <Link key={cat.id} href={buildHref({ category_id: cat.id, search })} style={chipStyle(categoryId === cat.id)}>
                {cat.name}
              </Link>
            ))}
          </div>
        )}

        {data.items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <p className="empty-state-title">Товары не найдены</p>
            <p className="empty-state-body">
              {search ? `По запросу «${search}» ничего не нашлось` : "Каталог пока пустой — синхронизация ещё не запускалась"}
            </p>
          </div>
        ) : (
          <>
            <div className="product-grid">
              {data.items.map((product) => (
                <Link key={product.id} href={`/products/${product.id}`} style={{ textDecoration: "none" }}>
                  <div className="product-card">
                    <div className="product-card-image" style={{ position: "relative", overflow: "hidden", background: "var(--surface)" }}>
                      {product.image_url ? (
                        <img
                          src={`/api/v1/products/${product.id}/image`}
                          alt={product.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>
                          🛍
                        </span>
                      )}
                    </div>
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

            {data.pages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 36 }}>
                {page > 1 ? (
                  <Link href={buildHref({ category_id: categoryId, search, page: page - 1 })} className="btn btn-ghost" style={{ fontSize: 14 }}>
                    ← Назад
                  </Link>
                ) : (
                  <span className="btn btn-ghost" style={{ fontSize: 14, opacity: 0.4, pointerEvents: "none" }}>← Назад</span>
                )}
                <span style={{ fontSize: 14, color: "var(--ink-secondary)" }}>Страница {page} из {data.pages}</span>
                {page < data.pages ? (
                  <Link href={buildHref({ category_id: categoryId, search, page: page + 1 })} className="btn btn-ghost" style={{ fontSize: 14 }}>
                    Вперёд →
                  </Link>
                ) : (
                  <span className="btn btn-ghost" style={{ fontSize: 14, opacity: 0.4, pointerEvents: "none" }}>Вперёд →</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
