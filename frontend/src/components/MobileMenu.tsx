"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMe } from "@/lib/authApi";
import type { PromoCategory } from "@/types/product";
import { navLinks } from "@/lib/promo";
import HeaderSearch from "@/components/HeaderSearch";

// Бургер-меню для телефона: кнопка в шапке + выезжающая панель с навигацией.
// Промо-разделы — из конфига (пробрасывает layout), состав совпадает с десктопным меню.
// `unified` — та же настройка «единого поиска», что и в десктопной шапке (пробрасывает layout).
export default function MobileMenu({ promo, unified }: { promo?: PromoCategory[]; unified?: boolean }) {
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const path = usePathname() || "/";
  const links = navLinks(promo);

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
            {/* Поиск прямо в меню — тот же компонент, что в десктопной шапке (единая логика:
                липкое значение, крестик очистки, сохранение фильтров, единый/секционный поиск).
                Submit — обычная GET-навигация, она же закрывает меню (страница перезагружается). */}
            <div style={{ marginBottom: "var(--s-4)" }}>
              <HeaderSearch className="search--full" unified={unified} />
            </div>
            {links.map((l) => {
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
          </nav>
        </div>
      )}
    </>
  );
}
