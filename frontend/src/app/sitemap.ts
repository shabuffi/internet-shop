import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/api";
import { SITE_URL } from "@/lib/site";

// Рендер на запрос: свежий список товаров + корректный SITE_URL (домен из рантайма).
export const dynamic = "force-dynamic";

// Карта сайта для поисковиков: главная + все карточки товаров.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products: { id: string; updated_at?: string }[] = [];
  try {
    const first = await getProducts({ page: 1 });
    products.push(...first.items);
    for (let p = 2; p <= first.pages; p++) {
      const more = await getProducts({ page: p });
      products.push(...more.items);
    }
  } catch {
    // если API недоступен — отдаём хотя бы главную
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
