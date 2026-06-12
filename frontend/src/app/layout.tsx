import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import CartIcon from "@/components/CartIcon";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

// Метаданные (включая <title> вкладки) берут название из настройки магазина —
// один источник правды с шапкой/футером. SITE_NAME — лишь фолбэк.
export async function generateMetadata(): Promise<Metadata> {
  const name = await getShopName();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${name} — интернет-магазин`, template: `%s — ${name}` },
    description: SITE_DESCRIPTION,
    openGraph: {
      type: "website",
      siteName: name,
      title: `${name} — интернет-магазин`,
      description: SITE_DESCRIPTION,
    },
    robots: { index: true, follow: true },
  };
}

// Навигация и профиль — задел на будущее, пока скрыты. Включить → true.
const SHOW_SOON = false;

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flex: "none" }}>
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  );
}

async function getShopName(): Promise<string> {
  try {
    const res = await fetch("http://backend:8000/api/v1/admin/store-info", {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      return data.shop_name || SITE_NAME;
    }
  } catch {}
  return SITE_NAME;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const shopName = await getShopName();

  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=Spectral:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <CartProvider>
          <header className="header">
            <div className="container header__inner">
              <Link href="/" className="brand">{shopName}<b>.</b></Link>

              {SHOW_SOON && (
                <nav className="nav hide-mobile">
                  <Link href="/" className="active">Каталог</Link>
                  <Link href="/">Новинки</Link>
                  <Link href="/">Доставка</Link>
                  <Link href="/">О магазине</Link>
                </nav>
              )}

              <div className="header__actions">
                <form action="/" method="get" className="search hide-mobile">
                  <SearchIcon />
                  <input name="search" placeholder="Поиск товаров" aria-label="Поиск товаров" />
                </form>
                {SHOW_SOON && (
                  <button className="iconbtn hide-mobile" aria-label="Профиль"><UserIcon /></button>
                )}
                <CartIcon />
              </div>
            </div>
          </header>

          <main className="app-main">{children}</main>

          <footer className="footer">
            <div className="container">
              <div className="footer__top">
                <div className="footer__brand">
                  <span className="brand">{shopName}<b>.</b></span>
                  <p>Аккуратный интернет-магазин. Спокойный дизайн, честные цены, бережная доставка по России.</p>
                </div>

                <div className="footer__col">
                  <h4>Магазин</h4>
                  <Link href="/">Каталог</Link>
                  <Link href="/cart">Корзина</Link>
                  <Link href="/checkout">Оформление заказа</Link>
                </div>

                <div className="footer__col">
                  <h4>Покупателю</h4>
                  <a>Доставка и оплата</a>
                  <a>Возврат и обмен</a>
                  <a>Связаться с нами</a>
                </div>

                <div className="footer__col">
                  <h4>Контакты</h4>
                  <a href="tel:+79990000000">+7 (999) 000-00-00</a>
                  <a href="mailto:info@example.ru">info@example.ru</a>
                  <span>Пн–Пт · 10:00–19:00</span>
                </div>
              </div>
              <div className="footer__bottom">
                <span>© {new Date().getFullYear()} {shopName}. Все права защищены.</span>
                <span>Россия · ₽ · Русский</span>
              </div>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
