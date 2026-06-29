"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMe } from "@/lib/authApi";

// Ссылка в шапке: «Кабинет» если вошёл, иначе «Войти». Проверяет куку через /auth/me.
export default function AccountNav() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    getMe().then((u) => setAuthed(!!u));
  }, []);

  // Пока не знаем статус — резервируем место ссылкой «Войти» (не мигаем layout'ом).
  const href = authed ? "/account" : "/login";
  const label = authed ? "Кабинет" : "Войти";

  return (
    <Link href={href} className="header__account hide-mobile" aria-label={label}>
      <AccountIcon />
      <span>{label}</span>
    </Link>
  );
}

function AccountIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
