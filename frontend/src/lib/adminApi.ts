const API = "/api/v1/admin";

// Авторизация админки — через httpOnly-куку (её ставит /admin/login на бэкенде).
// Токен НЕ хранится в localStorage (защита от XSS): JS его не видит, кука едет сама.

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "same-origin", // отправлять httpOnly-куку
    cache: "no-store",
  });

  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/admin/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }

  return res.json();
}

export async function adminLogout(): Promise<void> {
  await fetch(`${API}/logout`, { method: "POST", credentials: "same-origin" }).catch(() => {});
}
