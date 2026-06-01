export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  article: string | null;
  price: string;
  stock: number;
  is_active: boolean;
  category: Category | null;
  updated_at: string;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
