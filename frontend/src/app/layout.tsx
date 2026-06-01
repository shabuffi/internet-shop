import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Интернет-магазин",
  description: "Интернет-магазин с интеграцией МойСклад",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
