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

// То же, но ответ — простой текст (например, XML товара из истории обмена).
export async function adminFetchText(path: string): Promise<string> {
  const res = await fetch(`${API}${path}`, { credentials: "same-origin", cache: "no-store" });

  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/admin/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error("Request failed");

  return res.text();
}

// Загрузка файла (multipart). Content-Type НЕ ставим — браузер сам добавит boundary.
export async function adminUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    body: formData,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/admin/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Upload failed");
  }
  return res.json();
}

export async function adminLogout(): Promise<void> {
  await fetch(`${API}/logout`, { method: "POST", credentials: "same-origin" }).catch(() => {});
}

// Запрос к API без редиректа на /admin/login при 401 (для страницы «Разработчик»,
// у которой свой пароль). Бросает Error с текстом detail при не-2xx.
export async function devFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw Object.assign(new Error(err.detail ?? "Ошибка"), { status: res.status });
  }
  return res.json();
}

// Загрузка файла на dev-эндпоинт (multipart). Content-Type не ставим — браузер сам.
export async function devUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST", body: formData, credentials: "same-origin", cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw Object.assign(new Error(err.detail ?? "Ошибка загрузки"), { status: res.status });
  }
  return res.json();
}
