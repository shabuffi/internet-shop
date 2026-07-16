"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PromoCategory } from "@/types/product";
import { navLinks } from "@/lib/promo";

// Главное меню сайта с подсветкой активного пункта (по текущему пути).
// Промо-разделы приходят из конфига (пробрасывает layout), а не зашиты в код.
export default function MainNav({ promo }: { promo?: PromoCategory[] }) {
  const path = usePathname() || "/";
  const links = navLinks(promo);
  return (
    <nav className="nav hide-mobile">
      {links.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
