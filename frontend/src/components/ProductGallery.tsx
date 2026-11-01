"use client";

import { useEffect, useRef, useState } from "react";
import NoPhoto from "@/components/NoPhoto";
import { productImageUrl } from "@/lib/productImage";
import SaveLayer from "@/components/SaveLayer";

// Галерея фото товара на карточке: большое фото + миниатюры (если фото несколько).
export default function ProductGallery({ productId, images, name }: {
  productId: string;
  images: string[];
  name: string;
}) {
  const [active, setActive] = useState(0);
  // Индексы фото, файл которых не загрузился — показываем заглушку вместо «сломанной» картинки.
  const [broken, setBroken] = useState<Set<number>>(new Set());
  const markBroken = (i: number) => setBroken((s) => (s.has(i) ? s : new Set(s).add(i)));
  const mainRef = useRef<HTMLImageElement>(null);
  // SSR: картинка может «отвалиться» до гидрации (onError не сработает) — проверяем на монтировании.
  useEffect(() => {
    const img = mainRef.current;
    if (img && img.complete && img.naturalWidth === 0) markBroken(active);
  }, [active]);

  if (!images || images.length === 0) {
    return (
      <div className="photo">
        <NoPhoto />
      </div>
    );
  }

  const many = images.length > 1;
  const prev = () => setActive((a) => (a - 1 + images.length) % images.length);
  const next = () => setActive((a) => (a + 1) % images.length);

  return (
    <div>
      <div className="photo">
        {broken.has(active)
          ? <NoPhoto />
          : <img ref={mainRef} src={productImageUrl(productId, "card", active)} alt={name} onError={() => markBroken(active)} />}
        {/* Невидимый слой поверх фото: та же картинка, но с крупным водяным знаком. «Сохранить
            картинку», долгое нажатие на телефоне и перетаскивание берут верхний элемент — т.е.
            сохраняется версия с логотипом, а покупатель видит фото с лёгким знаком. */}
        {!broken.has(active) && (
          <SaveLayer key={`save-${active}`} className="photo__save" src={productImageUrl(productId, "save", active)} alt={name} />
        )}
        {many && (
          <>
            <button type="button" className="gallery-arrow gallery-arrow--prev" onClick={prev} aria-label="Предыдущее фото">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button type="button" className="gallery-arrow gallery-arrow--next" onClick={next} aria-label="Следующее фото">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </>
        )}
      </div>
      {many && (
        <div className="gallery-thumbs">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Фото ${i + 1}`}
              className={"gallery-thumb" + (i === active ? " gallery-thumb--active" : "")}
            >
              {broken.has(i)
                ? <NoPhoto />
                : <>
                    <img src={productImageUrl(productId, "thumb", i)} alt="" onError={() => markBroken(i)} />
                    <SaveLayer src={productImageUrl(productId, "thumb_save", i)} />
                  </>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
