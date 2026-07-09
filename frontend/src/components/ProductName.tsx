"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** Название товара в карточке.
 *  Десктоп: обычная ссылка на товар (полное имя видно, если помещается).
 *  Мобайл: имя обрезано до 2 строк; тап по имени разворачивает его белым блоком поверх
 *  (см. .pcard__name--open в globals.css) и НЕ переходит в карточку товара — для перехода
 *  есть картинка. Повторный тап или тап вне блока — сворачивает. */
export default function ProductName({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  const onClick = (e: React.MouseEvent) => {
    // Только на мобиле: тап разворачивает/сворачивает имя вместо перехода в товар.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) {
      e.preventDefault();
      setOpen((v) => !v);
    }
  };

  return (
    <Link
      ref={ref}
      href={`/products/${id}`}
      className={`pcard__name${open ? " pcard__name--open" : ""}`}
      title={name}
      onClick={onClick}
    >
      {name}
    </Link>
  );
}
