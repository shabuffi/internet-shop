"use client";

import { useRouter } from "next/navigation";

// Выбор сортировки витрины. Сохраняет остальные фильтры и режим (плитка/список).
const OPTIONS = [
  { value: "name", label: "По алфавиту (А–Я)" },
  { value: "price_asc", label: "Сначала дешевле" },
  { value: "price_desc", label: "Сначала дороже" },
];

export default function SortSelect({ current, categoryId, search, view, photo, basePath = "/catalog" }: {
  current?: string;
  categoryId?: string;
  search?: string;
  view?: string;
  photo?: boolean;
  basePath?: string;
}) {
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const q = new URLSearchParams();
    if (categoryId) q.set("category_id", categoryId);
    if (search) q.set("search", search);
    if (view) q.set("view", view);
    if (photo) q.set("photo", "1");
    if (e.target.value && e.target.value !== "name") q.set("sort", e.target.value);
    const s = q.toString();
    router.push(s ? `${basePath}?${s}` : basePath);
  }

  return (
    <select
      value={current ?? "name"}
      onChange={onChange}
      aria-label="Сортировка"
      style={{
        height: 40, padding: "0 36px 0 14px",
        border: "1px solid color-mix(in srgb, var(--accent), #fff 55%)", borderRadius: 10, background: "var(--paper)",
        color: "var(--ink)", fontSize: 14, fontWeight: 500, cursor: "pointer",
        appearance: "none", WebkitAppearance: "none",
        backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
        backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
      }}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
