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
  category: Category | null;
  updated_at: string;
  // Товар с обязательной маркировкой «Честный знак» (вычисляется на границе API).
  chestnyZnak?: boolean;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
