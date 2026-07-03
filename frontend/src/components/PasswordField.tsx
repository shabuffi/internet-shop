"use client";

import { useState } from "react";
import { IconEye, IconEyeOff } from "@/components/icons";

/** Поле ввода пароля с переключателем видимости (глазик). По умолчанию класс `.input`
 *  (витрина); в админке передаётся `className="form-input"`. */
export default function PasswordField({
  value, onChange, placeholder, required, autoFocus, autoComplete, id, name, className = "input", minLength,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  id?: string;
  name?: string;
  className?: string;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        className={className}
        minLength={minLength}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        id={id}
        name={name}
        style={{ paddingRight: 46 }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Скрыть пароль" : "Показать пароль"}
        title={show ? "Скрыть пароль" : "Показать пароль"}
        style={{
          position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
          display: "inline-flex", padding: 8, background: "none", border: "none",
          cursor: "pointer", color: "var(--graphite)",
        }}
      >
        {show ? <IconEyeOff style={{ width: 20, height: 20 }} /> : <IconEye style={{ width: 20, height: 20 }} />}
      </button>
    </div>
  );
}
