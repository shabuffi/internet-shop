"use client";

import HelpHint from "@/components/HelpHint";

/** Тумблер админки: подпись + пояснение слева, переключатель справа. Вся строка кликабельна.
 *  labelHint — значок «?» рядом с подписью с развёрнутым пояснением (клик по нему не переключает
 *  тумблер: браузер не активирует label при клике по вложенной кнопке). */
export default function AdminToggle({
  checked, onChange, label, hint, labelHint, disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  labelHint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className="adm-toggle"
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        padding: "10px 12px", borderRadius: "var(--r-md)",
        background: checked ? "var(--accent-soft)" : "var(--cloud)",
        border: `1px solid ${checked ? "color-mix(in srgb, var(--accent) 25%, transparent)" : "transparent"}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background .15s, border-color .15s",
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
          {label}
          {labelHint && <HelpHint text={labelHint} />}
        </span>
        {hint && (
          <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-tertiary)", marginTop: 2 }}>{hint}</span>
        )}
      </span>

      {/* Настоящий checkbox оставляем в разметке (доступность, клавиатура), прячем визуально. */}
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
      />
      <span
        aria-hidden="true"
        className="adm-toggle__track"
        style={{
          flexShrink: 0, position: "relative", width: 38, height: 22, borderRadius: 999,
          background: checked ? "var(--accent)" : "var(--steel)",
          transition: "background .18s ease, box-shadow .15s ease",
        }}
      >
        <span
          style={{
            position: "absolute", top: 3, left: checked ? 19 : 3, width: 16, height: 16,
            borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)",
            transition: "left .18s ease",
          }}
        />
      </span>
    </label>
  );
}
