import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Магазин",
  description: "Интернет-магазин с интеграцией МойСклад",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <header className="header">
          <div className="container header-inner">
            <Link href="/" className="logo">Магазин</Link>
          </div>
        </header>
        <main className="container">
          {children}
        </main>
      </body>
    </html>
  );
}
