import type { CSSProperties } from "react";

// Единая заглушка «нет фото»: растровая картинка /no-photo-placeholder.png (public/),
// квадрат 1:1, заполняет контейнер (object-fit: cover). Ставится везде вместо иконки
// IconImage, чтобы товары без фото выглядели одинаково — как обычная карточка каталога.
// Файл кладётся в frontend/public/no-photo-placeholder.png.
export default function NoPhoto({ style }: { style?: CSSProperties }) {
  return (
    <img
      src="/no-photo-placeholder.png"
      alt=""
      aria-hidden
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...style }}
    />
  );
}
