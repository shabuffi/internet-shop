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


// Таймаут на серверные запросы к backend: без него зависший fetch (медленный
// бэкенд во время ночного обмена МойСклад, моргнувшая сеть) ждёт вечно. Под
// постоянным трафиком ботов такие подвисшие SSR-запросы накапливаются и в итоге
// вешают весь Next.js-сервер (healthcheck падает → nginx отдаёт 504).
const SERVER_FETCH_TIMEOUT_MS = 8000;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS),
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
  with_photo?: boolean;   // только товары с фото
}): Promise<ProductListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.page_size) query.set("page_size", String(params.page_size));
  if (params?.search) query.set("search", params.search);
  if (params?.category_id) query.set("category_id", params.category_id);
  if (params?.sort) query.set("sort", params.sort);
  if (params?.with_photo) query.set("with_photo", "1");
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
  company_legal_name: string; company_inn: string; company_ogrn: string; warehouse_address: string;
  delivery_info: string;
}

export async function getStoreInfo(): Promise<StoreInfo> {
  return apiFetch<StoreInfo>("/admin/store-info");
}
