export const dynamic = 'force-dynamic';

import Link from "next/link";
import { getProducts, getCategories, getStoreInfo, getPromoCategories } from "@/lib/api";
import { primaryPromo } from "@/lib/promo";
import { CATEGORY_GROUPS, normCatName } from "@/lib/categoryGroups";
import type { Category, Product } from "@/types/product";
import AddToCartCard from "@/components/AddToCartCard";
import ProductStockHint from "@/components/ProductStockHint";
import ChestnyZnakBadge from "@/components/ChestnyZnakBadge";
import PromoBadge from "@/components/PromoBadge";
import ProductName from "@/components/ProductName";
import ProductPrice from "@/components/ProductPrice";
import HeaderSearch from "@/components/HeaderSearch";
import CatalogList from "@/components/CatalogList";
import CartBar from "@/components/CartBar";
import CategorySelect from "@/components/CategorySelect";
import SortSelect from "@/components/SortSelect";
import { IconSearch } from "@/components/icons";
import NoPhoto from "@/components/NoPhoto";

interface Props {
  searchParams: Promise<{ category_id?: string; search?: string; page?: string; view?: string; sort?: string; photo?: string }>;
}

// Собирает URL каталога, сохраняя фильтры, сортировку и режим (плитка/список). page>1 — только при необходимости.
function buildHref(params: { category_id?: string; search?: string; page?: number; view?: string; sort?: string; photo?: boolean }) {
  const q = new URLSearchParams();
  if (params.category_id) q.set("category_id", params.category_id);
  if (params.search) q.set("search", params.search);
  if (params.view) q.set("view", params.view);
  // Дефолт целевого контекста ссылки не пишем в URL (чистые ссылки). Та же логика, что defaultSort
  // ниже: «Все категории» без поиска → «category», иначе → «name».
  const dft = !params.category_id && !params.search ? "category" : "name";
  if (params.sort && params.sort !== dft) q.set("sort", params.sort);
  if (params.photo) q.set("photo", "1");
  if (params.page && params.page > 1) q.set("page", String(params.page));
  const s = q.toString();
  return s ? `/catalog?${s}` : "/catalog";
}

// Понятная подпись текущего фильтра по категории: одиночная категория → её имя; группа из
// нескольких category_id (плитка с главной) → имя группы из CATEGORY_GROUPS (распознаём по
// совпадению набора id). Так в заголовке каталога видно «Хозтовары», а не «Все категории».
function resolveCategoryLabel(categoryId: string | undefined, categories: Category[]): string | null {
  if (!categoryId) return null;
  const ids = categoryId.split(",").filter(Boolean);
  if (ids.length === 1) {
    return categories.find((c) => c.id === ids[0])?.name ?? null;
  }
  // Та же нормализация, что и в плитке на главной (normCatName) — иначе набор id не совпадёт.
  const byName = new Map(categories.map((c) => [normCatName(c.name), c.id]));
  const urlSet = new Set(ids);
  for (const [label, names] of Object.entries(CATEGORY_GROUPS)) {
    const gids = names.map((n) => byName.get(normCatName(n))).filter(Boolean) as string[];
    if (gids.length === urlSet.size && gids.every((id) => urlSet.has(id))) return label;
  }
  return null;
}

