"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Banner } from "@/lib/banners";

// Адаптивный слайдер баннеров: авто-смена, плавный сдвиг, точки-навигация.
// Пауза при наведении; уважает prefers-reduced-motion (не крутит сам).
const INTERVAL = 6000;

// Картинка баннера поверх градиента-заглушки: если файла нет — прячем <img>, остаётся градиент.
function BannerMedia({ b }: { b: Banner }) {
  const [imgOk, setImgOk] = useState(true);
  const gradient = `linear-gradient(120deg, ${b.from || "#003399"} 0%, ${b.to || "#3b7dd8"} 100%)`;
  return (
    <div style={{ position: "absolute", inset: 0, background: gradient }}>
      {b.image && imgOk && (
        <img src={b.image} alt="" onError={() => setImgOk(false)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      {/* затемнение для читаемости текста */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.15) 55%, rgba(0,0,0,0) 100%)" }} />
    </div>
  );
}

export default function Slider({ banners }: { banners: Banner[] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = banners.length;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (n <= 1 || paused) return;
    const reduce = typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    timer.current = setInterval(() => setIdx((i) => (i + 1) % n), INTERVAL);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [n, paused]);

  if (n === 0) return null;

  return (
    <div
      className="slider"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{ position: "relative", overflow: "hidden", borderRadius: "var(--r-xl, 16px)",
        boxShadow: "var(--shadow-1)", background: "var(--cloud)" }}
    >
      {/* Лента слайдов */}
      <div style={{ display: "flex", height: "100%", transform: `translateX(-${idx * 100}%)`,
        transition: "transform .6s cubic-bezier(.4,0,.2,1)" }}>
        {banners.map((b) => (
          <Link key={b.id} href={b.href || "/catalog"} className="slider__slide"
            style={{ position: "relative", flex: "0 0 100%", display: "block", textDecoration: "none",
              color: "#fff", minWidth: "100%" }}>
            <BannerMedia b={b} />
            <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column",
              justifyContent: "center", gap: 10, padding: "clamp(20px, 5vw, 48px)" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(24px, 4.5vw, 40px)", fontWeight: 700,
                margin: 0, lineHeight: 1.1, textShadow: "0 2px 12px rgba(0,0,0,.25)" }}>{b.title}</h3>
              {b.subtitle && (
                <p style={{ margin: 0, fontSize: "clamp(14px, 2vw, 18px)", maxWidth: 460, opacity: .95,
                  textShadow: "0 1px 8px rgba(0,0,0,.25)" }}>{b.subtitle}</p>
              )}
              {b.cta && (
                <span className="slider__cta" style={{ marginTop: 6, alignSelf: "flex-start",
                  background: "#fff", color: "var(--ink)", fontWeight: 700, fontSize: 15,
                  padding: "11px 22px", borderRadius: 999 }}>{b.cta}</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* Точки-навигация */}
      {n > 1 && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 14, zIndex: 2,
          display: "flex", justifyContent: "center", gap: 8 }}>
          {banners.map((b, i) => (
            <button key={b.id} type="button" aria-label={`Баннер ${i + 1}`} onClick={() => setIdx(i)}
              style={{ width: i === idx ? 26 : 9, height: 9, borderRadius: 999, border: "none", cursor: "pointer",
                background: i === idx ? "#fff" : "rgba(255,255,255,.55)", transition: "width .3s, background .3s", padding: 0 }} />
          ))}
        </div>
      )}
    </div>
  );
}
