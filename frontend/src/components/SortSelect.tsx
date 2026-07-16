"use client";

import { useRouter } from "next/navigation";

// Выбор сортировки витрины. Сохраняет остальные фильтры и режим (плитка/список).
const BASE_OPTIONS = [
  { value: "name", label: "По алфавиту (А–Я)" },
  { value: "price_asc", label: "Сначала дешевле" },
  { value: "price_desc", label: "Сначала дороже" },
];
// «По категориям» — только на «Каталоге» (withCategory): на промо-страницах (новинки/спец/хот)
// нет категорий, и бэкенд там эту сортировку не понимает. Идёт первой — это дефолт «Все категории».
const CATEGORY_OPTION = { value: "category", label: "По категориям" };

// Сортировка по умолчанию: на «Каталоге» в «Все категории» без поиска — «По категориям», иначе — по
// алфавиту (в категории/поиске блоки категорий не нужны; при поиске «name» отдаёт релевантность).
// Должна совпадать с defaultSort в app/catalog/page.tsx — иначе URL и подсветка селекта разъедутся.
function defaultSort(withCategory: boolean, categoryId?: string, search?: string): string {
  return withCategory && !categoryId && !search ? "category" : "name";
}

export default function SortSelect({ current, categoryId, search, view, photo, basePath = "/catalog", withCategory = false }: {
  current?: string;
  categoryId?: string;
  search?: string;
  view?: string;
  photo?: boolean;
  basePath?: string;
  withCategory?: boolean;
}) {
  const router = useRouter();

  const options = withCategory ? [CATEGORY_OPTION, ...BASE_OPTIONS] : BASE_OPTIONS;
  const fallback = defaultSort(withCategory, categoryId, search);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const q = new URLSearchParams();
    if (categoryId) q.set("category_id", categoryId);
    if (search) q.set("search", search);
    if (view) q.set("view", view);
    if (photo) q.set("photo", "1");
    // Дефолтную сортировку в URL не пишем — она и так применится (короткий, чистый URL).
    if (e.target.value && e.target.value !== fallback) q.set("sort", e.target.value);
    const s = q.toString();
    router.push(s ? `${basePath}?${s}` : basePath);
  }

  return (
    <select
      value={current ?? fallback}
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
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
