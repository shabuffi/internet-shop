"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginUser } from "@/lib/authApi";
import PasswordField from "@/components/PasswordField";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const setField = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginUser(form);
      router.push("/account");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 420, margin: "0 auto", padding: "var(--s-8) var(--s-4)" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-h1)", margin: "0 0 var(--s-2)" }}>Вход</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 var(--s-6)" }}>
        Нет аккаунта? <Link href="/register" className="link">Зарегистрироваться</Link>
      </p>

      <form onSubmit={submit}>
        <div className="field" style={{ marginBottom: "var(--s-3)" }}>
          <label>Email <span className="req">*</span></label>
          <input className="input" type="email" required value={form.email} onChange={setField("email")} placeholder="you@example.ru" autoFocus />
        </div>
        <div className="field" style={{ marginBottom: "var(--s-5)" }}>
          <label>Пароль <span className="req">*</span></label>
          <PasswordField required value={form.password} onChange={setField("password")} autoComplete="current-password" />
        </div>

        {error && <p className="form-error" style={{ marginBottom: "var(--s-3)" }}>{error}</p>}

        <button type="submit" className="btn btn--cta btn--lg btn--block" disabled={loading}>
          {loading ? "Входим…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
