import type { CSSProperties } from "react";

// Единая точка отрисовки изображения категории. Не дублировать эту логику по компонентам:
// вкладка «Категории», «Топ категорий», блок «Топ категорий» на главной и любые другие
// места, где показывается категория, должны рендерить <CategoryImage />.
//
// Есть своя иконка (свойство категории) → показываем её.
// Нет иконки → НЕ универсальное фото, а нейтральная заглушка средствами интерфейса:
// монограмма (первая буква названия) в фирменном приглушённом тоне на существующем фоне
// карточки. Так карточка выглядит законченной для ЛЮБОЙ категории, а акцент остаётся на
// названии; одна и та же фотография для всех категорий не используется.

/** URL публичной отдачи иконки категории (тот же endpoint, что у логотипа/баннеров). */
function mediaUrl(icon: string): string {
  return `/api/v1/admin/media/${icon}`;
}

/** Нейтральная заглушка-монограмма. Прозрачный фон — опирается на фон контейнера
 *  (светлый градиент плитки / поверхность превью), чтобы плитки с фото и без выглядели
 *  одинаково законченными. Декоративна — скрыта от скринридеров. */
function CategoryMonogram({ name, letterSize }: { name: string; letterSize: number }) {
  const letter = (name.trim().charAt(0) || "•").toUpperCase();
  return (
    <span
      aria-hidden
      style={{
        position: "relative", zIndex: 1,
        fontFamily: "var(--font-display, inherit)", fontWeight: 700,
        fontSize: letterSize, lineHeight: 1, letterSpacing: "0.01em",
        // Приглушённый фирменный тон: синий, разбавленный графитом — не яркий, нейтральный.
        color: "color-mix(in srgb, var(--accent) 42%, var(--graphite))",
        userSelect: "none",
      }}
    >
      {letter}
    </span>
  );
}

/**
 * icon — имя файла иконки категории (свойство категории) либо null/undefined.
 * name — название категории (для монограммы-заглушки).
 * imgStyle / imgClassName — оформление <img> в конкретном месте (в блоке главной размер
 *   задаёт CSS `.cat-tile__media img`, поэтому там ничего не передаём).
 * letterSize — размер буквы заглушки под размер контейнера.
 */
export default function CategoryImage({
  icon,
  name,
  imgStyle,
  imgClassName,
  letterSize = 44,
}: {
  icon?: string | null;
  name: string;
  imgStyle?: CSSProperties;
  imgClassName?: string;
  letterSize?: number;
}) {
  if (icon) {
    return <img src={mediaUrl(icon)} alt="" className={imgClassName} style={imgStyle} />;
  }
  return <CategoryMonogram name={name} letterSize={letterSize} />;
}
