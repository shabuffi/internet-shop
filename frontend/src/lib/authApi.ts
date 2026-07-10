// Клиентские обёртки авторизации покупателя. Токен — в httpOnly-куке (ставит бэкенд),
// в localStorage НЕ храним (защита от XSS): кука едет сама через credentials.

import { parseApiError, type FieldErrors } from "@/lib/formErrors";

export type CustomerType = "individual" | "ip" | "ooo";

export interface UserProfile {
  id: string;
  email: string;
  phone: string;
  customer_type: CustomerType;
  customer_name: string;
  inn: string | null;
  discount_percent: string;
  created_at: string;
  is_active: boolean;
}

export interface RegisterBody {
  email: string;
  phone: string;
  customer_type: CustomerType;
  customer_name: string;
  inn?: string;
  password: string;
  consent: boolean;
}

const API = "/api/v1/auth";

export const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = {
  individual: "Физическое лицо",
  ip: "Индивидуальный предприниматель",
  ooo: "Организация (ООО)",
};

/** Ошибка API: помимо текста несёт разбор по полям (для подсветки инпутов). */
export class ApiError extends Error {
  readonly fields: FieldErrors;
  constructor(message: string, fields: FieldErrors) {
    super(message);
    this.name = "ApiError";
    this.fields = fields;
  }
}

async function postJson<T>(path: string, body: unknown, fallbackErr: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const { message, fields } = parseApiError(await res.json().catch(() => ({})), fallbackErr);
    throw new ApiError(message, fields);
  }
  return res.json();
}

export function registerUser(body: RegisterBody): Promise<UserProfile> {
  return postJson<UserProfile>("/register", body, "Не удалось зарегистрироваться");
}

export function loginUser(body: { email: string; password: string }): Promise<UserProfile> {
  return postJson<UserProfile>("/login", body, "Неверный email или пароль");
}

export function changePassword(body: { current_password: string; new_password: string }): Promise<{ message: string }> {
  return postJson<{ message: string }>("/change-password", body, "Не удалось изменить пароль");
}

// Запрос восстановления пароля — бэкенд всегда отвечает ok (не раскрывает, есть ли аккаунт).
export function forgotPassword(email: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>("/forgot", { email }, "Не удалось отправить письмо");
}

// Установка нового пароля по токену из письма (после успеха покупатель авторизован).
export function resetPassword(body: { token: string; new_password: string }): Promise<UserProfile> {
  return postJson<UserProfile>("/reset", body, "Не удалось сбросить пароль");
}

export async function logoutUser(): Promise<void> {
  await fetch(`${API}/logout`, { method: "POST", credentials: "same-origin" }).catch(() => {});
}

export async function getMe(): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${API}/me`, { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface OrderHistoryItem {
  product_name: string;
  product_article: string | null;
  price: string;
  quantity: number;
}

export interface OrderHistory {
  id: string;
  number: string;
  status: string;
  moysklad_status?: string | null;
  total_amount: string;
  items: OrderHistoryItem[];
  created_at: string;
}

// Человекочитаемые статусы заказа (бэкенд хранит коды).
export const ORDER_STATUS_LABEL: Record<string, string> = {
  new: "Новый",
  confirmed: "Подтверждён",
  shipped: "Отгружен",
  delivered: "Доставлен",
  cancelled: "Отменён",
};

// История заказов текущего покупателя (пусто, если не авторизован).
export async function getMyOrders(): Promise<OrderHistory[]> {
  try {
    const res = await fetch(`${API}/orders`, { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
