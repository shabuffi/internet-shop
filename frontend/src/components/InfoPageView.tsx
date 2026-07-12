// Рендер простой инфо-страницы (Оформление заказа / Оплата) из редактируемого тела.
// markdown-lite: блоки разделены пустой строкой; «## …» — подзаголовок, остальное — абзац
// (переносы строк внутри абзаца сохраняются). Один компонент для витрины и превью в админке.

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
      return (
        <p key={i} style={{ color: "var(--ink)", margin: "0 0 var(--s-3)", lineHeight: 1.65, whiteSpace: "pre-line" }}>
          {block}
        </p>
      );
    });
}

export default function InfoPageView({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-h1)", margin: "0 0 var(--s-4)" }}>
        {title}
      </h1>
      {renderBlocks(body)}
    </>
  );
}
