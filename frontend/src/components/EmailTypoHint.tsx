"use client";

import { useCallback, useRef, useState } from "react";
import { suggestEmailFix } from "@/lib/authApi";

/** Состояние подсказки об опечатке в домене e-mail (gmial.com → gmail.com).
 *
 *  Ничего не блокирует навсегда: форма спотыкается один раз, показывая предупреждение,
 *  а дальше покупатель либо исправляет адрес одной кнопкой, либо подтверждает, что адрес
 *  указан намеренно («Оставить как есть») — и отправка проходит.
 *
 *  Словарь опечаток на бэкенде (`POST /auth/check-email`), здесь копии нет.
 */
export function useEmailTypo() {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  // Адрес, который покупатель уже подтвердил как намеренный — по нему больше не переспрашиваем.
  const kept = useRef("");

  const norm = (email: string) => email.trim().toLowerCase();

  /** Сбрасывает показанную подсказку (вызывать при правке поля). */
  const reset = useCallback(() => setSuggestion(null), []);

  /** Спрашивает подсказку у бэкенда. `true` — препятствий к отправке формы нет. */
  const check = useCallback(async (email: string): Promise<boolean> => {
    if (!email || kept.current === norm(email)) {
      setSuggestion(null);
      return true;
    }
    const fix = await suggestEmailFix(email);
    setSuggestion(fix);
    return !fix;
  }, []);

  /** «Оставить как есть»: адрес намеренный — запоминаем и больше не предупреждаем. */
  const keep = useCallback((email: string) => {
    kept.current = norm(email);
    setSuggestion(null);
  }, []);

  return { suggestion, check, keep, reset };
}

/** Плашка «Возможно, вы имели в виду …?» с двумя действиями. Ничего не рисует без подсказки. */
export default function EmailTypoHint({
  suggestion, onFix, onKeep,
}: {
  suggestion: string | null;
  onFix: (fixed: string) => void;
  onKeep: () => void;
}) {
  if (!suggestion) return null;
  // В тексте показываем домен (человек проверяет именно его), кнопка подставляет адрес целиком.
  const domain = suggestion.split("@")[1] ?? suggestion;

  return (
    <div role="status" style={{
      marginTop: "var(--s-2)", padding: "var(--s-3)", borderRadius: "var(--r-lg, 12px)",
      background: "#fff8e6", border: "1px solid #f0d089", fontSize: "var(--t-sm)", color: "var(--ink)",
    }}>
      <p style={{ margin: 0 }}>
        Возможно, вы имели в виду <b>{domain}</b>?
      </p>
      <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap", marginTop: "var(--s-2)" }}>
        <button type="button" onClick={() => onFix(suggestion)} className="link"
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
            color: "var(--primary, #003399)", fontWeight: 600 }}>
          Исправить на {domain}
        </button>
        <button type="button" onClick={onKeep}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
            color: "var(--charcoal)", textDecoration: "underline" }}>
          Оставить как есть
        </button>
      </div>
    </div>
  );
}
