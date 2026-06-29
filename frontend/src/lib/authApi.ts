// Клиентские обёртки авторизации покупателя. Токен — в httpOnly-куке (ставит бэкенд),
// в localStorage НЕ храним (защита от XSS): кука едет сама через credentials.

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

// FastAPI отдаёт detail строкой (наши 401/409) или массивом (ошибки валидации 422).
function extractError(data: unknown, fallback: string): string {
  const d = (data as { detail?: unknown })?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d.length) {
    const msg = (d[0] as { msg?: string })?.msg;
    if (msg) return msg.replace(/^Value error,\s*/, "");
  }
  return fallback;
}

async function postJson<T>(path: string, body: unknown, fallbackErr: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(extractError(await res.json().catch(() => ({})), fallbackErr));
  return res.json();
}

export function registerUser(body: RegisterBody): Promise<UserProfile> {
  return postJson<UserProfile>("/register", body, "Не удалось зарегистрироваться");
}

export function loginUser(body: { email: string; password: string }): Promise<UserProfile> {
  return postJson<UserProfile>("/login", body, "Неверный email или пароль");
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
