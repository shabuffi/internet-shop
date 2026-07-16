export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  depth?: number;   // уровень вложенности (0 — корень) для показа деревом
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  images: string[];
  attributes: { name: string; value: string }[] | null;
  article: string | null;
  price: string;
  stock: number;
  available: boolean;
  is_active: boolean;
  // Слаги активных промо-категорий товара (по возрастанию display_order; первый — «основной»).
  promo_slugs?: string[];
  // «Старая цена» для показа зачёркнутой (уже готова к показу; null — не показываем).
  old_price?: string | null;
  // Deprecated: выводятся из membership на переходный период — новый код использует promo_slugs.
  is_new?: boolean;
  is_sale?: boolean;
  is_hot?: boolean;
  category: Category | null;
  updated_at: string;
  // Товар с обязательной маркировкой «Честный знак» (вычисляется на границе API).
  chestnyZnak?: boolean;
}

// Промо-категория для витрины (меню, ленты главной, страницы разделов).
export interface PromoCategory {
  slug: string;
  title: string;
  subtitle: string | null;
  icon: string | null;         // имя файла в media_storage; URL — /api/v1/admin/media/<icon>
  display_order: number;
  show_in_menu: boolean;
  show_on_home: boolean;
  show_old_price: boolean;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
