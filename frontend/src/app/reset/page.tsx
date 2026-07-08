"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "@/lib/authApi";
import PasswordField from "@/components/PasswordField";

function ResetInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (pw !== pw2) { setError("Пароли не совпадают"); return; }
    setLoading(true);
    try {
      await resetPassword({ token, new_password: pw });
      setDone(true);
      setTimeout(() => { router.push("/account"); router.refresh(); }, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <p style={{ color: "var(--charcoal)" }}>
        Ссылка неполная или устарела. Запросите восстановление заново на{" "}
        <Link href="/forgot" className="link">этой странице</Link>.
      </p>
    );
  }

  if (done) {
    return <p style={{ color: "var(--charcoal)" }}>Пароль изменён! Входим в личный кабинет…</p>;
  }

  return (
    <form onSubmit={submit}>
      <p style={{ color: "var(--charcoal)", margin: "0 0 var(--s-5)" }}>Придумайте новый пароль для входа.</p>
      <div className="field" style={{ marginBottom: "var(--s-3)" }}>
        <label>Новый пароль <span className="req">*</span></label>
        <PasswordField required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      </div>
      <div className="field" style={{ marginBottom: "var(--s-2)" }}>
        <label>Повторите пароль <span className="req">*</span></label>
        <PasswordField required value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
      </div>
      <p style={{ color: "var(--graphite)", fontSize: "var(--t-sm)", margin: "0 0 var(--s-5)" }}>
        Минимум 8 символов, строчные и заглавные буквы, цифра.
      </p>

      {error && <p className="form-error" style={{ marginBottom: "var(--s-3)" }}>{error}</p>}

      <button type="submit" className="btn btn--cta btn--lg btn--block" disabled={loading}>
        {loading ? "Сохраняем…" : "Сохранить пароль"}
      </button>
    </form>
  );
}

export default function ResetPage() {
  return (
    <div className="container" style={{ maxWidth: 420, margin: "0 auto", padding: "var(--s-8) var(--s-4)" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-h1)", margin: "0 0 var(--s-4)" }}>
        Новый пароль
      </h1>
      <Suspense fallback={<p style={{ color: "var(--charcoal)" }}>Загрузка…</p>}>
        <ResetInner />
      </Suspense>
    </div>
  );
}
