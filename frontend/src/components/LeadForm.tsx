"use client";

import { useState } from "react";

// Кнопка заявки на условия поставки. Отправляет лид на /api/v1/leads
// (владельцу падает уведомление, как и о заказе). Задел под будущие личные кабинеты.
export default function LeadForm({ className, label = "Уточнить условия поставки" }:
  { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", shop_name: "", region: "" });
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      const res = await fetch("/api/v1/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button type="button" className={className ?? "btn btn--cta btn--lg"} onClick={() => { setOpen(true); setState("idle"); }}>
        {label}
      </button>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(20,20,30,.5)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 440, background: "var(--paper)", borderRadius: "var(--r-xl)",
              padding: "var(--s-8)", boxShadow: "var(--shadow-2)" }}>
            {state === "done" ? (
              <div style={{ textAlign: "center" }}>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-h2)", margin: "0 0 var(--s-3)" }}>Спасибо!</h3>
                <p style={{ color: "var(--charcoal)", margin: "0 0 var(--s-6)" }}>
                  Заявка принята — перезвоним и пришлём актуальные условия поставки.
                </p>
                <button className="btn btn--primary btn--block" onClick={() => setOpen(false)}>Закрыть</button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-h2)", margin: "0 0 var(--s-2)" }}>Получить прайс</h3>
                <p style={{ color: "var(--charcoal)", fontSize: "var(--t-sm)", margin: "0 0 var(--s-5)" }}>
                  Оставьте контакты — уточним регион, ассортимент и условия оптовой поставки.
                </p>
                <div className="field" style={{ marginBottom: "var(--s-3)" }}>
                  <label>Имя <span className="req">*</span></label>
                  <input className="input" required value={form.name} onChange={set("name")} placeholder="Как к вам обращаться" />
                </div>
                <div className="field" style={{ marginBottom: "var(--s-3)" }}>
                  <label>Телефон <span className="req">*</span></label>
                  <input className="input" required type="tel" value={form.phone} onChange={set("phone")} placeholder="+7 999 000-00-00" />
                </div>
                <div className="field" style={{ marginBottom: "var(--s-3)" }}>
                  <label>Название магазина</label>
                  <input className="input" value={form.shop_name} onChange={set("shop_name")} placeholder="необязательно" />
                </div>
                <div className="field" style={{ marginBottom: "var(--s-5)" }}>
                  <label>Регион</label>
                  <input className="input" value={form.region} onChange={set("region")} placeholder="Тверская обл." />
                </div>
                {state === "error" && (
                  <p className="form-error" style={{ marginBottom: "var(--s-3)" }}>Не удалось отправить. Попробуйте ещё раз.</p>
                )}
                <button type="submit" className="btn btn--cta btn--lg btn--block" disabled={state === "loading"}>
                  {state === "loading" ? "Отправляем…" : "Отправить заявку"}
                </button>
                <button type="button" className="btn btn--ghost btn--block" style={{ marginTop: "var(--s-2)", justifyContent: "center" }}
                  onClick={() => setOpen(false)}>Отмена</button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
