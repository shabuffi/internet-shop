// Баннеры главного слайдера. Данные отделены от вёрстки: их можно задать в админке
// (dev → Настройки сайта → JSON баннеров) без правки кода. Если ничего не задано или
// JSON некорректен — показываем встроенные баннеры по умолчанию (Новинки / Акции) с
// красивыми заглушками-градиентами (картинки можно добавить позже, положив файл в public).

export interface Banner {
  id: string;
  title: string;
  subtitle?: string;
  cta?: string;    // текст кнопки
  href?: string;   // куда ведёт
  image?: string;  // путь/URL картинки (необязательно — иначе градиент-заглушка)
  from?: string;   // цвет градиента-заглушки (начало)
  to?: string;     // цвет градиента-заглушки (конец)
}

export const DEFAULT_BANNERS: Banner[] = [
  {
    id: "new", title: "Новинки", subtitle: "Свежие поступления — уже на складе",
    cta: "Смотреть каталог", href: "/catalog", image: "/banners/novinki.jpg",
    from: "#003399", to: "#3b7dd8",
  },
  {
    id: "sale", title: "Акции", subtitle: "Выгодные цены на популярные товары",
    cta: "Перейти к покупкам", href: "/catalog", image: "/banners/akcii.jpg",
    from: "#E02424", to: "#ff7a45",
  },
];

// Разбирает JSON из настроек в список баннеров. Пустой/некорректный ввод → баннеры по умолчанию.
export function parseBanners(json: string | undefined | null): Banner[] {
  if (!json || !json.trim()) return DEFAULT_BANNERS;
  try {
    const data = JSON.parse(json);
    if (Array.isArray(data) && data.length > 0) {
      return data
        .filter((b) => b && typeof b.title === "string")
        .map((b, i) => ({ id: String(b.id ?? i), ...b })) as Banner[];
    }
  } catch { /* невалидный JSON — используем дефолт */ }
  return DEFAULT_BANNERS;
}
