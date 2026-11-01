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

/** URL публичной отдачи картинки категории (тот же endpoint, что у логотипа/баннеров).
 *  card — видимая копия; save — копия с логотипами (её же отдаёт адрес без параметра). */
function mediaUrl(icon: string, size: "card" | "save"): string {
  return `/api/v1/admin/media/${icon}?size=${size}`;
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
 * protect — поверх фото невидимый слой с копией «для сохранения» (логотипы): «Сохранить
 *   картинку»/долгое нажатие берут его. Только там, где img растянут на контейнер с
 *   position: relative (плитка главной, cover) — см. `.cat-tile img.cat-save` в globals.css.
 */
export default function CategoryImage({
  icon,
  name,
  imgStyle,
  imgClassName,
  letterSize = 44,
  protect = false,
}: {
  icon?: string | null;
  name: string;
  imgStyle?: CSSProperties;
  imgClassName?: string;
  letterSize?: number;
  protect?: boolean;
}) {
  if (icon) {
    const img = <img src={mediaUrl(icon, "card")} alt="" className={imgClassName} style={imgStyle} />;
    if (!protect) return img;
    return (
      <>
        {img}
        <img src={mediaUrl(icon, "save")} alt="" className="cat-save" decoding="async" />
      </>
    );
  }
  return <CategoryMonogram name={name} letterSize={letterSize} />;
}
