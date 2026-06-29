// Бегущая строка регионов доставки (рулетка) под баннером. Чистый CSS-маркизе:
// список дублируется дважды, трек едет на -50% по кругу (см. .marquee в globals.css).
// На наведение — пауза; при prefers-reduced-motion прокрутка отключается.
export default function RegionsMarquee({ items }: { items: string[] }) {
  const loop = [...items, ...items];
  return (
    <div className="marquee band" aria-label="Регионы доставки">
      <div className="marquee__track">
        {loop.map((r, i) => (
          <span className="region-chip" key={i} aria-hidden={i >= items.length}>
            <span className="dot" />
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}
