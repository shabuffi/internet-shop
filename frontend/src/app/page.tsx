export const dynamic = "force-dynamic";

import Link from "next/link";
import { getCategories } from "@/lib/api";
import { CATEGORY_GROUPS } from "@/lib/categoryGroups";

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

const TRUST = [
  { big: "24/7", small: "приём заказов на сайте" },
  { big: "от 5 000 ₽", small: "минимальный заказ" },
  { big: "Тысячи", small: "товаров со склада" },
  { big: "Остатки", small: "обновляются ежедневно" },
];

const REGIONS = ["Тверская область", "Московская область", "Смоленская область", "Новгородская область"];

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
    const norm = (s: string) => s.trim().toLowerCase();
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
        color: "#fff",
      }}>
        <div className="container" style={{ paddingTop: "var(--s-20)", paddingBottom: "var(--s-20)" }}>
          <div style={{ maxWidth: 720 }}>
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
              <Link href="/catalog" className="btn btn--lg" style={{ background: "#fff", color: "var(--accent)" }}>
                Перейти в каталог
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Полоса доверия */}
      <div className="band">
        <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "var(--s-6)", paddingTop: "var(--s-8)", paddingBottom: "var(--s-8)" }}>
          {TRUST.map((t) => (
            <div key={t.small} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.01em", color: "var(--accent)" }}>{t.big}</div>
              <div style={{ fontSize: "var(--t-sm)", color: "var(--charcoal)", marginTop: 4 }}>{t.small}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Категории */}
      <div className="container section">
        <h2 className="section-title">Категории товаров</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--s-5)" }}>
          {TILES.map((t) => (
            <Link key={t.icon} href={tileHref(t.title)} style={{ textDecoration: "none", color: "var(--ink)",
              background: "var(--paper)", borderRadius: "var(--r-xl)", padding: "var(--s-7) var(--s-5)",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,.10), 0 2px 4px -1px rgba(0,0,0,.06)",
              display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
              gap: "var(--s-2)", transition: "transform .2s ease, box-shadow .2s ease" }}>
              {/* фикс-высота: иконки с разными пропорциями (обувь широкая, носки высокие) выравниваются */}
              <span style={{ height: 116, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "var(--s-2)" }}>
                <img src={`/categories/${t.icon}.png`} alt={t.title}
                  style={{ maxHeight: 116, maxWidth: 150, width: "auto", height: "auto", objectFit: "contain" }} />
              </span>
              <span style={{ fontWeight: 600, fontSize: "var(--t-h3)" }}>{t.title}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Доставка */}
      <div className="band">
        <div className="container section">
          <h2 className="section-title">Доставка по регионам</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--s-4)" }}>
            {REGIONS.map((r) => (
              <div key={r} style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", background: "var(--paper)",
                borderRadius: "var(--r-lg)", padding: "var(--s-4) var(--s-5)", fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--accent-2)", flex: "none" }} />
                {r}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
