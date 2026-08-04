"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { confirmEmailChange } from "@/lib/authApi";

// Страница по ссылке из письма на НОВЫЙ адрес. Авторизацию даёт сам токен: письмо часто
// открывают в другом браузере (почта на телефоне), куки там может не быть. По образцу /reset.
function ConfirmInner() {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [newEmail, setNewEmail] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Подтверждаем один раз: в dev React монтирует эффекты дважды, а второй запрос
  // с тем же токеном уже вернёт «ссылка недействительна» (она одноразовая).
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    confirmEmailChange(token)
      .then((u) => setNewEmail(u.email))
      .catch((err) => setError(err instanceof Error ? err.message : "Не удалось подтвердить email"));
  }, [token]);

  if (!token) {
    return (
      <p style={{ color: "var(--charcoal)" }}>
        Ссылка неполная или устарела. Запросите смену email заново в{" "}
        <Link href="/account" className="link">личном кабинете</Link>.
      </p>
    );
  }

  if (error) {
    return (
      <>
        <p className="form-error" style={{ marginBottom: "var(--s-4)" }}>{error}</p>
        <p style={{ color: "var(--charcoal)", margin: "0 0 var(--s-5)" }}>
          Адрес для входа остался прежним. Заявку можно создать заново в личном кабинете.
        </p>
        <Link href="/account" className="btn btn--outline btn--lg btn--block">В личный кабинет</Link>
      </>
    );
  }

  if (!newEmail) {
    return <p style={{ color: "var(--charcoal)" }}>Подтверждаем адрес…</p>;
  }

  return (
    <>
      <p style={{ fontWeight: 600, color: "var(--stock, #16794a)", margin: "0 0 var(--s-3)" }}>
        ✓ Email успешно изменён
      </p>
      <p style={{ color: "var(--charcoal)", margin: "0 0 var(--s-5)" }}>
        Новый адрес для входа: <b style={{ color: "var(--ink)", wordBreak: "break-word" }}>{newEmail}</b>.
        Используйте его при следующем входе — пароль остался прежним.
      </p>
      <Link href="/account" className="btn btn--cta btn--lg btn--block">В личный кабинет</Link>
    </>
  );
}

export default function EmailConfirmPage() {
  return (
    <div className="container" style={{ maxWidth: 420, margin: "0 auto", padding: "var(--s-8) var(--s-4)" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-h1)", margin: "0 0 var(--s-4)" }}>
        Смена email
      </h1>
      <Suspense fallback={<p style={{ color: "var(--charcoal)" }}>Загрузка…</p>}>
        <ConfirmInner />
      </Suspense>
    </div>
  );
}
