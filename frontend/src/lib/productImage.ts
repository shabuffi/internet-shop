// URL фото товара. Бэкенд отдаёт не оригинал (~1 MB), а уменьшенную копию без EXIF:
//   thumb — каталог, корзина, оформление, миниатюры галереи, превью в списке (500px);
//   card  — большое фото на карточке товара (1200px);
//   og    — превью ссылки в соцсетях/мессенджерах (JPEG 1200px).
// n — индекс фото в галерее (0 — первое, оно же image_url).
export type ProductImageSize = "thumb" | "card" | "og";

export function productImageUrl(id: string, size: ProductImageSize, n = 0): string {
  return `/api/v1/products/${id}/image?size=${size}${n ? `&n=${n}` : ""}`;
}
