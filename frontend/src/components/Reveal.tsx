"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Обёртка для анимации появления при прокрутке: добавляет класс is-visible, когда блок
// попадает в зону видимости (IntersectionObserver). `delay` — задержка для эффекта «лесенки».
// Сама анимация описана в globals.css (.reveal / .reveal.is-visible); reduce-motion отключает её.
export default function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    // Нет IntersectionObserver — просто показываем (контент не должен оставаться скрытым).
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    // Уже в зоне видимости при загрузке (контент над сгибом, как карточки контактов) —
    // показываем сразу: на already-visible элемент observe() не всегда репортит в прод-сборке.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0, rootMargin: "0px 0px -5% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${visible ? "is-visible" : ""} ${className}`.trim()}
      style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
