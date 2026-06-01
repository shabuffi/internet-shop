"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/adminApi";

export default function AdminLoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
      const data = await res.json();
      setToken(data.access_token);
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "var(--canvas)", borderRadius: "var(--radius-xl)", border: "1px solid var(--hairline-soft)", padding: 40, width: "100%", maxWidth: 400 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: -0.3 }}>Вход в админку</h1>
        <p style={{ fontSize: 14, color: "var(--ink-secondary)", marginBottom: 28 }}>Управление магазином</p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Логин</label>
            <input className="form-input" value={form.username} onChange={e => setForm(p => ({...p, username: e.target.value}))} required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input className="form-input" type="password" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} required />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? "Входим..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
