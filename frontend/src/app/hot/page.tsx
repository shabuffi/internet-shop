export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PromoListing from "@/components/PromoListing";
import { getPromoCategory } from "@/lib/api";

export const metadata: Metadata = { title: "Убойные цены" };

export default async function HotPage({ searchParams }: {
  searchParams: Promise<{ view?: string; sort?: string; photo?: string; search?: string }>;
}) {
  const params = await searchParams;
  const category = await getPromoCategory("hot");
  if (!category) notFound();
  return (
    <PromoListing
      basePath="/hot"
      title={category.title}
      subtitle={category.subtitle ?? "Самые выгодные предложения — цены, которые бьют наповал."}
      category={category}
      defaultSort="name"
      params={params}
    />
  );
}
