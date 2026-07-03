"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Информирование об использовании cookie (152-ФЗ / рекомендации РКН). Плашка снизу,
// показывается один раз: после «Принять» факт согласия хранится в localStorage.
// Не блокирует сайт (cookies технические/аналитические), это уведомление.
const STORAGE_KEY = "cookie_consent_v1";

export default function CookieConsent() {
  // На сервере и до монтирования не рендерим — иначе гидрация разойдётся
  // (localStorage доступен только в браузере).
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setShow(true);
    } catch {
      /* приватный режим без localStorage — просто не показываем повторно */
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Уведомление об использовании cookie"
      style={{
        position: "fixed",
        left: "calc(env(safe-area-inset-left, 0px) + 16px)",
        right: "calc(env(safe-area-inset-right, 0px) + 16px)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        zIndex: 60,
        maxWidth: 720,
        margin: "0 auto",
        background: "var(--canvas, #fff)",
        border: "1px solid var(--hairline-soft, #e5e7eb)",
        borderRadius: 14,
        boxShadow: "0 10px 30px rgba(0,0,0,.16)",
        padding: "16px 18px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <p style={{ margin: 0, flex: "1 1 320px", fontSize: 14, lineHeight: 1.5, color: "var(--ink-secondary, #4b5563)" }}>
        Мы используем файлы cookie, чтобы сайт работал корректно и удобно. Продолжая пользоваться сайтом,
        вы соглашаетесь с{" "}
        <Link href="/offer" className="link" target="_blank" style={{ color: "var(--accent, #003399)" }}>
          политикой обработки персональных данных
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={accept}
        style={{
          flex: "0 0 auto",
          height: 42,
          padding: "0 22px",
          borderRadius: 999,
          border: "none",
          cursor: "pointer",
          background: "var(--accent, #003399)",
          color: "#fff",
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        Принять
      </button>
    </div>
  );
}
