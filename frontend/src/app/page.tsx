export const dynamic = "force-dynamic";

import Link from "next/link";
import { getCategories, getProducts } from "@/lib/api";
import { CATEGORY_GROUPS, normCatName } from "@/lib/categoryGroups";
import PromoCard from "@/components/PromoCard";
import PromoCarousel from "@/components/PromoCarousel";
import DeliveryMap from "@/components/DeliveryMap";
import RegionsMarquee from "@/components/RegionsMarquee";
import Reveal from "@/components/Reveal";
import type { Product } from "@/types/product";

// Плитки категорий. `title` — ключ группы в CATEGORY_GROUPS (там список реальных категорий
// каталога). `icon` — имя файла картинки в /public/categories/<icon>.png.
const TILES = [
  { icon: "cat-chem", title: "Бытовая химия" },
  { icon: "cat-home", title: "Хозтовары" },
  { icon: "cat-garden", title: "Сад и дача" },
  { icon: "cat-toys", title: "Игрушки" },
  { icon: "cat-stationery", title: "Канцтовары" },
  { icon: "cat-shoes", title: "Обувь" },
  { icon: "cat-socks", title: "Носки" },
  { icon: "cat-hair", title: "Аксессуары для волос" },
];

// Иконки-преимущества — картинки заказчика, обработанные под белый фон (навы line-art,
// прозрачный фон). Файлы в /public/trust/<icon>.png.
const TRUST = [
  { icon: "order", big: "24/7", small: "приём заказов на сайте" },
  { icon: "pay", big: "от 5 000 ₽", small: "минимальный заказ" },
  { icon: "goods", big: "Тысячи", small: "товаров со склада" },
  { icon: "refresh", big: "Остатки", small: "обновляются ежедневно" },
];

const REGIONS = [
  "Тверская область", "Московская область", "Смоленская область",
  "Новгородская область", "Владимирская область", "Ярославская область",
];

function ArrowIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 3h13v13H1z" /><path d="M14 8h4l3 3v5h-7" />
      <circle cx="5.5" cy="18.5" r="2" /><circle cx="17.5" cy="18.5" r="2" />
    </svg>
  );
}

