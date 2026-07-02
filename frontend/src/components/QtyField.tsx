"use client";

import { useEffect, useState } from "react";

/**
 * Поле ввода количества внутри степпера `.qty`.
 *
 * Ключевое: во время набора разрешаем пустую строку (можно стереть цифру и напечатать
 * новую). Значение фиксируется, только когда в поле есть число; на потерю фокуса пустое
 * поле нормализуется в `min`. Кнопки −/+ живут в родителе и меняют `value` — поле
 * подхватывает его через эффект.
 */
export default function QtyField({ value, onCommit, min = 1, max = 9999, disabled }: {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      disabled={disabled}
      aria-label="Количество"
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const t = e.target.value.replace(/\D/g, "");
        if (t === "") { setText(""); return; }          // разрешаем пустое поле при вводе
        const n = Math.max(min, Math.min(max, parseInt(t, 10)));
        setText(String(n));
        onCommit(n);
      }}
      onBlur={() => {
        const n = text === "" ? min : Math.max(min, Math.min(max, parseInt(text, 10)));
        setText(String(n));
        onCommit(n);
      }}
    />
  );
}
