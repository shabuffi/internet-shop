export const dynamic = 'force-dynamic';

import Link from "next/link";
import { getProducts, getCategories } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import AddToCartCard from "@/components/AddToCartCard";
import { IconImage, IconSearch } from "@/components/icons";

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

// Окно из максимум 5 номеров страниц вокруг текущей.
function pageNumbers(current: number, total: number): number[] {
  const span = 2;
  let start = Math.max(1, current - span);
  const end = Math.min(total, start + span * 2);
  start = Math.max(1, end - span * 2);
  const out: number[] = [];
  for (let n = start; n <= end; n++) out.push(n);
  return out;
}

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
    <div className="page">
      {/* Hero */}
      <div className="band">
        <div className="container catalog__hero">
          <div className="eyebrow">Магазин</div>
          <h1 style={{ marginTop: "var(--s-3)" }}>Каталог</h1>
          <p>Выберите категорию или воспользуйтесь поиском — мы покажем, что есть в наличии.</p>
        </div>
      </div>

      <div className="container section" style={{ paddingTop: "var(--s-12)" }}>
        {/* Поиск — на мобильных (в шапке он скрыт) */}
        <form action="/" method="get" className="search only-mobile" style={{ width: "100%", marginBottom: "var(--s-5)" }}>
          {categoryId && <input type="hidden" name="category_id" value={categoryId} />}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
          <input name="search" defaultValue={search ?? ""} placeholder="Поиск товаров" aria-label="Поиск товаров" />
        </form>

        {/* Тулбар: фильтры + счётчик */}
        <div className="toolbar">
          <div className="filters">
            <Link href={buildHref({ search })} className={"chip " + (!categoryId ? "chip--active" : "")}>Все</Link>
            {categories.map((c) => (
              <Link key={c.id} href={buildHref({ category_id: c.id, search })}
                className={"chip " + (categoryId === c.id ? "chip--active" : "")}>
                {c.name}
              </Link>
            ))}
          </div>
          <span className="result-count">{data.total} товаров</span>
        </div>

        {data.items.length === 0 ? (
          <div className="empty">
            <div className="empty__icon"><IconSearch width="1em" height="1em" /></div>
            <h3>Ничего не найдено</h3>
            <p>{search ? `По запросу «${search}» товаров нет.` : "В этой категории пока пусто."}</p>
            <Link href="/" className="btn btn--primary">Сбросить фильтры</Link>
          </div>
        ) : (
          <>
            <div className="catalog-grid">
              {data.items.map((p) => (
                <article className="pcard" key={p.id}>
                  <Link href={`/products/${p.id}`} className="pcard__media" aria-label={p.name}>
                    <span className="pcard__badge">
                      {p.stock > 0
                        ? <span className="badge badge--stock"><span className="badge__dot" />В наличии</span>
                        : <span className="badge badge--out"><span className="badge__dot" />Нет</span>}
                    </span>
                    <div className="photo photo--portrait">
                      {p.image_url
                        ? <img src={`/api/v1/products/${p.id}/image`} alt={p.name} />
                        : <span className="photo__ph"><IconImage /></span>}
                    </div>
                  </Link>
                  <div className="pcard__body">
                    <div className="pcard__cat">{p.category?.name ?? " "}</div>
                    <Link href={`/products/${p.id}`} className="pcard__name">{p.name}</Link>
                    <div className="pcard__sku">{p.article ? `Арт. ${p.article}` : " "}</div>
                    <div className="pcard__foot">
                      <span className="price">{formatPrice(p.price)}</span>
                      <AddToCartCard product={p} />
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {data.pages > 1 && (
              <div className="pagination">
                {page > 1
                  ? <Link href={buildHref({ category_id: categoryId, search, page: page - 1 })} className="page-dot" aria-label="Назад">‹</Link>
                  : <span className="page-dot page-dot--disabled">‹</span>}
                {pageNumbers(page, data.pages).map((n) => (
                  <Link key={n} href={buildHref({ category_id: categoryId, search, page: n })}
                    className={"page-dot " + (n === page ? "page-dot--active" : "")}>{n}</Link>
                ))}
                {page < data.pages
                  ? <Link href={buildHref({ category_id: categoryId, search, page: page + 1 })} className="page-dot" aria-label="Вперёд">›</Link>
                  : <span className="page-dot page-dot--disabled">›</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
