"use client";

import { useState } from "react";
import NoPhoto from "@/components/NoPhoto";

// Галерея фото товара на карточке: большое фото + миниатюры (если фото несколько).
export default function ProductGallery({ productId, images, name }: {
  productId: string;
  images: string[];
  name: string;
}) {
  const [active, setActive] = useState(0);

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
        <img src={`/api/v1/products/${productId}/image?n=${active}`} alt={name} />
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
              <img src={`/api/v1/products/${productId}/image?n=${i}`} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
