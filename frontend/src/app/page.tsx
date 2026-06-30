export const dynamic = "force-dynamic";

import Link from "next/link";
import { getCategories } from "@/lib/api";
import { CATEGORY_GROUPS } from "@/lib/categoryGroups";
import DeliveryMap from "@/components/DeliveryMap";
import RegionsMarquee from "@/components/RegionsMarquee";
import Reveal from "@/components/Reveal";

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
  { icon: "cat-jewelry", title: "Бижутерия" },
];

const trustIcon: Record<string, React.ReactNode> = {
  clock: (<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>),
  wallet: (<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8a2 2 0 0 1 2-2h12v4" /><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M16 13h2" /></svg>),
  box: (<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7l9-4 9 4-9 4-9-4Z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></svg>),
  refresh: (<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>),
};

const TRUST = [
  { icon: "clock", big: "24/7", small: "приём заказов на сайте" },
  { icon: "wallet", big: "от 5 000 ₽", small: "минимальный заказ" },
  { icon: "box", big: "Тысячи", small: "товаров со склада" },
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

function RefreshIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
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

  // Ссылка плитки → каталог, отфильтрованный сразу по группе категорий (CATEGORY_GROUPS).
  // Имена группы резолвим в реальные category_id и склеиваем через запятую (бэкенд понимает
  // список). Если ни одна категория группы не нашлась — fallback на поиск по названию плитки.
  function tileHref(title: string): string {
    // Устойчивая нормализация: регистр, ё→е, латиница-двойники (c→с, o→о…), затем
    // выкидываем всё кроме кириллицы/цифр. Так точки/пробелы/«C» латиницей в названиях
    // МойСклад не ломают сопоставление с группой (см. categoryGroups.ts).
    const LOOK: Record<string, string> = {
      c: "с", a: "а", e: "е", o: "о", p: "р", x: "х", y: "у", k: "к",
      m: "м", t: "т", h: "н", b: "в", n: "н",
    };
    const norm = (s: string) =>
      s.toLowerCase().replace(/ё/g, "е")
        .split("").map((ch) => LOOK[ch] ?? ch).join("")
        .replace(/[^а-я0-9]/g, "");
    const names = new Set((CATEGORY_GROUPS[title] ?? []).map(norm));
    const ids = categories.filter((c) => names.has(norm(c.name))).map((c) => c.id);
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
              <div className="hero__facts">
                <span className="hero__fact"><TruckIcon />Доставка своим транспортом</span>
                <span className="hero__fact"><RefreshIcon />Остатки обновляются ежедневно</span>
                <span className="hero__fact"><ClockIcon />Приём заказов 24/7</span>
              </div>
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
                <span className="ic">{trustIcon[t.icon]}</span>
                <div className="big">{t.big}</div>
                <div className="small">{t.small}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Категории */}
      <div className="container section">
        <div className="section-head">
          <div>
            <h2 className="section-title">Категории товаров</h2>
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
