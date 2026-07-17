export const dynamic = "force-dynamic";

import Link from "next/link";
import { getTopCategories, getCategories, getProducts, getStoreInfo, getPromoCategories } from "@/lib/api";
import CategoryImage from "@/components/CategoryImage";
// [LEGACY] нужны только старому (захардкоженному) варианту блока «Топ категорий» — см. переключатель ниже.
import { CATEGORY_GROUPS, normCatName } from "@/lib/categoryGroups";
import { parseBrands } from "@/lib/brands";
import { promoPath } from "@/lib/promo";
import PromoCard from "@/components/PromoCard";
import PromoCarousel from "@/components/PromoCarousel";
import BrandsSlider from "@/components/BrandsSlider";
import DeliveryMap from "@/components/DeliveryMap";
import RegionsMarquee from "@/components/RegionsMarquee";
import Reveal from "@/components/Reveal";
import type { Product, PromoCategory } from "@/types/product";

// ─────────────────────────────────────────────────────────────────────────────
// ⚙️ ПЕРЕКЛЮЧАТЕЛЬ блока «Популярные разделы» (Топ категорий) на главной.
//
//   НОВАЯ система (true)  — 8 плиток управляются из админки (Настройка сайта → «Топ
//           категорий»); иконка — свойство категории, без иконки → монограмма.
//   СТАРОЕ поведение (false) — захардкоженные плитки TILES (иконки /public/categories/*.jpg,
//           ссылка через эвристику CATEGORY_GROUPS).
//
// Живой переключатель — КНОПКА В АДМИНКЕ (Настройка сайта → «Топ категорий»): настройка
// `top_categories_admin` в БД, приходит на главную через store-info (см. ниже). Владелец
// переключает без правок кода и передеплоя.
//
// Константа ниже — только ДЕФОЛТ на случай, когда настройка ещё не задана / store-info
// недоступен. Обе реализации ниже живут в коде и компилируются (тип boolean держит обе ветки
// достижимыми). После окончательного приёма новой системы старый путь (TILES + tileHref +
// импорт CATEGORY_GROUPS/normCatName/getCategories) и переключатель удаляются ОТДЕЛЬНОЙ задачей.
const DEFAULT_USE_ADMIN_TOP_CATEGORIES = true;

