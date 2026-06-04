import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import CartIcon from "@/components/CartIcon";

export const metadata: Metadata = {
  title: "Магазин",
  description: "Интернет-магазин с интеграцией МойСклад",
};

async function getShopName(): Promise<string> {
  try {
    const res = await fetch("http://backend:8000/api/v1/admin/store-info", {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      return data.shop_name || "Магазин";
    }
  } catch {}
  return "Магазин";
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const shopName = await getShopName();

  return (
    <html lang="ru">
      <body>
        <CartProvider>
          <header className="header">
            <div className="container header-inner">
              <Link href="/" className="logo">{shopName}</Link>
              <CartIcon />
            </div>
          </header>
          {children}
        </CartProvider>
      </body>
    </html>
  );
}
