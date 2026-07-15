import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/api";
import { SITE_URL } from "@/lib/site";

// ISR: карта сайта пересобирается не чаще раза в час. Раньше стоял force-dynamic —
// полный обход каталога (сотни запросов к /api/v1/products) на КАЖДЫЙ заход бота; несколько
// поисковых краулеров внахлёст исчерпывали пул соединений backend. Теперь Next кэширует
// результат и ревалидирует single-flight (только один рендер на обновление, остальные
// боты получают готовую карту мгновенно). SITE_URL берётся из окружения сборки (ARG
// SITE_URL в Dockerfile.prod → build.args в compose) — пре-рендер даёт боевой домен, не localhost.
export const revalidate = 3600;

// Карта сайта для поисковиков: главная + все карточки товаров.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products: { id: string; updated_at?: string }[] = [];
  try {
    // page_size=100 (максимум API) — прогрев кэша ~53 запроса вместо ~260 по 20.
    const first = await getProducts({ page: 1, page_size: 100 });
    products.push(...first.items);
    for (let p = 2; p <= first.pages; p++) {
      const more = await getProducts({ page: p, page_size: 100 });
      products.push(...more.items);
    }
  } catch {
    // если API недоступен (напр. на этапе сборки) — отдаём хотя бы главную
  }

  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    ...products.map((p) => ({
      url: `${SITE_URL}/products/${p.id}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
