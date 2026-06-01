import type { Product, ProductListResponse } from "@/types/product";

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
  search?: string;
  category_id?: string;
}): Promise<ProductListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.search) query.set("search", params.search);
  if (params?.category_id) query.set("category_id", params.category_id);
  const qs = query.toString();
  return apiFetch<ProductListResponse>(`/products${qs ? `?${qs}` : ""}`);
}

export async function getProduct(id: string): Promise<Product> {
  return apiFetch<Product>(`/products/${id}`);
}
