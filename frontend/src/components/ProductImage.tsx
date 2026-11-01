"use client";

import { useEffect, useRef, useState } from "react";
import NoPhoto from "@/components/NoPhoto";

// Фото товара с аккуратной заглушкой: если картинки нет или файл не загрузился (404/битый url) —
// показываем NoPhoto вместо «сломанной» иконки браузера. Размещается внутри контейнера `.photo`.
// Проверяем и `onError`, и состояние на монтировании: при SSR картинка может «отвалиться» ещё
// до гидрации (onError тогда не сработает) — ловим это через img.complete && naturalWidth===0.
//
// saveSrc — копия «для сохранения» (с логотипами): кладётся поверх невидимым слоем, и
// «Сохранить картинку»/долгое нажатие берут её. Контейнер должен быть position: relative
// (`.photo` — да). Не загрузилась — слой не ставим.
export default function ProductImage({
  src,
  saveSrc,
  alt,
  style,
}: {
  src?: string | null;
  saveSrc?: string | null;
  alt: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (!src || failed) return <NoPhoto style={style} />;
  const img = <img ref={ref} src={src} alt={alt} style={style} onError={() => setFailed(true)} />;
  if (!saveSrc || saveFailed) return img;
  return (
    <>
      {img}
      <img className="img-save" src={saveSrc} alt={alt} decoding="async" onError={() => setSaveFailed(true)} />
    </>
  );
}
