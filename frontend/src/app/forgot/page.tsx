"use client";

import { useState } from "react";
import Link from "next/link";
import { forgotPassword } from "@/lib/authApi";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 420, margin: "0 auto", padding: "var(--s-8) var(--s-4)" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-h1)", margin: "0 0 var(--s-2)" }}>
        Восстановление пароля
      </h1>

      {sent ? (
        <>
          <p style={{ color: "var(--charcoal)", margin: "var(--s-2) 0 var(--s-4)" }}>
            Если такой email зарегистрирован, мы отправили на него письмо со ссылкой для сброса пароля.
            Ссылка действует 1 час.
          </p>
          <p style={{ color: "var(--charcoal)", margin: "0 0 var(--s-6)" }}>
            Не пришло письмо? Проверьте папку «Спам» или{" "}
            <button type="button" className="link" onClick={() => setSent(false)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
              попробуйте ещё раз
            </button>.
          </p>
          <Link href="/login" className="btn btn--outline btn--lg btn--block">Вернуться ко входу</Link>
        </>
      ) : (
        <form onSubmit={submit}>
          <p style={{ color: "var(--charcoal)", margin: "0 0 var(--s-5)" }}>
            Укажите email, с которым вы регистрировались — пришлём ссылку для сброса пароля.
          </p>
          <div className="field" style={{ marginBottom: "var(--s-5)" }}>
            <label>Email <span className="req">*</span></label>
            <input className="input" type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.ru" autoFocus />
          </div>

          {error && <p className="form-error" style={{ marginBottom: "var(--s-3)" }}>{error}</p>}

          <button type="submit" className="btn btn--cta btn--lg btn--block" disabled={loading}>
            {loading ? "Отправляем…" : "Отправить ссылку"}
          </button>
          <p style={{ textAlign: "center", margin: "var(--s-4) 0 0" }}>
            <Link href="/login" className="link">Вспомнили пароль? Войти</Link>
          </p>
        </form>
      )}
    </div>
  );
}
