// Рендер политики обработки ПД из редактируемого тела (markdown-lite) + реквизитов.
// Один компонент для витрины (/offer) и для живого превью в админке — чтобы то, что
// видит администратор при наборе, совпадало с тем, что увидит покупатель.

export interface PolicyOperator {
  name: string;
  inn: string;
  ogrn: string;
  address: string;
  email: string;
  phone: string;
}

const PLACEHOLDERS: Record<keyof PolicyOperator, string> = {
  name: "{{наименование}}",
  inn: "{{инн}}",
  ogrn: "{{огрн}}",
  address: "{{адрес}}",
  email: "{{email}}",
  phone: "{{телефон}}",
};

// Заглушки на случай незаполненного реквизита — видно, что нужно дозаполнить.
const FALLBACK: Record<keyof PolicyOperator, string> = {
  name: "[наименование оператора]",
  inn: "[ИНН]",
  ogrn: "[ОГРН]",
  address: "[адрес]",
  email: "[email]",
  phone: "[телефон]",
};

export function substituteOperator(body: string, operator: PolicyOperator): string {
  let out = body;
  (Object.keys(PLACEHOLDERS) as (keyof PolicyOperator)[]).forEach((field) => {
    const value = (operator[field] || "").trim() || FALLBACK[field];
    out = out.split(PLACEHOLDERS[field]).join(value);
  });
  return out;
}

// markdown-lite: блоки разделены пустой строкой; строка «## …» — заголовок раздела,
// «# …» — заголовок страницы (обычно задаётся отдельно), остальное — абзац.
function renderBlocks(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, i) => {
      if (block.startsWith("## ")) {
        return (
          <h2 key={i} style={{ fontSize: "var(--t-h3)", fontWeight: 700, margin: "var(--s-5) 0 var(--s-2)" }}>
            {block.slice(3).trim()}
          </h2>
        );
      }
      if (block.startsWith("# ")) {
        return (
          <h2 key={i} style={{ fontSize: "var(--t-h3)", fontWeight: 700, margin: "var(--s-5) 0 var(--s-2)" }}>
            {block.slice(2).trim()}
          </h2>
        );
      }
      return (
        <p key={i} style={{ color: "var(--ink)", margin: "0 0 var(--s-3)", lineHeight: 1.65, whiteSpace: "pre-line" }}>
          {block}
        </p>
      );
    });
}

export default function PolicyView({
  body,
  operator,
  revision,
}: {
  body: string;
  operator: PolicyOperator;
  revision?: string;
}) {
  const text = substituteOperator(body, operator);
  return (
    <>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-h1)", margin: "0 0 var(--s-2)" }}>
        Политика обработки персональных данных
      </h1>
      {revision && (
        <p style={{ color: "var(--charcoal)", marginBottom: "var(--s-6)" }}>Редакция от {revision}.</p>
      )}
      {renderBlocks(text)}
    </>
  );
}
