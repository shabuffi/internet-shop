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
      {/* Hero */}
      <section style={{
        position: "relative",
        background: "linear-gradient(105deg, rgba(0,30,90,.92) 0%, rgba(0,51,153,.86) 45%, rgba(0,51,153,.55) 100%), url('/hero.jpg') center/cover no-repeat, var(--accent-deep)",
        backgroundSize: "cover",
        color: "#fff",
        minHeight: "clamp(440px, 40vw, 600px)",
        display: "flex",
        alignItems: "center",
      }}>
        <div className="container" style={{ paddingTop: "var(--s-10)", paddingBottom: "var(--s-12)", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-8)", flexWrap: "wrap" }}>
            <div className="hero-copy" style={{ flex: "1 1 400px", minWidth: 0, paddingLeft: "var(--s-6)" }}>
              <div className="eyebrow" style={{ color: "rgba(255,255,255,.8)" }}>Оптовый поставщик</div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-display)", lineHeight: 1.07,
                letterSpacing: "-.015em", margin: "var(--s-3) 0 0", color: "#fff" }}>
                Хозтовары, бытовая химия и товары для дома и дачи — оптом
              </h1>
              <p style={{ fontSize: "var(--t-body-lg)", lineHeight: 1.6, margin: "var(--s-5) 0 0", color: "rgba(255,255,255,.9)", maxWidth: 600 }}>
                Широкий ассортимент со склада с актуальными остатками. Заказы на сайте принимаем
                круглосуточно, минимальная сумма заказа — 5 000 ₽. Удобный бланк заказа и быстрая
                отгрузка для магазинов.
              </p>
              <div style={{ display: "flex", gap: "var(--s-3)", marginTop: "var(--s-8)", flexWrap: "wrap" }}>
                <Link href="/catalog" className="btn btn--lg" style={{ background: "var(--accent-2)", color: "#fff" }}>
                  Перейти в каталог
                </Link>
              </div>
            </div>
            {/* Карта зоны доставки — вместо пустого синего пространства справа (скрыта на мобильных) */}
            <div className="hide-mobile" style={{ flex: "1.4 1 620px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--s-2)",
                color: "rgba(255,255,255,.92)", fontWeight: 600, fontSize: "var(--t-sm)",
                textTransform: "uppercase", letterSpacing: ".04em", marginBottom: "var(--s-3)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 3h13v13H1z" /><path d="M14 8h4l3 3v5h-7" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="17.5" cy="18.5" r="2" />
                </svg>
                Доставка собственным транспортом
              </div>
              <DeliveryMap />
            </div>
          </div>
        </div>
      </section>

      {/* Бегущая строка регионов доставки — сразу под баннером */}
      <RegionsMarquee items={REGIONS} />

      {/* Полоса доверия */}
      <div className="band">
        <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "var(--s-6)", paddingTop: "var(--s-12)", paddingBottom: "var(--s-12)" }}>
          {TRUST.map((t, i) => (
            <Reveal key={t.small} delay={i * 80}>
              <div className="trust-item">
                <span className="ic">{trustIcon[t.icon]}</span>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.01em", color: "var(--accent)" }}>{t.big}</div>
                <div style={{ fontSize: "var(--t-sm)", color: "var(--charcoal)" }}>{t.small}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Категории */}
      <div className="container section" style={{ paddingTop: "var(--s-16)", paddingBottom: "var(--s-16)" }}>
        <h2 className="section-title" style={{ marginBottom: "var(--s-8)" }}>Категории товаров</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "var(--s-7)" }}>
          {TILES.map((t, i) => (
            <Reveal key={t.icon} delay={i * 70}>
              <Link href={tileHref(t.title)} className="cat-tile" style={{ textDecoration: "none", color: "var(--ink)",
                background: "var(--paper)", borderRadius: "var(--r-xl)", padding: "var(--s-12) var(--s-6)",
                border: "1px solid var(--hairline)",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,.08), 0 2px 4px -1px rgba(0,0,0,.05)",
                display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
                gap: "var(--s-3)", transition: "transform .2s ease, box-shadow .2s ease" }}>
                {/* фикс-высота: иконки с разными пропорциями (обувь широкая, носки высокие) выравниваются */}
                <span style={{ height: 116, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "var(--s-2)" }}>
                  <img src={`/categories/${t.icon}.png`} alt={t.title}
                    style={{ maxHeight: 116, maxWidth: 150, width: "auto", height: "auto", objectFit: "contain" }} />
                </span>
                <span style={{ fontWeight: 600, fontSize: "var(--t-h3)" }}>{t.title}</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>

    </div>
  );
}
