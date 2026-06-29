"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerUser, type CustomerType } from "@/lib/authApi";

const TYPES: { value: CustomerType; label: string }[] = [
  { value: "individual", label: "Физическое лицо" },
  { value: "ip", label: "ИП" },
  { value: "ooo", label: "ООО" },
];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "", phone: "", customer_type: "individual" as CustomerType,
    customer_name: "", inn: "", password: "", consent: false,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const setField = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const needInn = form.customer_type !== "individual";
  const nameLabel = form.customer_type === "individual" ? "ФИО" : "Наименование организации";
  const innLen = form.customer_type === "ip" ? 12 : 10;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await registerUser({
        email: form.email,
        phone: form.phone,
        customer_type: form.customer_type,
        customer_name: form.customer_name,
        inn: needInn ? form.inn : undefined,
        password: form.password,
        consent: form.consent,
      });
      router.push("/account");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 480, margin: "0 auto", padding: "var(--s-8) var(--s-4)" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-h1)", margin: "0 0 var(--s-2)" }}>Регистрация</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 var(--s-6)" }}>
        Уже есть аккаунт? <Link href="/login" className="link">Войти</Link>
      </p>

      <form onSubmit={submit}>
        <div className="field" style={{ marginBottom: "var(--s-3)" }}>
          <label>Email <span className="req">*</span></label>
          <input className="input" type="email" required value={form.email} onChange={setField("email")} placeholder="you@example.ru" autoFocus />
        </div>
        <div className="field" style={{ marginBottom: "var(--s-3)" }}>
          <label>Телефон <span className="req">*</span></label>
          <input className="input" type="tel" required value={form.phone} onChange={setField("phone")} placeholder="+7 999 000-00-00" />
        </div>
        <div className="field" style={{ marginBottom: "var(--s-3)" }}>
          <label>Тип заказчика <span className="req">*</span></label>
          <select className="input" value={form.customer_type} onChange={setField("customer_type")}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: "var(--s-3)" }}>
          <label>{nameLabel} <span className="req">*</span></label>
          <input className="input" required value={form.customer_name} onChange={setField("customer_name")}
            placeholder={form.customer_type === "individual" ? "Иванов Иван Иванович" : "ООО «Ромашка»"} />
        </div>
        {needInn && (
          <div className="field" style={{ marginBottom: "var(--s-3)" }}>
            <label>ИНН <span className="req">*</span></label>
            <input className="input" required inputMode="numeric" value={form.inn} onChange={setField("inn")}
              placeholder={`${innLen} цифр`} />
          </div>
        )}
        <div className="field" style={{ marginBottom: "var(--s-4)" }}>
          <label>Пароль <span className="req">*</span></label>
          <input className="input" type="password" required minLength={8} value={form.password} onChange={setField("password")}
            placeholder="не короче 8 символов" />
        </div>

        <label style={{ display: "flex", gap: "var(--s-2)", alignItems: "flex-start", marginBottom: "var(--s-5)", fontSize: "var(--t-sm)", color: "var(--charcoal)" }}>
          <input type="checkbox" required checked={form.consent}
            onChange={(e) => setForm((p) => ({ ...p, consent: e.target.checked }))}
            style={{ marginTop: 3, flex: "none" }} />
          <span>Согласен на обработку персональных данных в соответствии с{" "}
            <Link href="/offer" className="link" target="_blank">политикой обработки ПД</Link>.</span>
        </label>

        {error && <p className="form-error" style={{ marginBottom: "var(--s-3)" }}>{error}</p>}

        <button type="submit" className="btn btn--cta btn--lg btn--block" disabled={loading}>
          {loading ? "Регистрируем…" : "Зарегистрироваться"}
        </button>
      </form>
    </div>
  );
}
