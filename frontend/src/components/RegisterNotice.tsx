"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMe } from "@/lib/authApi";

// Информационный баннер «оформление заказов — только зарегистрированным». Полоса между
// шапкой и контентом (в потоке, не перекрывает страницу). Логика показа:
//  • только неавторизованным (проверяем getMe);
//  • раз за ВИЗИТ — храним факт закрытия в sessionStorage: после крестика не мозолит до конца
//    визита (переходы по страницам и refresh не повторяют), а новый заход на сайт (новая сессия/
//    вкладка) снова показывает. Так «каждый вход», но не при каждом обновлении.
const STORAGE_KEY = "register_notice_dismissed";

function dismissedThisVisit(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;   // приватный режим без sessionStorage — покажем баннер
  }
}

export default function RegisterNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // На сервере/до монтирования не рендерим (sessionStorage — только в браузере).
    if (dismissedThisVisit()) return;
    let alive = true;
    // Показываем только гостю (не вошедшему в кабинет).
    getMe().then((user) => { if (alive && !user) setShow(true); });
    return () => { alive = false; };
  }, []);

  function dismiss() {
    try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setShow(false);
  }

  if (!show) return null;

  return (
    <aside className="regnotice" role="region" aria-label="Информация о регистрации">
      <div className="container regnotice__inner">
        <span className="regnotice__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16.5" /><circle cx="12" cy="7.6" r="0.6" fill="currentColor" />
          </svg>
        </span>

        <p className="regnotice__text">
          Вы находитесь в оптовом интернет-магазине ТД «Инженер». Чтобы получить доступ к
          оформлению заказов, пройдите{" "}
          <Link href="/register" className="regnotice__link">регистрацию</Link>. После регистрации
          для вашей организации будут доступны индивидуальные цены, персональные условия
          сотрудничества и дополнительные возможности интернет-магазина.
        </p>

        <Link href="/register" className="btn btn--sm regnotice__cta">Зарегистрироваться</Link>

        <button type="button" className="regnotice__close" onClick={dismiss} aria-label="Закрыть уведомление">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
        </button>
      </div>
    </aside>
  );
}
