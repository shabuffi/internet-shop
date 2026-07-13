// Рендер простой инфо-страницы (Оформление заказа / Оплата) из редактируемого тела.
// markdown-lite: блоки разделены пустой строкой; «## …» — подзаголовок, остальное — абзац
// (переносы строк внутри абзаца сохраняются). Один компонент для витрины и превью в админке.

export function renderBlocks(text: string) {
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
