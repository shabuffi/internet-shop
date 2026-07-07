export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { getStoreInfo } from "@/lib/api";

export const metadata: Metadata = { title: "О компании" };

export default async function AboutPage() {
  let store;
  try { store = await getStoreInfo(); } catch { store = null; }
  const name = store?.shop_name || "Компания";

  const reqs: { label: string; value?: string }[] = [
    { label: "Юридическое наименование", value: store?.company_legal_name },
    { label: "ИНН", value: store?.company_inn },
    { label: "ОГРН / ОГРНИП", value: store?.company_ogrn },
    { label: "Адрес склада", value: store?.warehouse_address },
    { label: "Часы работы", value: store?.contact_hours },
  ].filter((r) => r.value);

  return (
    <div className="page">
      <div className="band band--hero">
        <div className="container catalog__hero">
          <h1>О компании</h1>
          <p>Оптовый поставщик товаров первой необходимости с 2016 года.</p>
        </div>
      </div>

      <div className="container section" style={{ maxWidth: 820 }}>
        <div style={{ fontSize: "var(--t-body-lg)", lineHeight: 1.7, color: "var(--charcoal)" }}>
          <p>
            <b style={{ color: "var(--ink)" }}>{name}</b> — интернет-магазин товаров для дома, дачи и
            семьи, работающий на рынке с 2016 года.
          </p>
          <p style={{ marginTop: "var(--s-4)" }}>
            С момента основания компания специализируется на оптовых поставках товаров первой
            необходимости. Мы постоянно расширяем ассортимент и предлагаем востребованные товары
            для дома, сада, дачи и повседневной жизни.
          </p>
          <p style={{ marginTop: "var(--s-4)" }}>
            Новые товары поступают на склад ежедневно. В день поступления они проходят обработку и
            публикуются на сайте, благодаря чему покупатели всегда могут первыми ознакомиться с
            актуальными новинками и доступным ассортиментом.
          </p>
          <p style={{ marginTop: "var(--s-4)" }}>
            Мы придерживаемся индивидуального подхода к каждому клиенту, стремимся обеспечить
            качественный сервис, оперативную обработку заказов и комфортные условия сотрудничества.
          </p>
          <p style={{ marginTop: "var(--s-4)" }}>
            В нашем интернет-магазине вы найдёте всё самое необходимое для дома, дачи и семьи по
            выгодным ценам.
          </p>
          <p style={{ marginTop: "var(--s-4)", fontWeight: 600, color: "var(--ink)" }}>
            Спасибо, что выбираете {name}!
          </p>
        </div>

        {reqs.length > 0 && (
          <div style={{ marginTop: "var(--s-12)" }}>
            <h2 className="section-title" style={{ fontSize: "var(--t-h3)" }}>Реквизиты</h2>
            <div style={{ display: "grid", gap: 0 }}>
              {reqs.map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-6)",
                  padding: "var(--s-4) 0", borderBottom: "1px solid var(--hairline)" }}>
                  <span style={{ color: "var(--graphite)" }}>{r.label}</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: "var(--s-12)" }}>
          <Link href="/contacts" className="btn btn--primary">Контакты и карта склада →</Link>
        </div>
      </div>
    </div>
  );
}