// Цепочка родителей выбранной категории (для хлебных крошек): [корень, …, текущая].
// Только для одиночного category_id; для групп с главной цепочки нет.
function resolveCategoryPath(categoryId: string | undefined, categories: Category[]): Category[] {
  if (!categoryId || categoryId.includes(",")) return [];
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path: Category[] = [];
  let cur = byId.get(categoryId);
  while (cur && path.length < 10) {   // ограничитель на случай цикла в данных
    path.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return path;
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

// Сколько находок из остального каталога показываем под разделителем (плиткой). Это витрина
// блока, а не вся выдача: за остальным — ссылка «Показать все результаты».
const OTHERS_PREVIEW = 12;

// «1 товар / 2 товара / 5 товаров» — русские окончания для счётчиков в тексте.
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export default async function CatalogPage({ searchParams }: Props) {
  const params = await searchParams;
  const categoryId = params.category_id;
  const search = params.search;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const view = params.view === "list" ? "list" : "grid";
  const listView = view === "list";
  // Явно выбранная сортировка (или undefined → действует дефолт). В ссылках тащим именно
  // explicitSort: дефолт в URL не пишем и не «залипаем» на нём при смене категории/сбросе поиска.
  const explicitSort =
    params.sort === "price_asc" || params.sort === "price_desc" ||
    params.sort === "name" || params.sort === "category" ? params.sort : undefined;
  // Дефолт: «Все категории» без поиска → «По категориям»; иначе — по алфавиту (в категории блоки
  // не нужны; при поиске «name» уходит в релевантность). Совпадает с defaultSort в SortSelect.
  const defaultSort = !categoryId && !search ? "category" : "name";
  const sort = explicitSort ?? defaultSort;
  const withPhoto = params.photo === "1";

  const [data, categories, store, promo] = await Promise.all([
    // В списке («бланк заказа») показываем больше товаров на странице
    getProducts({ category_id: categoryId, search, page, sort, with_photo: withPhoto, page_size: listView ? 100 : undefined }),
    getCategories(),
    getStoreInfo().catch(() => null),
    getPromoCategories().catch(() => []),
  ]);
  // Конфиг категорий для бейджа: slug → категория (название/иконка/приоритет).
  const promoBySlug = new Map(promo.map((c) => [c.slug, c]));
  // Показ остатка: «N шт.» (по умолчанию) или только «В наличии» — настройка сайта.
  const showQty = store?.show_stock_qty !== false;

  const categoryLabel = resolveCategoryLabel(categoryId, categories);
  const categoryPath = resolveCategoryPath(categoryId, categories);

  // Поиск внутри категории показываем ОДНОЙ страницей: сверху находки раздела, под
  // разделителем — остальной каталог. Покупатель не упирается в пустой экран и не теряет
  // товар только потому, что тот лежит в соседнем разделе.
  const searchedInCategory = Boolean(search && categoryId);
  // (1) В разделе нет НИЧЕГО → основной выдачей становится общая, со своей пагинацией.
  const fallback =
    searchedInCategory && data.total === 0
      ? await getProducts({ search, page, sort, with_photo: withPhoto, page_size: listView ? 100 : undefined })
      : null;
  // (2) В разделе что-то есть → на ПОСЛЕДНЕЙ его странице дополняем выдачу находками из
  // остального каталога (на промежуточных страницах это был бы один и тот же блок).
  const others =
    searchedInCategory && data.total > 0 && page >= data.pages
      ? await getProducts({ search, sort, with_photo: withPhoto, exclude_category_id: categoryId,
                            page_size: listView ? 100 : OTHERS_PREVIEW })
      : null;
  // Что показываем основной сеткой и по чему считаем пагинацию/счётчик.
  const list = fallback ?? data;
  const toggle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "center", padding: "7px 12px", textDecoration: "none",
    background: active ? "var(--accent)" : "transparent", color: active ? "var(--on-accent)" : "var(--ink-secondary)",
  });
  const IconGrid = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
  const IconRows = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3.5" y1="6" x2="3.5" y2="6" /><line x1="3.5" y1="12" x2="3.5" y2="12" /><line x1="3.5" y1="18" x2="3.5" y2="18" />
    </svg>
  );

  // Карточка товара — одна разметка для обеих сеток: «в категории» и «в других категориях».
  const renderCard = (p: Product) => {
    const badge = primaryPromo(p.promo_slugs, promoBySlug);
    return (
      <article className="pcard" key={p.id}>
        <Link href={`/products/${p.id}`} className="pcard__media" aria-label={p.name}>
          {badge && <PromoBadge category={badge} />}
          <span className="pcard__badge">
            {p.available && p.stock > 0
              ? <span className="badge badge--stock"><span className="badge__dot" />{showQty ? `${p.stock} шт.` : "В наличии"}</span>
              : p.available
              ? <span className="badge badge--stock"><span className="badge__dot" />В наличии</span>
              : <span className="badge badge--out"><span className="badge__dot" />Нет</span>}
          </span>
          <div className="photo photo--square">
            {p.image_url
              ? <img src={`/api/v1/products/${p.id}/image`} alt={p.name} />
              : <NoPhoto />}
          </div>
        </Link>
        <div className="pcard__body">
          <div className="pcard__cat">{p.category?.name ?? " "}</div>
          <div className="pcard__namewrap" style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            {p.chestnyZnak && <ChestnyZnakBadge size={15} />}
            <ProductName id={p.id} name={p.name} />
          </div>
          <div className="pcard__sku">{p.article ? `Арт. ${p.article}` : " "}</div>
          <div className="pcard__foot">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <ProductPrice p={p} />
              <ProductStockHint product={p} />
            </span>
            <AddToCartCard product={p} />
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="page">
      {/* Поиск на телефоне — НАД заголовком раздела (как у DNS); в шапке он скрыт */}
      <div className="container search-mobile-top">
        <HeaderSearch className="search-mobile" />
      </div>
      {/* Hero (фон глобальный; на телефоне — компактный заголовок без плашки) */}
      <div className="band band--hero hero--off-mobile">
        <div className="container catalog__hero">
          <h1>{categoryLabel ?? (search ? "Результаты поиска" : "Каталог товаров")}</h1>
          {categoryLabel ? (
            <p aria-label="Вы находитесь в разделе">
              {/* Хлебные крошки: путь до текущей категории, родители кликабельны */}
              <Link href="/catalog" style={{ color: "var(--accent)", textDecoration: "underline" }}>Каталог</Link>
              {categoryPath.length > 0 ? (
                categoryPath.map((c, i) => (
                  <span key={c.id}>
                    {" → "}
                    {i < categoryPath.length - 1 ? (
                      <Link href={buildHref({ category_id: c.id, view: listView ? "list" : undefined, sort: explicitSort, photo: withPhoto })}
                        style={{ color: "var(--accent)", textDecoration: "underline" }}>{c.name}</Link>
                    ) : (
                      <b>{c.name}</b>
                    )}
                  </span>
                ))
              ) : (
                <span>{" → "}<b>{categoryLabel}</b></span>
              )}
            </p>
          ) : search ? (
            <p>Показаны товары по запросу «{search}» во всех категориях.</p>
          ) : (
            <p>Тысячи товаров для дома, дачи, сада и хозяйства. Подберите нужное по категории или через поиск.</p>
          )}
        </div>
      </div>

      <div className="container section section--listing" style={{ paddingTop: "var(--s-16)" }}>
        {/* Активный поисковый фильтр — виден всегда (в т.ч. внутри категории и на телефоне),
            иначе непонятно, почему в категориях пусто. Сбрасывает только поиск. */}
        {search && (
          <div className="active-filter">
            <span>Поиск: <b>«{search}»</b></span>
            <Link className="active-filter__reset"
              href={buildHref({ category_id: categoryId, sort: explicitSort, view: listView ? "list" : undefined, photo: withPhoto })}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
              Сбросить поиск
            </Link>
          </div>
        )}
        {/* Тулбар: фильтры + сортировка + переключатель режима + счётчик */}
        <div className="toolbar">
          <CategorySelect categories={categories} current={categoryId} search={search} view={listView ? "list" : undefined} sort={explicitSort} photo={withPhoto} />
          <SortSelect current={sort} categoryId={categoryId} search={search} view={listView ? "list" : undefined} photo={withPhoto} withCategory />
          <Link href={buildHref({ category_id: categoryId, search, sort: explicitSort, view: listView ? "list" : undefined, photo: !withPhoto })}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 14px", borderRadius: 10,
              border: "1px solid " + (withPhoto ? "var(--accent)" : "color-mix(in srgb, var(--accent), #fff 55%)"),
              background: withPhoto ? "var(--accent)" : "var(--paper)", color: withPhoto ? "var(--on-accent)" : "var(--ink)",
              fontSize: 14, fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
            С фото
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-4)", marginLeft: "auto" }}>
            <div style={{ display: "inline-flex", border: "1px solid var(--hairline)", borderRadius: 8, overflow: "hidden" }}>
              <Link href={buildHref({ category_id: categoryId, search, sort: explicitSort, photo: withPhoto })} style={toggle(!listView)} title="Плиткой" aria-label="Плиткой">{IconGrid}</Link>
              <Link href={buildHref({ category_id: categoryId, search, sort: explicitSort, photo: withPhoto, view: "list" })} style={toggle(listView)} title="Списком (бланк заказа)" aria-label="Списком (бланк заказа)">{IconRows}</Link>
            </div>
            {/* Считаем то, что реально показано основной сеткой: в режиме «в разделе пусто →
                показываем весь каталог» это общая выдача, иначе — выдача раздела. */}
            <span className="result-count">{list.total} товаров</span>
          </div>
        </div>

        {list.items.length === 0 ? (
          <div className="empty">
            <div className="empty__icon"><IconSearch width="1em" height="1em" /></div>
            <h3>Ничего не найдено</h3>
            <p>
              {searchedInCategory
                ? `По запросу «${search}» нет товаров ни в этом разделе, ни в остальном каталоге.`
                : search ? `По запросу «${search}» товаров нет.` : "В этой категории пока пусто."}
            </p>
            <Link href="/catalog" className="btn btn--primary">Сбросить фильтры</Link>
          </div>
        ) : (
          <>
            {/* В разделе пусто, но по каталогу есть — вместо пустого экрана сразу показываем
                общую выдачу и объясняем, почему она общая. */}
            {fallback && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", marginBottom: "var(--s-8)",
                border: "1px solid var(--hairline)", borderRadius: 10, background: "var(--cloud)" }}>
                <IconSearch width="18" height="18" style={{ flexShrink: 0, marginTop: 2, color: "var(--accent)" }} />
                <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                  {categoryLabel ? <>В категории «{categoryLabel}»</> : "В выбранном разделе"} по запросу «{search}» ничего нет.{" "}
                  <b>Показываем {fallback.total} {plural(fallback.total, "товар", "товара", "товаров")} по всему каталогу.</b>
                </span>
              </div>
            )}

            {listView ? (
              <CatalogList products={list.items} showQty={showQty} />
            ) : (
              <div className="catalog-grid">{list.items.map(renderCard)}</div>
            )}

            {list.pages > 1 && (
              <div className="pagination">
                {page > 1
                  ? <Link href={buildHref({ category_id: categoryId, search, sort: explicitSort, photo: withPhoto, page: page - 1, view: listView ? "list" : undefined })} className="page-dot" aria-label="Назад">‹</Link>
                  : <span className="page-dot page-dot--disabled">‹</span>}
                {pageNumbers(page, list.pages).map((n) => (
                  <Link key={n} href={buildHref({ category_id: categoryId, search, sort: explicitSort, photo: withPhoto, page: n, view: listView ? "list" : undefined })}
                    className={"page-dot " + (n === page ? "page-dot--active" : "")}>{n}</Link>
                ))}
                {page < list.pages
                  ? <Link href={buildHref({ category_id: categoryId, search, sort: explicitSort, photo: withPhoto, page: page + 1, view: listView ? "list" : undefined })} className="page-dot" aria-label="Вперёд">›</Link>
                  : <span className="page-dot page-dot--disabled">›</span>}
              </div>
            )}

            {/* Разделитель + находки из остального каталога. Только когда в разделе что-то
                нашлось: если он пуст, выше уже стоит плашка и выдача и так общая. */}
            {others && others.total > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "var(--s-12) 0 var(--s-8)" }}>
                  <span style={{ flex: 1, height: 0, borderTop: "1px solid var(--hairline)" }} />
                  <span style={{ fontSize: 14, color: "var(--ink-secondary)", textAlign: "center" }}>
                    Ещё {others.total} {plural(others.total, "товар", "товара", "товаров")} по запросу «{search}» в других категориях
                  </span>
                  <span style={{ flex: 1, height: 0, borderTop: "1px solid var(--hairline)" }} />
                </div>

                {listView ? (
                  <CatalogList products={others.items} showQty={showQty} />
                ) : (
                  <div className="catalog-grid">{others.items.map(renderCard)}</div>
                )}

                {others.total > others.items.length && (
                  <div style={{ display: "flex", justifyContent: "center", marginTop: "var(--s-8)" }}>
                    <Link className="btn btn--primary"
                      href={buildHref({ search, sort: explicitSort, view: listView ? "list" : undefined, photo: withPhoto })}>
                      Показать все результаты по запросу «{search}»
                    </Link>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Липкая панель корзины (бланк заказа) — общая для «Плитки» и «Списка» */}
      <CartBar />
    </div>
  );
}
