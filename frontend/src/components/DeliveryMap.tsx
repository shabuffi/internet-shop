// Схематичная карта зоны доставки для баннера главной. Не точные границы регионов, а
// наглядная схема: 6 областей доставки расставлены в правильном взаимном расположении
// (Новгородская — СЗ, Ярославская — С, Тверская — центр-СЗ, Смоленская — Ю-З,
// Московская — центр, Владимирская — В) на мягкой подложке-«суше». Метка + подпись на
// каждую область. Чистый SVG без клиентского JS; ховер — на CSS.

const REGIONS: { name: string; x: number; y: number; lx: number; ly: number; anchor: "start" | "end" | "middle" }[] = [
  { name: "Новгородская", x: 120, y: 118, lx: 112, ly: 100, anchor: "end" },
  { name: "Ярославская", x: 322, y: 120, lx: 332, ly: 104, anchor: "start" },
  { name: "Тверская", x: 205, y: 165, lx: 197, ly: 150, anchor: "end" },
  { name: "Смоленская", x: 132, y: 232, lx: 124, ly: 250, anchor: "end" },
  { name: "Московская", x: 258, y: 212, lx: 268, ly: 230, anchor: "start" },
  { name: "Владимирская", x: 348, y: 196, lx: 356, ly: 214, anchor: "start" },
];

export default function DeliveryMap() {
  return (
    <svg viewBox="15 62 430 226" role="img" aria-label="Карта зоны доставки: 6 областей"
      style={{ width: "100%", height: "auto", display: "block" }}>
      <style>{`
        .dm-pin { transition: transform .15s ease; transform-box: fill-box; transform-origin: center bottom; }
        .dm-region:hover .dm-pin { transform: scale(1.18); }
        .dm-region:hover .dm-zone { fill: rgba(0,51,153,.28); }
      `}</style>

      {/* мягкая «суша» — абстрактный силуэт центрального региона */}
      <path d="M70 150 C60 110 120 70 175 78 C220 60 300 64 350 86 C405 96 430 140 415 185
               C425 230 380 270 320 268 C270 290 190 286 150 262 C95 258 78 205 90 180 Z"
        fill="rgba(255,255,255,.10)" stroke="rgba(255,255,255,.30)" strokeWidth="1.5" />

      {/* зоны областей + метки */}
      {REGIONS.map((r) => (
        <g key={r.name} className="dm-region">
          <title>{r.name} область</title>
          {/* подсвеченная зона */}
          <ellipse className="dm-zone" cx={r.x} cy={r.y} rx="34" ry="26"
            fill="rgba(0,51,153,.16)" stroke="rgba(255,255,255,.45)" strokeWidth="1" />
          {/* метка-«булавка» */}
          <g className="dm-pin">
            <path d={`M${r.x} ${r.y + 9} C${r.x - 9} ${r.y - 3} ${r.x - 9} ${r.y - 14} ${r.x} ${r.y - 14}
                      C${r.x + 9} ${r.y - 14} ${r.x + 9} ${r.y - 3} ${r.x} ${r.y + 9} Z`}
              fill="var(--accent-2, #E02424)" />
            <circle cx={r.x} cy={r.y - 7} r="3.4" fill="#fff" />
          </g>
          {/* подпись */}
          <text x={r.lx} y={r.ly} textAnchor={r.anchor} fontSize="14" fontWeight="600"
            fill="#fff" style={{ paintOrder: "stroke", stroke: "rgba(0,30,90,.55)", strokeWidth: 3 }}>
            {r.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
