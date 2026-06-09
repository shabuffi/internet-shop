"use client";

import { useState } from "react";
import { IconImage } from "@/components/icons";

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
        <span className="photo__ph" style={{ fontSize: 64 }}><IconImage /></span>
      </div>
    );
  }

  return (
    <div>
      <div className="photo">
        <img src={`/api/v1/products/${productId}/image?n=${active}`} alt={name} />
      </div>
      {images.length > 1 && (
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
