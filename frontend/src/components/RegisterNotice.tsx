"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMe } from "@/lib/authApi";

// Информационная плашка «оформление заказов — только зарегистрированным». Полоса между
// шапкой и контентом (в потоке, не перекрывает страницу). Логика ненавязчивости:
//  • показываем только неавторизованным (проверяем getMe);
//  • после закрытия прячем и запоминаем дату в localStorage;
//  • повторно НЕ показываем каждый рефреш — только спустя REMIND_AFTER_DAYS дней (мягкое
//    напоминание), а не при каждой загрузке.
const STORAGE_KEY = "register_notice_dismissed_at";
const REMIND_AFTER_DAYS = 7;

function dismissedRecently(): boolean {
  try {
    const ts = localStorage.getItem(STORAGE_KEY);
    if (!ts) return false;
    const days = (Date.now() - new Date(ts).getTime()) / 86_400_000;
    return days < REMIND_AFTER_DAYS;
  } catch {
    return false;   // приватный режим без localStorage — покажем плашку
  }
}

export default function RegisterNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // На сервере/до монтирования не рендерим (localStorage — только в браузере).
    if (dismissedRecently()) return;
    let alive = true;
    // Показываем только гостю (не вошедшему в кабинет).
    getMe().then((user) => { if (alive && !user) setShow(true); });
    return () => { alive = false; };
  }, []);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, new Date().toISOString()); } catch { /* ignore */ }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="regnotice" role="region" aria-label="Информация о регистрации">
      <div className="container regnotice__inner">
        <p className="regnotice__text">
          Вы находитесь в оптовом интернет-магазине ТД «Инженер». Чтобы получить доступ к
          оформлению заказов, пройдите{" "}
          <Link href="/register" className="regnotice__link">регистрацию</Link>. После регистрации
          для вашей организации будут доступны индивидуальные цены, персональные условия
          сотрудничества и дополнительные возможности интернет-магазина.
        </p>
        <button type="button" className="regnotice__close" onClick={dismiss} aria-label="Закрыть уведомление">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
        </button>
      </div>
    </div>
  );
}
