export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PromoListing from "@/components/PromoListing";
import { getPromoCategory } from "@/lib/api";

export const metadata: Metadata = { title: "Спецпредложения" };

export default async function SpecialPage({ searchParams }: {
  searchParams: Promise<{ view?: string; sort?: string; photo?: string; search?: string }>;
}) {
  const params = await searchParams;
  const category = await getPromoCategory("special");
  if (!category) notFound();
  return (
    <PromoListing
      basePath="/special"
      title={category.title}
      subtitle={category.subtitle ?? "Выгодные цены на отобранные товары."}
      category={category}
      defaultSort="name"
      params={params}
    />
  );
}