export default async function HomePage() {
  // Тянем категории, чтобы плитки вели в конкретный раздел каталога, а не в общий список.
  let categories: { id: string; name: string }[] = [];
  try {
    categories = await getCategories();
  } catch {
    categories = [];
  }

  // ВРЕМЕННО: «Новинки»/«Спецпредложения» наполняем товарами-заглушками (разная сортировка,
  // чтобы наборы отличались). Когда в МойСклад появятся доп. поля «Новинка»/«Спецпредложение» —
  // заменим источник на фильтр по этим полям, разметка секций останется прежней.
  let hot: Product[] = [];
  let novinki: Product[] = [];
  let special: Product[] = [];
  // «Спецпредложения» — из категории «РАСПРОДАЖА» (ищем по имени среди уже загруженных категорий).
  const saleIds = categories.filter((c) => (c.name || "").toLowerCase().includes("распродаж")).map((c) => c.id);
  try {
    // Основной источник — флаги из МойСклад (доп-поля «Убойные цены»/«Новинка»/«Распродажа»).
    const [h, n, s] = await Promise.all([
      getProducts({ page_size: 12, featured: "hot" }),
      getProducts({ page_size: 12, featured: "new" }),
      getProducts({ page_size: 12, featured: "sale" }),
    ]);
    hot = h.items;
    novinki = n.items;
    special = s.items;
    // Фолбэк, пока флаги из МойСклад ещё не приехали — чтобы секции не пустовали:
    // новинки — товары с фото, спецпредложения — из категории «РАСПРОДАЖА».
    // «Убойные цены» фолбэком НЕ наполняем — секцию показываем только при реальном флаге.
    if (novinki.length === 0) {
      novinki = (await getProducts({ page_size: 12, with_photo: true, sort: "name" })).items;
    }
    if (special.length === 0) {
      special = (await getProducts({ page_size: 12, sort: "name", category_id: saleIds.length ? saleIds.join(",") : "__none__" })).items;
    }
  } catch { /* без товаров секции просто не покажем */ }

  // Ссылка плитки → каталог, отфильтрованный сразу по группе категорий (CATEGORY_GROUPS).
  // Имена группы резолвим в реальные category_id и склеиваем через запятую (бэкенд понимает
  // список). Если ни одна категория группы не нашлась — fallback на поиск по названию плитки.
  function tileHref(title: string): string {
    // Единая нормализация имён (см. categoryGroups.normCatName) — тот же набор id, что и
    // распознаёт каталог в заголовок раздела.
    const names = new Set((CATEGORY_GROUPS[title] ?? []).map(normCatName));
    const ids = categories.filter((c) => names.has(normCatName(c.name))).map((c) => c.id);
    if (ids.length) return `/catalog?category_id=${ids.join(",")}`;
    return `/catalog?search=${encodeURIComponent(title)}`;
  }

  return (
    <div className="page">
      <section className="hero">
        <div className="container">
          <div className="hero__grid">
            <div className="hero__content">
              <h1>Хозтовары и бытовая химия <em>оптом</em> — со склада в наличии</h1>
              <p className="hero__lead">
                Тысячи позиций для дома, дачи и магазина с актуальными остатками. Приём заказов
                на сайте круглосуточно, минимальная сумма — 5 000 ₽. Удобный бланк заказа и быстрая
                отгрузка.
              </p>
              <div className="hero__actions">
                <Link href="/catalog" className="btn btn--lg btn--cta">
                  Перейти в каталог
                  <ArrowIcon />
                </Link>
                <Link href="/register" className="btn btn--lg btn--light-outline btn--pulse">
                  Регистрация
                </Link>
              </div>
              <p className="hero__note">После регистрации вы увидите свои персональные цены</p>
              {/* Текстовые пункты убраны — та же информация показана блоками ниже (полоса доверия) */}
            </div>
            <div className="mapcard hide-mobile">
              <div className="mapcard__cap">
                <TruckIcon />
                Доставка собственным транспортом
              </div>
              <div className="mapwrap">
                <DeliveryMap />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Бегущая строка регионов доставки — сразу под баннером */}
      <RegionsMarquee items={REGIONS} />

      {/* Полоса доверия */}
      <div className="band">
        <div className="container trust">
          {TRUST.map((t, i) => (
            <Reveal key={t.small} delay={i * 80}>
              <div className="trust-item">
                <span className="ic"><img src={`/trust/${t.icon}.png`} alt="" aria-hidden="true" /></span>
                <div className="trust-item__text">
                  <div className="big">{t.big}</div>
                  <div className="small">{t.small}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Убойные цены (по полю «Убойные цены» из МойСклад) — первой секцией */}
      {hot.length > 0 && (
        <div id="hot" className="container section">
          <div className="section-head">
            <h2 className="section-title section-title--caps section-title--xl">Убойные цены</h2>
            <Link href="/hot" className="see-all">Посмотреть все <ArrowIcon size={16} /></Link>
          </div>
          <PromoCarousel>
            {hot.map(p => <PromoCard key={p.id} p={p} kind="hot" compact />)}
          </PromoCarousel>
        </div>
      )}

      {/* Новинки (пока товары-заглушки, потом — по полю «Новинка» из МойСклад) */}
      {novinki.length > 0 && (
        <div id="novinki" className="container section">
          <div className="section-head">
            <h2 className="section-title section-title--caps section-title--xl">Новинки</h2>
            <Link href="/novinki" className="see-all">Посмотреть все <ArrowIcon size={16} /></Link>
          </div>
          <PromoCarousel>
            {novinki.map(p => <PromoCard key={p.id} p={p} kind="new" compact />)}
          </PromoCarousel>
        </div>
      )}

      {/* Спецпредложения (пока товары-заглушки, потом — по полю «Спецпредложение» из МойСклад) */}
      {special.length > 0 && (
        <div className="band">
          <div id="special" className="container section">
            <div className="section-head">
              <h2 className="section-title section-title--caps section-title--xl">Спецпредложения</h2>
              <Link href="/special" className="see-all">Посмотреть все <ArrowIcon size={16} /></Link>
            </div>
            <PromoCarousel>
              {special.map(p => <PromoCard key={p.id} p={p} kind="sale" compact />)}
            </PromoCarousel>
          </div>
        </div>
      )}

      {/* Категории */}
      <div className="container section section--cats">
        <div className="section-head">
          <div>
            <h2 className="section-title section-title--caps">Популярные разделы</h2>
            <p className="lead">Полный ассортимент для дома, дачи и магазина — выберите раздел и оформите заказ онлайн.</p>
          </div>
          <Link href="/catalog" className="see-all">
            Все категории
            <ArrowIcon size={16} />
          </Link>
        </div>
        <div className="cat-grid">
          {TILES.map((t, i) => (
            <Reveal key={t.icon} delay={i * 70}>
              <Link href={tileHref(t.title)} className="cat-tile">
                <span className="cat-tile__media">
                  <img src={`/categories/${t.icon}.png`} alt={t.title} />
                </span>
                <span className="cat-tile__body">
                  <span className="cat-tile__name">{t.title}</span>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>

    </div>
  );
}
