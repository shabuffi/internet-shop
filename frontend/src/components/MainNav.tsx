"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Главная" },
  { href: "/catalog", label: "Каталог" },
  { href: "/about", label: "О компании" },
  { href: "/contacts", label: "Контакты" },
];

// Главное меню сайта с подсветкой активного пункта (по текущему пути).
export default function MainNav() {
  const path = usePathname() || "/";
  return (
    <nav className="nav hide-mobile">
      {LINKS.map((l) => {
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
