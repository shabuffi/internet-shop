import Link from "next/link";
import { getProducts, getStoreInfo } from "@/lib/api";
import PromoCard from "@/components/PromoCard";
import HeaderSearch from "@/components/HeaderSearch";
import CatalogList from "@/components/CatalogList";
import CartBar from "@/components/CartBar";
import SortSelect from "@/components/SortSelect";

/** Общая витрина для страниц «Убойные цены»/«Новинки»/«Спецпредложения»: шапка + тулбар
 *  (сортировка, «С фото», переключатель плитка/список) + сетка карточек (или список —
 *  «бланк заказа»). Источник — ТОЛЬКО флаг из МойСклад (kind); нет товаров — пустое состояние. */
export default async function PromoListing({
  basePath, title, subtitle, kind, defaultSort, params,
}: {
  basePath: string;
  title: string;
  subtitle: string;
  kind: "new" | "sale" | "hot";
  defaultSort: string;
  params: { view?: string; sort?: string; photo?: string; search?: string };
}) {
  const listView = params.view === "list";
  const sort = params.sort === "price_asc" || params.sort === "price_desc" || params.sort === "name"
    ? params.sort : defaultSort;
  const withPhoto = params.photo === "1";
  // Поиск ищет ВНУТРИ раздела (search + featured комбинируются на бэкенде), а не по всему каталогу.
  const search = params.search?.trim() || undefined;

  // Источник — ТОЛЬКО флаг из МойСклад («Убойные цены»/«Новинка»/«Распродажа»). kind = featured.
  // Фолбэка на категорию/сортировку больше нет: если по флагу пусто — показываем пустое
  // состояние, а не подменяем чужими товарами (иначе снятый в МС флаг «не убирал» товар с сайта).
  const featured = kind;
  const pageSize = listView ? 100 : 48;
  const data = await getProducts({ page_size: pageSize, with_photo: withPhoto || undefined, sort, featured, search });
  const items = data.items;
  // Показ остатка (для списочного вида) — «N шт.» или только «В наличии»: настройка сайта.
  const showQty = (await getStoreInfo().catch(() => null))?.show_stock_qty !== false;

  // Ссылка для тулбара: желаемое состояние (список? / только с фото?), сортировку и поиск сохраняем.
  const mk = (o: { list?: boolean; photo?: boolean }) => {
    const q = new URLSearchParams();
    if (o.list) q.set("view", "list");
    if (sort !== defaultSort) q.set("sort", sort);
    if (o.photo) q.set("photo", "1");
    if (search) q.set("search", search);
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

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

  return (
    <div className="page">
      {/* Поиск на телефоне — НАД заголовком раздела (как у DNS); в шапке он скрыт.
          action = basePath: ищем ВНУТРИ раздела, а не по всему каталогу. */}
      <div className="container search-mobile-top">
        <HeaderSearch className="search-mobile" action={basePath} />
      </div>
      <div className="band band--hero hero--off-mobile">
        <div className="container catalog__hero">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="container section section--listing">
        {search && (
          <p style={{ margin: "0 0 var(--s-4)", color: "var(--charcoal)" }}>
            По запросу «{search}» ·{" "}
            <Link href={basePath} style={{ color: "var(--accent)", textDecoration: "underline" }}>сбросить</Link>
          </p>
        )}
        <div className="toolbar">
          <SortSelect current={sort} search={search} view={listView ? "list" : undefined} photo={withPhoto} basePath={basePath} />
          <Link href={mk({ list: listView, photo: !withPhoto })}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 14px", borderRadius: 10,
              border: "1px solid " + (withPhoto ? "var(--accent)" : "color-mix(in srgb, var(--accent), #fff 55%)"),
              background: withPhoto ? "var(--accent)" : "var(--paper)", color: withPhoto ? "var(--on-accent)" : "var(--ink)",
              fontSize: 14, fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
            С фото
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-4)", marginLeft: "auto" }}>
            <div style={{ display: "inline-flex", border: "1px solid var(--hairline)", borderRadius: 8, overflow: "hidden" }}>
              <Link href={mk({ list: false, photo: withPhoto })} style={toggle(!listView)} title="Плиткой" aria-label="Плиткой">{IconGrid}</Link>
              <Link href={mk({ list: true, photo: withPhoto })} style={toggle(listView)} title="Списком (бланк заказа)" aria-label="Списком (бланк заказа)">{IconRows}</Link>
            </div>
            <span className="result-count">{data.total} товаров</span>
          </div>
        </div>

        {items.length === 0 ? (
          <p style={{ color: "var(--charcoal)" }}>
            {search ? `По запросу «${search}» в этом разделе ничего не найдено.` : "Пока пусто — загляните позже."}
          </p>
        ) : listView ? (
          <CatalogList products={items} showQty={showQty} />
        ) : (
          <div className="catalog-grid">
            {items.map((p) => <PromoCard key={p.id} p={p} kind={kind} />)}
          </div>
        )}
      </div>

      <CartBar />
    </div>
  );
}
