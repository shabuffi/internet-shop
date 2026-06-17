import type { Product, ProductListResponse, Category } from "@/types/product";
import { cleanProductName, cleanCategoryName } from "@/lib/format";

// Чистим отображаемые имена в одной точке — на границе API, чтобы префиксы
// (код склада в товаре, числовой код в категории) исчезли везде: плитка, список,
// карточка товара и корзина (она сохраняет имя при добавлении). Админка ходит
// через adminFetch и видит «сырые» имена МойСклад — это намеренно.
function cleanCategory<T extends { name: string } | null>(c: T): T {
  return c ? { ...c, name: cleanCategoryName(c.name) } : c;
}
function cleanProduct(p: Product): Product {
  return { ...p, name: cleanProductName(p.name), category: cleanCategory(p.category) };
}

// Внутри Docker-сети frontend обращается к backend по имени сервиса.
// Снаружи (браузер) — через localhost:8000.
const API_BASE =
  typeof window === "undefined"
    ? "http://backend:8000/api/v1"   // server-side (SSR/RSC)
    : "/api/v1";                      // client-side (через nginx)


async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    next: { revalidate: 60 }, // кеш 60 секунд — Next.js перезапросит не чаще раза в минуту
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

export async function getProducts(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  category_id?: string;
  sort?: string;          // name | price_asc | price_desc
}): Promise<ProductListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.page_size) query.set("page_size", String(params.page_size));
  if (params?.search) query.set("search", params.search);
  if (params?.category_id) query.set("category_id", params.category_id);
  if (params?.sort) query.set("sort", params.sort);
  const qs = query.toString();
  const res = await apiFetch<ProductListResponse>(`/products${qs ? `?${qs}` : ""}`);
  return { ...res, items: res.items.map(cleanProduct) };
}

export async function getProduct(id: string): Promise<Product> {
  return cleanProduct(await apiFetch<Product>(`/products/${id}`));
}

export async function getCategories(): Promise<Category[]> {
  const cats = await apiFetch<Category[]>("/products/categories");
  return cats.map((c) => ({ ...c, name: cleanCategoryName(c.name) }));
}

export interface StoreInfo {
  shop_name: string; contact_phone: string; contact_email: string; contact_hours: string;
  delivery_info: string;
}

export async function getStoreInfo(): Promise<StoreInfo> {
  return apiFetch<StoreInfo>("/admin/store-info");
}
