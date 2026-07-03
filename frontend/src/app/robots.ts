import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Рендерим на каждый запрос (не кешируем на сборке) — иначе Sitemap-URL берёт SITE_URL
// времени билда (был http://localhost), а не рантайма (домен из .env.prod).
export const dynamic = "force-dynamic";

// robots.txt: по умолчанию пускаем поисковики в каталог, закрываем админку и API.
// Индексацию можно выключить в админке (раздел «Сайт» → SEO) — тогда закрываем весь сайт.
export default async function robots(): Promise<MetadataRoute.Robots> {
  let indexAllowed = true;
  try {
    const res = await fetch("http://backend:8000/api/v1/admin/store-info", {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 60 },
    });
    if (res.ok) indexAllowed = (await res.json()).seo_robots_index !== false;
  } catch {}

  return {
    rules: indexAllowed
      ? { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] }
      : { userAgent: "*", disallow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
