export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import PromoListing from "@/components/PromoListing";

export const metadata: Metadata = { title: "Новинки" };

export default async function NovinkiPage({ searchParams }: {
  searchParams: Promise<{ view?: string; sort?: string; photo?: string; search?: string }>;
}) {
  const params = await searchParams;
  return (
    <PromoListing
      basePath="/novinki"
      title="Новинки"
      subtitle="Свежие поступления — актуальный ассортимент со склада."
      kind="new"
      defaultSort="name"
      params={params}
    />
  );
}
