"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Официальный сайт национальной системы маркировки — цель ссылки «Подробнее о маркировке».
export const CZ_URL = "https://честныйзнак.рф";

// Единые формулировки о маркировке (используются в попапе, подсказке и блоках).
export const CZ_TITLE = "Маркировка ЧЕСТНЫЙ ЗНАК";
export const CZ_TEXT =
  "Товар подлежит маркировке в национальной системе Честный ЗНАК. " +
  "Юридическим лицам для совершения заказа необходимо подключение к ЭДО " +
  "и регистрация в ГИС МТ Честный ЗНАК.";

// Попап с пояснением о маркировке: крупный официальный знак сверху по центру.
// Esc и клик по фону закрывают; фокус переходит на кнопку закрытия.
export default function ChestnyZnakModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // Блокируем прокрутку фона, пока окно открыто.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="cz-modal-backdrop" onClick={onClose}>
      <div
        className="cz-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cz-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="cz-modal__close" aria-label="Закрыть" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>

        <img className="cz-modal__logo" src="/chestny-znak-icon.svg" alt="" aria-hidden="true" />
        <h2 className="cz-modal__title" id="cz-modal-title">{CZ_TITLE}</h2>
        <p className="cz-modal__lead">{CZ_TEXT}</p>

        <button type="button" className="btn btn--primary btn--block" onClick={onClose}>Понятно</button>
      </div>
    </div>,
    document.body,
  );
}
