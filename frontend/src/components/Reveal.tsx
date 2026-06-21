import type { ReactNode } from "react";

// Обёртка для анимации появления. Чистый CSS (класс .reveal + @keyframes reveal-in в
// globals.css): анимация проигрывается при отрисовке, контент никогда не остаётся скрытым.
// `delay` сдвигает старт для эффекта «лесенки». reduce-motion отключает анимацию.
export default function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div className={`reveal ${className}`.trim()} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
