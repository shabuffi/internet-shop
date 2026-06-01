import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import CartIcon from "@/components/CartIcon";

export const metadata: Metadata = {
  title: "Магазин",
  description: "Интернет-магазин с интеграцией МойСклад",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <CartProvider>
          <header className="header">
            <div className="container header-inner">
              <Link href="/" className="logo">Магазин</Link>
              <CartIcon />
            </div>
          </header>
          <main className="container">
            {children}
          </main>
        </CartProvider>
      </body>
    </html>
  );
}
