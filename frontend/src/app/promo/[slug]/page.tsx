export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PromoListing from "@/components/PromoListing";
import { getPromoCategory } from "@/lib/api";

type Params = Promise<{ slug: string }>;
type Search = Promise<{ view?: string; sort?: string; photo?: string; search?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const category = await getPromoCategory(slug);
  return { title: category?.title ?? "Раздел" };
}

/** Динамический раздел промо-категории. Неизвестный/неактивный slug → 404. Живёт под /promo/*,
 *  поэтому не перехватывает существующие top-level маршруты. */
export default async function PromoSlugPage({ params, searchParams }: {
  params: Params;
  searchParams: Search;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const category = await getPromoCategory(slug);
  if (!category) notFound();
  return (
    <PromoListing
      basePath={`/promo/${slug}`}
      title={category.title}
      subtitle={category.subtitle ?? ""}
      category={category}
      defaultSort="name"
      params={sp}
    />
  );
}
