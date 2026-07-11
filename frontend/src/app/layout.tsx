import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import CartIcon from "@/components/CartIcon";
import AccountNav from "@/components/AccountNav";
import MainNav from "@/components/MainNav";
import MobileMenu from "@/components/MobileMenu";
import HeaderSearch from "@/components/HeaderSearch";
import ChatWidget from "@/components/ChatWidget";
import VkChatWidget from "@/components/VkChatWidget";
import CookieConsent from "@/components/CookieConsent";
// import RegisterNotice from "@/components/RegisterNotice"; // плашка скрыта по просьбе заказчика (см. ниже)
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";
import { getStoreInfo } from "@/lib/api";
import { chatConfigFromStore } from "@/lib/chat";

// Метаданные (включая <title> вкладки) берут название из настройки магазина —
// один источник правды с шапкой/футером. SITE_NAME — лишь фолбэк.
export async function generateMetadata(): Promise<Metadata> {
  const store = await getStoreInfo().catch(() => null);
  const name = store?.shop_name || SITE_NAME;
  // SEO-поля задаются в админке (раздел «Сайт»); пусто → текущие фолбэки.
  const title = store?.seo_title || `${name} — интернет-магазин`;
  const description = store?.seo_description || SITE_DESCRIPTION;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s — ${name}` },
    description,
    // Иконка вкладки (favicon): фирменная эмблема ТД ИНЖЕНЕР (набор из RealFaviconGenerator).
    icons: {
      icon: [
        { url: "/favicon.ico?v=4", sizes: "any" },
        { url: "/favicon.svg?v=4", type: "image/svg+xml" },
        { url: "/favicon-96x96.png?v=4", type: "image/png", sizes: "96x96" },
      ],
      apple: "/apple-touch-icon.png?v=4",
    },
    manifest: "/site.webmanifest",
    openGraph: {
      type: "website",
      siteName: name,
      title: store?.seo_og_title || title,
      description: store?.seo_og_description || description,
    },
    robots: { index: true, follow: true },
    // Подтверждение прав в Яндекс.Вебмастере / Google Search Console (мета-теги в <head>).
    // Коды вставляются в админке (раздел «Разработчик» → SEO); пусто → тег не выводится.
    verification: {
      yandex: store?.seo_yandex_verification || undefined,
      google: store?.seo_google_verification || undefined,
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await getStoreInfo().catch(() => null);
  const shopName = store?.shop_name || SITE_NAME;
  const phone = store?.contact_phone || "";
  const telHref = phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : "";
  const hasContacts = Boolean(phone || store?.contact_email || store?.contact_hours || store?.warehouse_address);
  const chat = chatConfigFromStore(store);
  const chatMode = store?.chat_mode || "button"; // off | button | vk_widget

  // Соцсети — только заполненные (порядок фиксированный).
  const socials = [
    { label: "ВКонтакте", href: store?.social_vk || "" },
    { label: "Telegram", href: store?.social_telegram || "" },
    { label: "WhatsApp", href: store?.social_whatsapp || "" },
    { label: "Instagram", href: store?.social_instagram || "" },
  ].filter((s) => s.href);

  // Цвет темы из админки — только валидный hex (защита от инъекции в <style>).
  const themeColor = /^#[0-9a-fA-F]{3,8}$/.test(store?.theme_primary || "") ? store!.theme_primary! : "";

  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Цвет темы из админки: переопределяем --accent, производные (color-mix) подхватятся */}
        {themeColor && (
          <style dangerouslySetInnerHTML={{ __html: `:root{--accent:${themeColor};}` }} />
        )}
      </head>
      <body suppressHydrationWarning>
        <CartProvider>
          <header className="header">
            <div className="container header__inner">
              <Link href="/" className="brand" aria-label={shopName}>
                {store?.has_logo
                  ? <img src="/api/v1/admin/logo" alt={shopName} style={{ height: 38, width: "auto", display: "block" }} />
                  : <img src="/logo.svg" alt={shopName} style={{ height: 40, width: "auto", display: "block" }} />}
              </Link>

              <MainNav />

              <div className="header__actions">
                <HeaderSearch className="hide-mobile" />
                <AccountNav />
                <CartIcon />
                <MobileMenu />
              </div>
            </div>
          </header>

          {/* Инфо-плашка «оформление — только зарегистрированным» СКРЫТА по просьбе заказчика
              (11.07.2026): отмена оформления у заказчиков; компонент оставлен, но не монтируется.
              Вернуть — раскомментировать импорт RegisterNotice и строку ниже. */}
          {/* <RegisterNotice /> */}

          <main className="app-main">{children}</main>

          <footer className="footer">
            <div className="container">
              <div className="footer__top">
                <div className="footer__brand">
                  <img src="/logo-white.svg" alt={shopName} className="footer__logo" />
                  <p>Оптовые поставки бытовой химии, канцтоваров, товаров для дома, сада и огорода.
                    Собственная доставка по Тверской, Московской, Смоленской, Новгородской,
                    Владимирской и Ярославской областям, отправка по всей России транспортными компаниями.</p>
                </div>

                <div className="footer__col">
                  <h4>Магазин</h4>
                  <Link href="/catalog">Каталог</Link>
                  <Link href="/cart">Корзина</Link>
                  <Link href="/offer">Политика обработки персональных данных</Link>
                </div>

                <div className="footer__col">
                  <h4>Компания</h4>
                  <Link href="/about">О компании</Link>
                  <Link href="/contacts">Контакты</Link>
                </div>

                {hasContacts && (
                  <div className="footer__col">
                    <h4>Контакты</h4>
                    {phone && <a href={telHref}>{phone}</a>}
                    {store?.contact_email && <a href={`mailto:${store.contact_email}`}>{store.contact_email}</a>}
                    {store?.warehouse_address && <span>{store.warehouse_address}</span>}
                    {store?.contact_hours && <span>{store.contact_hours}</span>}
                  </div>
                )}

                {socials.length > 0 && (
                  <div className="footer__col">
                    <h4>Мы в соцсетях</h4>
                    {socials.map((s) => (
                      <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a>
                    ))}
                  </div>
                )}
              </div>
              <div className="footer__bottom">
                <span>
                  © {new Date().getFullYear()} {store?.company_legal_name || shopName}. Все права защищены.
                  {" · "}
                  <Link href="/admin" style={{ color: "inherit", opacity: 0.55, textDecoration: "none" }}>Вход для сотрудников</Link>
                </span>
                <span>Produced by soffit</span>
              </div>
            </div>
          </footer>

          {chatMode === "vk_widget"
            ? <VkChatWidget apiId={store?.chat_vk_api_id || ""} groupId={store?.chat_vk_group_id || ""} />
            : chatMode === "button"
            ? <ChatWidget config={chat} />
            : null}

          <CookieConsent />
        </CartProvider>
      </body>
    </html>
  );
}
