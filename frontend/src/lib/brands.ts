// Логотипы брендов для слайдера на главной. Хранятся в настройках сайта (админка →
// «Настройка сайта» → Бренды) как JSON-массив {id, image}. image — имя файла в медиа-
// хранилище; отдаётся по /api/v1/admin/media/<image>.

export interface Brand {
  id: string;
  image: string;   // имя файла логотипа в медиа-хранилище
}

/** URL отдачи логотипа бренда по имени файла. */
export function brandImageUrl(image: string): string {
  return `/api/v1/admin/media/${image}`;
}

/** Разбирает JSON из настроек в список брендов. Пустой/некорректный ввод → []. */
export function parseBrands(json: string | undefined | null): Brand[] {
  if (!json || !json.trim()) return [];
  try {
    const data = JSON.parse(json);
    if (Array.isArray(data)) {
      return data
        .filter((b) => b && typeof b.image === "string" && b.image)
        .map((b, i) => ({ id: String(b.id ?? i), image: String(b.image) }));
    }
  } catch { /* невалидный JSON */ }
  return [];
}
