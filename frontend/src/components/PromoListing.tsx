import Link from "next/link";
import { getProducts, getCategories } from "@/lib/api";
import PromoCard from "@/components/PromoCard";
import HeaderSearch from "@/components/HeaderSearch";
import CatalogList from "@/components/CatalogList";
import CartBar from "@/components/CartBar";
import SortSelect from "@/components/SortSelect";

/** id категорий, чьё название содержит подстроку (регистронезависимо). Для источника
 *  товаров по категории (напр. «РАСПРОДАЖА»). Возвращает пусто, если совпадений нет. */
async function categoryIdsByName(namePart: string): Promise<string[]> {
  try {
    const cats = await getCategories();
    const q = namePart.toLowerCase();
    return cats.filter((c) => (c.name || "").toLowerCase().includes(q)).map((c) => c.id);
  } catch {
    return [];
  }
}

/** Общая витрина для страниц «Новинки»/«Спецпредложения»: шапка + тулбар (сортировка,
 *  «С фото», переключатель плитка/список) + сетка карточек (или список — «бланк заказа»).
 *  Пока товары — заглушки (по сортировке); при появлении поля в МойСклад сменим источник. */
export default async function PromoListing({
  basePath, title, subtitle, kind, defaultSort, params, sourceCategory,
}: {
  basePath: string;
  title: string;
  subtitle: string;
  kind: "new" | "sale";
  defaultSort: string;
  params: { view?: string; sort?: string; photo?: string };
  // Если задано — товары берём из категории с таким именем (напр. «РАСПРОДАЖА»),
  // иначе (заглушка) — просто по сортировке.
  sourceCategory?: string;
}) {
  const listView = params.view === "list";
  const sort = params.sort === "price_asc" || params.sort === "price_desc" || params.sort === "name"
    ? params.sort : defaultSort;
  const withPhoto = params.photo === "1";

  // Источник — флаги из МойСклад (доп-поля «Новинка»/«Распродажа»).
  const featured = kind === "new" ? "new" : "sale";
  const pageSize = listView ? 100 : 48;
  let data = await getProducts({ page_size: pageSize, with_photo: withPhoto || undefined, sort, featured });
  // Фолбэк, пока флагов из МойСклад мало: спец — из категории «РАСПРОДАЖА», новинки — по сортировке.
  if (data.items.length === 0) {
    if (sourceCategory) {
      const ids = await categoryIdsByName(sourceCategory);
      const categoryId = ids.length ? ids.join(",") : "__none__";
      data = await getProducts({ page_size: pageSize, with_photo: withPhoto || undefined, sort, category_id: categoryId });
    } else {
      data = await getProducts({ page_size: pageSize, with_photo: true, sort });
    }
  }
  const items = data.items;

  // Ссылка для тулбара: желаемое состояние (список? / только с фото?), сортировку сохраняем.
  const mk = (o: { list?: boolean; photo?: boolean }) => {
    const q = new URLSearchParams();
    if (o.list) q.set("view", "list");
    if (sort !== defaultSort) q.set("sort", sort);
    if (o.photo) q.set("photo", "1");
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
      {/* Поиск на телефоне — НАД заголовком раздела (как у DNS); в шапке он скрыт */}
      <div className="container search-mobile-top">
        <HeaderSearch className="search-mobile" />
      </div>
      <div className="band band--hero hero--off-mobile">
        <div className="container catalog__hero">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="container section">
        <div className="toolbar">
          <SortSelect current={sort} view={listView ? "list" : undefined} photo={withPhoto} basePath={basePath} />
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
          <p style={{ color: "var(--charcoal)" }}>Пока пусто — загляните позже.</p>
        ) : listView ? (
          <CatalogList products={items} />
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
