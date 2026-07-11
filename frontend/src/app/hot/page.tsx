export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import PromoListing from "@/components/PromoListing";

export const metadata: Metadata = { title: "Убойные цены" };

export default async function HotPage({ searchParams }: {
  searchParams: Promise<{ view?: string; sort?: string; photo?: string; search?: string }>;
}) {
  const params = await searchParams;
  return (
    <PromoListing
      basePath="/hot"
      title="Убойные цены"
      subtitle="Самые выгодные предложения — цены, которые бьют наповал."
      kind="hot"
      defaultSort="name"
      params={params}
    />
  );
}