// [LEGACY / fallback] Захардкоженные плитки категорий — действуют, когда переключатель выключен (см. выше).
// `title` — ключ группы в CATEGORY_GROUPS (там список реальных категорий каталога).
// `icon` — имя файла картинки в /public/categories/<icon>.jpg.
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
  // Настройки сайта (один запрос — и для брендов, и для живого переключателя блока «Топ категорий»).
  const store = await getStoreInfo().catch(() => null);

  // Живой переключатель из админки (кнопка «Настройка сайта → Топ категорий»); если настройка
  // не задана / store-info недоступен — берём дефолт из константы.
  const useAdminTopCategories = store?.top_categories_admin ?? DEFAULT_USE_ADMIN_TOP_CATEGORIES;

  // Данные блока «Популярные разделы» — тянем ТОЛЬКО для активного варианта, без лишнего запроса.
  //
  // НОВЫЙ вариант: 8 слотов управляются из админки (Настройка сайта → «Топ категорий»).
  // Пусто или ошибка — блок просто не показываем (см. рендер ниже).
  let topCategories: Awaited<ReturnType<typeof getTopCategories>> = [];
  if (useAdminTopCategories) {
    try {
      topCategories = await getTopCategories();
    } catch {
      topCategories = [];
    }
  }

  // [LEGACY] СТАРЫЙ вариант: категории каталога, чтобы захардкоженные плитки вели в свой раздел.
  let categories: { id: string; name: string }[] = [];
  if (!useAdminTopCategories) {
    try {
      categories = await getCategories();
    } catch {
      categories = [];
    }
  }

  // Логотипы брендов для слайдера над футером (из тех же настроек сайта).
  const brands = parseBrands(store?.brands);

  // Промо-ленты на главной строятся из конфигурируемых промо-категорий (show_on_home),
  // по порядку display_order. Новые категории появляются здесь автоматически — без правок кода.
  // Пустые ленты (нет товаров по категории) не показываем.
  let homeSections: { category: PromoCategory; items: Product[] }[] = [];
  try {
    const cats = (await getPromoCategories()).filter((c) => c.show_on_home);
    const results = await Promise.all(
      cats.map((c) => getProducts({ page_size: 12, featured: c.slug })),
    );
    homeSections = cats
      .map((category, i) => ({ category, items: results[i].items }))
      .filter((s) => s.items.length > 0);
  } catch { /* без товаров секции просто не покажем */ }

  // [LEGACY] Ссылка захардкоженной плитки → каталог по группе категорий (CATEGORY_GROUPS →
  // реальные category_id, тот же набор, что распознаёт заголовок раздела в каталоге). Если ни
  // одна категория группы не нашлась — fallback на поиск по названию плитки.
  function tileHref(title: string): string {
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

      {/* Промо-ленты из конфигурируемых категорий (show_on_home), по display_order.
          Новая категория появляется здесь автоматически после включения в админке. */}
      {homeSections.map(({ category, items }) => (
        <div key={category.slug} id={category.slug} className="container section section--promo">
          <div className="section-head section-head--line">
            <h2 className="section-title section-title--caps section-title--xl section-title--line">{category.title}</h2>
            <Link href={promoPath(category.slug)} className="see-all">Посмотреть все <ArrowIcon size={16} /></Link>
          </div>
          <PromoCarousel>
            {items.map(p => <PromoCard key={p.id} p={p} category={category} compact />)}
          </PromoCarousel>
        </div>
      ))}

      {/* ═══ Популярные разделы (Топ категорий) ═══ Вариант выбирается переключателем из админки
          (top_categories_admin через store-info): true → новый (из админки), false → legacy. */}
      {useAdminTopCategories ? (
        /* НОВЫЙ: плитки из админки (Настройка сайта → «Топ категорий»). Слот ведёт в свой раздел
           каталога по category_id; иконка своя или монограмма. Не настроено — блок скрыт. */
        topCategories.length > 0 && (
        <div className="container section section--cats">
          <div className="section-head section-head--line">
            <div>
              <h2 className="section-title section-title--caps section-title--line">Популярные разделы</h2>
              <p className="lead">Полный ассортимент для дома, дачи и магазина — выберите раздел и оформите заказ онлайн.</p>
            </div>
            <Link href="/catalog" className="see-all">
              Все категории
              <ArrowIcon size={16} />
            </Link>
          </div>
          <div className="cat-grid">
            {topCategories.map((t, i) => (
              <Reveal key={t.category_id} delay={i * 70}>
                <Link href={`/catalog?category_id=${t.category_id}`} className="cat-tile">
                  {/* Тот же полнокадровый квадратный блок, что у захардкоженных плиток: загруженное
                      фото категории заполняет блок (cover). Без своей иконки — нейтральная монограмма. */}
                  <span className="cat-tile__media cat-tile__media--cover">
                    <CategoryImage icon={t.icon} name={t.name} letterSize={56} />
                  </span>
                  <span className="cat-tile__body">
                    <span className="cat-tile__name">{t.name}</span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
        )
      ) : (
        /* [LEGACY] СТАРЫЙ: захардкоженные плитки TILES (иконки /public/categories/*.jpg,
           ссылка через tileHref/CATEGORY_GROUPS). Показывается всегда. */
        <div className="container section section--cats">
          <div className="section-head section-head--line">
            <div>
              <h2 className="section-title section-title--caps section-title--line">Популярные разделы</h2>
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
                  {/* Полнокадровое фото раздела — заполняет весь медиа-блок (cover). */}
                  <span className="cat-tile__media cat-tile__media--cover">
                    <img src={`/categories/${t.icon}.jpg`} alt={t.title} />
                  </span>
                  <span className="cat-tile__body">
                    <span className="cat-tile__name">{t.title}</span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      )}

      {/* Слайдер брендов — над футером (футер в layout.tsx) */}
      <BrandsSlider brands={brands} />

    </div>
  );
}
