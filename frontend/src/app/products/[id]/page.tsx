export const dynamic = 'force-dynamic';

import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, getStoreInfo } from "@/lib/api";
import { formatPrice, minOrderQtyText, MIN_ORDER_QTY_LABEL } from "@/lib/format";
import AddToCartButton from "@/components/AddToCartButton";
import CartBar from "@/components/CartBar";
import BackButton from "@/components/BackButton";
import ProductGallery from "@/components/ProductGallery";
import ChestnyZnakBadge from "@/components/ChestnyZnakBadge";
import { chatConfigFromStore, buildChatUrl, isChatReady } from "@/lib/chat";
import { IconChat } from "@/components/icons";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

// Метаданные карточки товара — заголовок, описание и OG-картинка (превью при репосте
// ссылки в мессенджеры/соцсети показывает фото товара).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const product = await getProduct(id);
    const description = (product.description?.trim().slice(0, 160))
      || `${product.name} — купить с доставкой.`;
    const image = product.image_url ? `/api/v1/products/${product.id}/image` : undefined;
    return {
      title: product.name,
      description,
      openGraph: {
        type: "website",
        title: product.name,
        description,
        images: image ? [{ url: image }] : undefined,
      },
    };
  } catch {
    return { title: "Товар" };
  }
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;

  let product;
  try {
    product = await getProduct(id);
  } catch {
    notFound();
  }

  const store = await getStoreInfo().catch(() => null);
  const chat = chatConfigFromStore(store);
  // Инлайн-ссылку «Спросить менеджера» показываем только в режиме кнопки-ссылки
  // (во встроенном VK-виджете чат и так висит на странице).
  const chatUrl = (store?.chat_mode || "button") === "button" && isChatReady(chat)
    ? buildChatUrl(chat.service, chat.value) : "";
  const inStock = product.available;
  const stockLabel = product.stock > 0 ? `${product.stock} шт.` : "Нет на складе";
  // Характеристики = модификации/реквизиты из МойСклад + базовые поля товара в одной таблице.
  // Поле «минимальное количество» выносим отдельной строкой с понятным названием и показываем
  // у ВСЕХ товаров (если не задано — «—»), поэтому исключаем его из общего списка реквизитов.
  const attributes = (product.attributes?.filter((item) => item.name && item.value) ?? [])
    .filter((x) => !/минимальн.*(единиц.*отгрузк|количеств)/iu.test(x.name));
  const specs: { name: string; value: string }[] = [
    { name: MIN_ORDER_QTY_LABEL, value: minOrderQtyText(product.attributes) },
    ...attributes,
    ...(product.article ? [{ name: "Артикул", value: product.article }] : []),
    ...(product.category?.name ? [{ name: "Категория", value: product.category.name }] : []),
    { name: "Остаток на складе", value: stockLabel },
    { name: "Наличие", value: inStock ? "В наличии" : "Нет в наличии" },
    ...(store?.delivery_info ? [{ name: "Доставка", value: store.delivery_info }] : []),
  ];

  return (
    <div className="page">
      <div className="container">
        <div style={{ paddingTop: "var(--s-4)" }}>
          <BackButton fallback="/catalog" label="Назад в каталог" />
        </div>
        <div className="breadcrumb">
          <Link href="/catalog">Каталог</Link>
          {product.category && <><span>›</span><span>{product.category.name}</span></>}
          <span>›</span>
          <span style={{ color: "var(--charcoal)" }}>{product.name}</span>
        </div>

        <div className="pdp" style={{ paddingTop: "var(--s-6)", paddingBottom: "var(--s-16)" }}>
          <div className="pdp__media">
            <div className="pdp__hero">
              <ProductGallery productId={product.id} images={product.images} name={product.name} />
            </div>
          </div>

          <div className="pdp__info">
            {product.category && <div className="pdp__cat">{product.category.name}</div>}
            <h1 className="pdp__title">
              {product.chestnyZnak && <><ChestnyZnakBadge size={20} /> </>}
              {product.name}
            </h1>
            <div className="row" style={{ gap: "var(--s-4)" }}>
              {product.article && <span className="pdp__sku">Арт. {product.article}</span>}
              {inStock
                ? <span className="badge badge--stock"><span className="badge__dot" />В наличии</span>
                : <span className="badge badge--out"><span className="badge__dot" />Нет в наличии</span>}
              <span className="pdp__sku">Остаток: {stockLabel}</span>
            </div>

            <div className="pdp__price">{formatPrice(product.price)}</div>

            <AddToCartButton product={product} />

            {chatUrl && (
              <a href={chatUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: "var(--s-3)",
                  color: "var(--accent)", fontWeight: 600, fontSize: "var(--t-sm)", textDecoration: "none" }}>
                <IconChat style={{ width: 18, height: 18 }} /> {chat.label}
              </a>
            )}

            {product.description && (
              <>
                <div className="pdp__divider" />
                <section>
                  <h2 className="pdp__section-title">Описание</h2>
                  <p className="pdp__desc">{product.description}</p>
                </section>
              </>
            )}

            <div className="pdp__divider" />
            <section>
              <h2 className="pdp__section-title">Характеристики</h2>
              <div className="pdp__specs">
                {specs.map((s) => (
                  <div className="srow" key={s.name}>
                    <span>{s.name}</span>
                    <span style={{ fontWeight: 500 }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Липкая панель корзины снизу — чтобы после «В корзину» сразу было видно корзину */}
      <CartBar />
    </div>
  );
}
