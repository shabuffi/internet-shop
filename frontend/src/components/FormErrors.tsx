"use client";

import { useCallback, useEffect, useState } from "react";
import { parseApiError, type FieldErrors } from "@/lib/formErrors";

/** Сообщение об ошибке под конкретным полем. Ничего не рисует, если ошибки нет. */
export function FieldError({ children }: { children?: string }) {
  return children ? <p className="field__err">{children}</p> : null;
}

/** Состояние ошибок формы: общая плашка + подсветка/тряска невалидных полей.
 *
 *  `attempt` меняется на каждой неудачной попытке — от него зависит имя класса тряски
 *  (`shake-a`/`shake-b`), поэтому CSS-анимация перезапускается даже при тех же полях.
 */
export function useFormErrors() {
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const [attempt, setAttempt] = useState(0);

  const clear = useCallback(() => { setMessage(null); setFields({}); }, []);

  /** Базовая установка: общий текст + ошибки по полям. Инкремент attempt перезапускает тряску. */
  const setErrors = useCallback((text: string, f: FieldErrors = {}) => {
    setMessage(text);
    setFields(f);
    setAttempt((a) => a + 1);
  }, []);

  /** Ошибка от API: разбираем `detail` (строка или список ошибок валидации 422). */
  const setFromApi = useCallback((data: unknown, fallback: string) => {
    const parsed = parseApiError(data, fallback);
    setErrors(parsed.message, parsed.fields);
  }, [setErrors]);

  /** Своя ошибка (проверка на клиенте): текст + какие поля подсветить. */
  const setLocal = useCallback((text: string, names: string[] = []) => {
    setErrors(text, Object.fromEntries(names.map((n) => [n, text])));
  }, [setErrors]);

  // После отрисовки подсветки — фокус и прокрутка к первому невалидному полю.
  useEffect(() => {
    if (attempt === 0) return;
    const el = document.querySelector<HTMLElement>(".input--invalid");
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
  }, [attempt]);

  /** Классы для инпута: дописываются к базовому `input`/`textarea`. */
  const invalidClass = useCallback(
    (name: string) => (fields[name] ? ` input--invalid ${attempt % 2 ? "shake-b" : "shake-a"}` : ""),
    [fields, attempt],
  );

  return { message, fields, clear, setErrors, setFromApi, setLocal, invalidClass };
}
