/** Ошибки по полям формы: имя поля → человекочитаемое сообщение. */
export type FieldErrors = Record<string, string>;

/** Разбирает тело ошибки FastAPI.
 *
 *  `detail` бывает строкой (наши 4xx: «Товара нет в наличии») либо массивом ошибок
 *  валидации (422): `[{ loc: ["body", "customer_phone"], msg: "Value error, Укажите телефон…" }]`.
 *  Возвращаем общий текст (для плашки) и разбор по полям (для подсветки инпутов).
 */
export function parseApiError(data: unknown, fallback: string): { message: string; fields: FieldErrors } {
  const detail = (data as { detail?: unknown })?.detail;

  if (typeof detail === "string") return { message: detail, fields: {} };

  if (Array.isArray(detail) && detail.length > 0) {
    const fields: FieldErrors = {};
    let firstMsg: string | undefined;
    for (const raw of detail) {
      const item = raw as { loc?: unknown[]; msg?: string };
      // Pydantic v2 префиксит сообщения из ValueError как «Value error, …» — убираем.
      const msg = (item.msg ?? "").replace(/^Value error,\s*/, "").trim();
      if (!msg) continue;
      if (!firstMsg) firstMsg = msg;
      // loc = ["body", "customer_phone"] или ["body", "items", 0, "quantity"] — берём
      // последнее строковое имя, кроме служебного "body". У ошибок уровня модели
      // (model_validator) loc = ["body"] — поля нет, но текст всё равно показываем.
      const loc = Array.isArray(item.loc) ? item.loc : [];
      const name = [...loc].reverse().find((p) => typeof p === "string" && p !== "body");
      if (typeof name === "string" && !fields[name]) fields[name] = msg;
    }
    const message = Object.values(fields)[0] ?? firstMsg;
    if (message) return { message, fields };
  }

  return { message: fallback, fields: {} };
}
