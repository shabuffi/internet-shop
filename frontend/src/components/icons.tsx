import type { SVGProps } from "react";

// Тонкие line-иконки в стиле «Контур» (currentColor, stroke 1.7). Заменяют эмодзи в админке.
const base: SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconOverview(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <line x1="6" y1="20" x2="6" y2="13" />
      <line x1="12" y1="20" x2="12" y2="8" />
      <line x1="18" y1="20" x2="18" y2="4" />
    </svg>
  );
}

export function IconSettings(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <line x1="5" y1="21" x2="5" y2="14" /><line x1="5" y1="10" x2="5" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="19" y1="21" x2="19" y2="16" /><line x1="19" y1="12" x2="19" y2="3" />
      <line x1="2.5" y1="14" x2="7.5" y2="14" />
      <line x1="9.5" y1="8" x2="14.5" y2="8" />
      <line x1="16.5" y1="16" x2="21.5" y2="16" />
    </svg>
  );
}

export function IconSync(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <polyline points="21 4 21 9 16 9" />
      <polyline points="3 20 3 15 8 15" />
      <path d="M4.5 9a7.5 7.5 0 0 1 12.3-2.8L21 9" />
      <path d="M3 15l4.2 2.8A7.5 7.5 0 0 0 19.5 15" />
    </svg>
  );
}

export function IconBox(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.3 7 12 12 20.7 7" />
      <line x1="12" y1="22" x2="12" y2="12" />
    </svg>
  );
}

export function IconOrders(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}

// Заглушка «нет картинки» на витрине (вместо эмодзи 🛍). Размер задаётся через font-size
// контейнера .photo__ph — поэтому по умолчанию ширина/высота 1em.
export function IconImage(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width="1em" height="1em" strokeWidth={1.5} {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.6" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

export function IconSearch(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width="1em" height="1em" {...p}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

export function IconCart(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width="1em" height="1em" {...p}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="19" cy="20" r="1.4" />
      <path d="M2 3h3l2.3 11.3a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.5L22 7H6" />
    </svg>
  );
}
