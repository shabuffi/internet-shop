export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PromoListing from "@/components/PromoListing";
import { getPromoCategory } from "@/lib/api";

export const metadata: Metadata = { title: "Новинки" };

export default async function NovinkiPage({ searchParams }: {
  searchParams: Promise<{ view?: string; sort?: string; photo?: string; search?: string }>;
}) {
  const params = await searchParams;
  const category = await getPromoCategory("novinki");
  if (!category) notFound();
  return (
    <PromoListing
      basePath="/novinki"
      title={category.title}
      subtitle={category.subtitle ?? "Свежие поступления — актуальный ассортимент со склада."}
      category={category}
      defaultSort="name"
      params={params}
    />
  );
}
