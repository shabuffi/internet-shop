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

// Пузырь сообщения — кнопка «Чат с менеджером».
export function IconChat(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width="1em" height="1em" {...p}>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
    </svg>
  );
}

// Щит с галочкой — индикатор «Честный знак».
export function IconShield(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width="1em" height="1em" {...p}>
      <path d="M12 2.5 4.5 5.5v5.4c0 4.4 3 8.3 7.5 9.6 4.5-1.3 7.5-5.2 7.5-9.6V5.5L12 2.5z" />
      <polyline points="8.8 12 11 14.2 15.4 9.8" />
    </svg>
  );
}

// Двое людей — раздел «Покупатели».
export function IconUsers(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
      <circle cx="10" cy="8" r="3.2" />
      <path d="M20 19v-1.4a3.4 3.4 0 0 0-2.6-3.3" />
      <path d="M15.5 5.2a3.2 3.2 0 0 1 0 5.6" />
    </svg>
  );
}

// Документ с текстом — раздел «Политика».
export function IconDoc(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <polyline points="13 3 13 8 18 8" />
      <line x1="8.5" y1="13" x2="15.5" y2="13" />
      <line x1="8.5" y1="16.5" x2="15.5" y2="16.5" />
    </svg>
  );
}

// Галочка в кружке — статус «Активен».
export function IconCheckCircle(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width="1em" height="1em" {...p}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="8.5 12 11 14.5 15.5 9" />
    </svg>
  );
}

// Часы — статус «Ожидает активации».
export function IconClock(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width="1em" height="1em" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}

// Глаз — показать пароль.
export function IconEye(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width="1em" height="1em" {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Перечёркнутый глаз — скрыть пароль.
export function IconEyeOff(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width="1em" height="1em" {...p}>
      <path d="M9.9 5.1A9.5 9.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 3.8" />
      <path d="M6.2 6.2A17 17 0 0 0 2 12s3.5 7 10 7a9.5 9.5 0 0 0 4-.85" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}

// Восклицательный знак в кружке — пояснение/подсказка.
export function IconInfo(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width="1em" height="1em" {...p}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="7.5" x2="12" y2="13" />
      <line x1="12" y1="16.5" x2="12" y2="16.5" />
    </svg>
  );
}

// Корзина — удалить.
export function IconTrash(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width="1em" height="1em" {...p}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

// Карандаш — редактировать.
export function IconPencil(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width="1em" height="1em" {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

// Заливной огонёк — бейдж «Убойные цены» (мелкий, поэтому fill, а не контур).
export function IconFlame(p: SVGProps<SVGSVGElement>) {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M13.4 1.6c.3 3-1 4.7-2.6 6.2C9 9.6 7 11.2 7 14a5 5 0 0 0 10 .2c0-2-.9-3.6-2.2-4.9.3 1.2 0 2.2-.7 2.7.5-2.4-.8-4.8-2.2-6 .8-1.6.9-3.1 1.5-4.4z" />
    </svg>
  );
}
