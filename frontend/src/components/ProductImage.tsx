"use client";

import { useEffect, useRef, useState } from "react";
import NoPhoto from "@/components/NoPhoto";

// Фото товара с аккуратной заглушкой: если картинки нет или файл не загрузился (404/битый url) —
// показываем NoPhoto вместо «сломанной» иконки браузера. Размещается внутри контейнера `.photo`.
// Проверяем и `onError`, и состояние на монтировании: при SSR картинка может «отвалиться» ещё
// до гидрации (onError тогда не сработает) — ловим это через img.complete && naturalWidth===0.
export default function ProductImage({
  src,
  alt,
  style,
}: {
  src?: string | null;
  alt: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (!src || failed) return <NoPhoto style={style} />;
  return <img ref={ref} src={src} alt={alt} style={style} onError={() => setFailed(true)} />;
}
