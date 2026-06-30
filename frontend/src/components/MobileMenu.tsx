"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMe } from "@/lib/authApi";

const LINKS = [
  { href: "/", label: "Главная" },
  { href: "/catalog", label: "Каталог" },
  { href: "/about", label: "О компании" },
  { href: "/contacts", label: "Контакты" },
];

// Бургер-меню для телефона: кнопка в шапке + выезжающая панель с навигацией.
export default function MobileMenu({ phone }: { phone?: string }) {
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const path = usePathname() || "/";
  const tel = phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : "";

  // Узнаём статус входа при первом открытии меню (на мобильной шапке ссылки «Войти» нет).
  useEffect(() => {
    if (open && authed === null) getMe().then((u) => setAuthed(!!u));
  }, [open, authed]);

  return (
    <>
      <button className="iconbtn only-mobile" aria-label="Меню" onClick={() => setOpen(true)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <div className="mmenu-backdrop" onClick={() => setOpen(false)}>
          <nav className="mmenu" onClick={(e) => e.stopPropagation()}>
            <button className="iconbtn mmenu__close" aria-label="Закрыть" onClick={() => setOpen(false)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
            {LINKS.map((l) => {
              const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
              return (
                <Link key={l.href} href={l.href} className={active ? "mmenu__link active" : "mmenu__link"} onClick={() => setOpen(false)}>
                  {l.label}
                </Link>
              );
            })}
            <Link
              href={authed ? "/account" : "/login"}
              className="btn btn--cta btn--block mmenu__account"
              onClick={() => setOpen(false)}
            >
              {authed ? "Личный кабинет" : "Войти / Регистрация"}
            </Link>
            {tel && <a href={tel} className="mmenu__phone">{phone}</a>}
          </nav>
        </div>
      )}
    </>
  );
}
