import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import CartIcon from "@/components/CartIcon";
import AccountNav from "@/components/AccountNav";
import MainNav from "@/components/MainNav";
import MobileMenu from "@/components/MobileMenu";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

// Метаданные (включая <title> вкладки) берут название из настройки магазина —
// один источник правды с шапкой/футером. SITE_NAME — лишь фолбэк.
export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getStoreInfo();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${name} — интернет-магазин`, template: `%s — ${name}` },
    description: SITE_DESCRIPTION,
    // Иконка вкладки (favicon): фирменная эмблема ТД ИНЖЕНЕР (набор из RealFaviconGenerator).
    icons: {
      icon: [
        { url: "/favicon.ico?v=2", sizes: "any" },
        { url: "/favicon.svg?v=2", type: "image/svg+xml" },
        { url: "/favicon-96x96.png?v=2", type: "image/png", sizes: "96x96" },
      ],
      apple: "/apple-touch-icon.png?v=2",
    },
    manifest: "/site.webmanifest",
    openGraph: {
      type: "website",
      siteName: name,
      title: `${name} — интернет-магазин`,
      description: SITE_DESCRIPTION,
    },
    robots: { index: true, follow: true },
  };
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flex: "none" }}>
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

interface StoreInfo {
  name: string; phone: string; email: string; hours: string;
  legalName: string; address: string; logo: boolean;
}

async function getStoreInfo(): Promise<StoreInfo> {
  try {
    const res = await fetch("http://backend:8000/api/v1/admin/store-info", {
      signal: AbortSignal.timeout(8000), // рендерится на КАЖДЫЙ запрос — без таймаута зависший fetch вешает весь сайт
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const d = await res.json();
      return {
        name: d.shop_name || SITE_NAME,
        phone: d.contact_phone || "",
        email: d.contact_email || "",
        hours: d.contact_hours || "",
        legalName: d.company_legal_name || "",
        address: d.warehouse_address || "",
        logo: !!d.has_logo,
      };
    }
  } catch {}
  return { name: SITE_NAME, phone: "", email: "", hours: "", legalName: "", address: "", logo: false };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await getStoreInfo();
  const shopName = store.name;
  const telHref = store.phone ? `tel:${store.phone.replace(/[^+\d]/g, "")}` : "";
  const hasContacts = Boolean(store.phone || store.email || store.hours || store.address);

  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <CartProvider>
          <header className="header">
            <div className="container header__inner">
              <Link href="/" className="brand" aria-label={shopName}>
                {store.logo
                  ? <img src="/api/v1/admin/logo" alt={shopName} style={{ height: 38, width: "auto", display: "block" }} />
                  : <img src="/logo.svg" alt={shopName} style={{ height: 40, width: "auto", display: "block" }} />}
              </Link>

              <MainNav />

              <div className="header__actions">
                <form action="/catalog" method="get" className="search hide-mobile">
                  <SearchIcon />
                  <input name="search" placeholder="Поиск товаров" aria-label="Поиск товаров" />
                </form>
                {telHref && (
                  <a href={telHref} className="header__phone hide-mobile">{store.phone}</a>
                )}
                <AccountNav />
                <CartIcon />
                <MobileMenu phone={store.phone} />
              </div>
            </div>
          </header>

          <main className="app-main">{children}</main>

          <footer className="footer">
            <div className="container">
              <div className="footer__top">
                <div className="footer__brand">
                  <img src="/logo-white.svg" alt={shopName} className="footer__logo" />
                  <p>Оптовые поставки товаров первой необходимости: бытовая химия, канцтовары,
                    товары для дома, сад и огород. Доставка по Тверской, Московской, Смоленской,
                    Новгородской, Владимирской и Ярославской областям.</p>
                </div>

                <div className="footer__col">
                  <h4>Магазин</h4>
                  <Link href="/catalog">Каталог</Link>
                  <Link href="/cart">Корзина</Link>
                </div>

                <div className="footer__col">
                  <h4>Компания</h4>
                  <Link href="/about">О компании</Link>
                  <Link href="/contacts">Контакты</Link>
                </div>

                {hasContacts && (
                  <div className="footer__col">
                    <h4>Контакты</h4>
                    {store.phone && <a href={telHref}>{store.phone}</a>}
                    {store.email && <a href={`mailto:${store.email}`}>{store.email}</a>}
                    {store.address && <span>{store.address}</span>}
                    {store.hours && <span>{store.hours}</span>}
                  </div>
                )}
              </div>
              <div className="footer__bottom">
                <span>© {new Date().getFullYear()} {store.legalName || shopName}. Все права защищены.</span>
                <span>Produced by soffit</span>
              </div>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
