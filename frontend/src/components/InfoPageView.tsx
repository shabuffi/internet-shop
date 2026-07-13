// Рендер инфо-страницы (Оформление заказа / Оплата) из редактируемого тела в Markdown.
// Безопасно: строим только React-элементы (без dangerouslySetInnerHTML → авто-экранирование),
// ссылки — только http(s)/mailto/относительные/якорь. Один компонент для витрины и превью в админке.
// Поддержка: заголовки (#…######), **жирный**, *курсив*/_курсив_, списки (-/*/+ и 1.),
// [ссылки](url), цитаты (>), разделители (---/***/___). Один компонент для витрины и превью.
import type { ReactNode } from "react";

// Разрешаем только безопасные схемы ссылок; иначе рендерим как обычный текст.
function safeHref(url: string): string | null {
  return /^(https?:\/\/|mailto:|\/|#)/i.test(url.trim()) ? url.trim() : null;
}

// Инлайн-разметка внутри строки: ссылки, **жирный**, *курсив*/_курсив_ (рекурсивно).
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*([^*]+?)\*\*)|(\*([^*]+?)\*)|(_([^_]+?)_)/;
  let rest = text;
  let k = 0;
  while (rest) {
    const m = re.exec(rest);
    if (!m) { out.push(rest); break; }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    if (m[1]) {
      const href = safeHref(m[3]);
      out.push(href
        ? <a key={k++} href={href} target="_blank" rel="noopener noreferrer nofollow" style={{ color: "var(--accent, #003399)" }}>{m[2]}</a>
        : m[0]);
    } else if (m[4]) {
      out.push(<strong key={k++}>{renderInline(m[5])}</strong>);
    } else if (m[6]) {
      out.push(<em key={k++}>{renderInline(m[7])}</em>);
    } else {
      out.push(<em key={k++}>{renderInline(m[9])}</em>);
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

export function renderBlocks(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+$/, ""))
    .filter((block) => block.trim())
    .map((block, i) => {
      const lines = block.split("\n");

      // Разделитель: строка только из --- / *** / ___
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(block)) {
        return <hr key={i} style={{ border: 0, borderTop: "1px solid var(--hairline-soft)", margin: "var(--s-5) 0" }} />;
      }

      // Заголовок: #…###### (одна строка)
      const h = lines.length === 1 ? block.match(/^(#{1,6})\s+(.*)$/) : null;
      if (h) {
        const size = h[1].length <= 2 ? "var(--t-h3)" : "var(--t-h4, 1.05rem)";
        return (
          <h3 key={i} style={{ fontSize: size, fontWeight: 700, margin: "var(--s-5) 0 var(--s-2)" }}>
            {renderInline(h[2].trim())}
          </h3>
        );
      }

      // Цитата: все строки начинаются с >
      if (lines.every((l) => /^\s*>/.test(l))) {
        const inner = lines.map((l) => l.replace(/^\s*>\s?/, "")).join("\n");
        return (
          <blockquote key={i} style={{ margin: "0 0 var(--s-3)", padding: "var(--s-2) var(--s-4)", borderLeft: "3px solid var(--accent, #003399)", color: "var(--ink-secondary, #555)", whiteSpace: "pre-line" }}>
            {renderInline(inner)}
          </blockquote>
        );
      }

      // Нумерованный список
      if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
        return (
          <ol key={i} style={{ margin: "0 0 var(--s-3)", paddingLeft: "1.4em", color: "var(--ink)", lineHeight: 1.65 }}>
            {lines.map((l, j) => <li key={j}>{renderInline(l.replace(/^\s*\d+\.\s+/, ""))}</li>)}
          </ol>
        );
      }

      // Маркированный список
      if (lines.every((l) => /^\s*[-*+]\s+/.test(l))) {
        return (
          <ul key={i} style={{ margin: "0 0 var(--s-3)", paddingLeft: "1.4em", color: "var(--ink)", lineHeight: 1.65 }}>
            {lines.map((l, j) => <li key={j}>{renderInline(l.replace(/^\s*[-*+]\s+/, ""))}</li>)}
          </ul>
        );
      }

      // Абзац (переносы строк сохраняются)
      return (
        <p key={i} style={{ color: "var(--ink)", margin: "0 0 var(--s-3)", lineHeight: 1.65, whiteSpace: "pre-line" }}>
          {renderInline(block)}
        </p>
      );
    });
}

export default function InfoPageView({ title, body, hero = false }: { title: string; body: string; hero?: boolean }) {
  // hero=true — публичная страница: баннер с фоновой картинкой (как «О компании»/«Контакты»
  // и др. пункты меню) + тело. hero=false — инлайн (заголовок+текст), для превью в админке.
  if (hero) {
    return (
      <div className="page">
        <div className="band band--hero">
          <div className="container catalog__hero"><h1>{title}</h1></div>
        </div>
        <div className="container section prose" style={{ maxWidth: 760, lineHeight: 1.6 }}>
          {renderBlocks(body)}
        </div>
      </div>
    );
  }
  return (
    <>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-h1)", margin: "0 0 var(--s-4)" }}>
        {title}
      </h1>
      {renderBlocks(body)}
    </>
  );
}
