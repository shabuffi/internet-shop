"use client";

import { useEffect, useRef, useState } from "react";

// Невидимый слой «для сохранения» поверх фото: та же картинка, но с логотипами. «Сохранить
// картинку», долгое нажатие на телефоне и перетаскивание берут верхний элемент — т.е. эту копию.
// Положение/прозрачность задаёт className (img-save / photo__save / cat-save в globals.css).
//
// Пока копия не загрузилась (или её нет: 404, когда копии выключены — MEDIA_VARIANTS=false),
// слой не ловит клики (pointer-events: none): правый клик/нажатие проходят к видимому фото,
// а не к пустой «битой» картинке. Загрузку проверяем и на монтировании: при SSR картинка могла
// загрузиться или упасть ещё до гидрации, и onLoad/onError тогда не сработают.
export default function SaveLayer({
  src,
  alt = "",
  className = "img-save",
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const img = ref.current;
    setReady(!!img && img.complete && img.naturalWidth > 0);
  }, [src]);

  return (
    <img ref={ref} src={src} alt={alt} className={className} decoding="async"
      style={ready ? undefined : { pointerEvents: "none" }}
      onLoad={() => setReady(true)} onError={() => setReady(false)} />
  );
}
