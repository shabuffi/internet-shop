"use client";

import { useRouter } from "next/navigation";
import type { Category } from "@/types/product";

// Компактный выпадающий выбор категории (вместо длинной ленты чипов при сотнях категорий).
export default function CategorySelect({ categories, current, search, view, sort, photo }: {
  categories: Category[];
  current?: string;
  search?: string;
  view?: string;
  sort?: string;
  photo?: boolean;
}) {
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const cid = e.target.value;
    const q = new URLSearchParams();
    if (cid) q.set("category_id", cid);
    if (search) q.set("search", search);
    if (view) q.set("view", view);
    if (sort) q.set("sort", sort);
    if (photo) q.set("photo", "1");
    const s = q.toString();
    router.push(s ? `/catalog?${s}` : "/catalog");
  }

  return (
    <select
      value={current ?? ""}
      onChange={onChange}
      aria-label="Категория"
      style={{
        height: 40, maxWidth: "100%", minWidth: 220, padding: "0 36px 0 14px",
        border: "1px solid color-mix(in srgb, var(--accent), #fff 55%)", borderRadius: 10, background: "var(--paper)",
        color: "var(--ink)", fontSize: 14, fontWeight: 500, cursor: "pointer",
        appearance: "none", WebkitAppearance: "none",
        backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
        backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
      }}
    >
      <option value="">Все категории</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {(c.depth ?? 0) > 0 ? "    ".repeat(c.depth ?? 0) + "└ " : ""}{c.name}
        </option>
      ))}
    </select>
  );
}
