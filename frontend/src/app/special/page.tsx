export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import PromoListing from "@/components/PromoListing";

export const metadata: Metadata = { title: "Спецпредложения" };

export default async function SpecialPage({ searchParams }: {
  searchParams: Promise<{ view?: string; sort?: string; photo?: string; search?: string }>;
}) {
  const params = await searchParams;
  return (
    <PromoListing
      basePath="/special"
      title="Спецпредложения"
      subtitle="Выгодные цены на отобранные товары."
      kind="sale"
      defaultSort="name"
      params={params}
      sourceCategory="распродаж"
    />
  );
}
