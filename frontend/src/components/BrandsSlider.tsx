"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Brand, brandImageUrl } from "@/lib/brands";

/** Слайдер логотипов брендов над футером главной. Логотипы одной высоты, ширина по пропорциям,
 *  без плашки-фона (прозрачный PNG показывает фон секции, JPG — свой). Авто-прокрутка по кругу
 *  (бесшовно) + ручное листание: drag мышью, нативный скролл на тач. Пауза при наведении/захвате;
 *  уважает prefers-reduced-motion.
 *
 *  Логотипов может быть мало — тогда лента уже вьюпорта и петля рвётся. Поэтому число повторов
 *  подбираем так, чтобы ОДНА половина ленты была не уже вьюпорта (замер + ResizeObserver). */
export default function BrandsSlider({ brands }: { brands: Brand[] }) {
  const vpRef = useRef<HTMLDivElement>(null);
  const [reps, setReps] = useState(2);
  const hover = useRef(false);
  const dragging = useRef(false);
  const drag = useRef({ startX: 0, startScroll: 0 });

  // Пересчёт числа повторов: одна половина ленты (period сброса) должна быть ≥ ширины вьюпорта.
  const recompute = useCallback(() => {
    const vp = vpRef.current;
    if (!vp || brands.length === 0) return;
    setReps((cur) => {
      const unitW = vp.scrollWidth / cur;              // ширина одной уникальной копии логотипов
      if (!unitW || !isFinite(unitW)) return cur;
      const perHalf = Math.max(1, Math.ceil(vp.clientWidth / unitW) + 1);
      const needed = perHalf * 2;
      return needed === cur ? cur : needed;            // стабильная точка → React пропустит ре-рендер
    });
  }, [brands.length]);

  // Замеряем при монтировании, загрузке картинок (растёт ширина ленты) и ресайзе окна.
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    recompute();
    const ro = new ResizeObserver(() => recompute());
    ro.observe(vp.firstElementChild ?? vp);             // .brands__track
    window.addEventListener("resize", recompute);
    return () => { ro.disconnect(); window.removeEventListener("resize", recompute); };
  }, [recompute]);

  // Авто-прокрутка (после стабилизации reps): бесшовный сброс на половине ленты.
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp || brands.length === 0) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const SPEED = 0.5;                                  // px за кадр
    const step = () => {
      if (!hover.current && !dragging.current) {
        vp.scrollLeft += SPEED;
        const half = vp.scrollWidth / 2;
        if (half > 0 && vp.scrollLeft >= half) vp.scrollLeft -= half;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reps, brands.length]);

  if (brands.length === 0) return null;
  const loop = Array.from({ length: reps }, () => brands).flat();

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;              // тач — нативный скролл, drag не перехватываем
    const vp = vpRef.current;
    if (!vp) return;
    dragging.current = true;
    drag.current = { startX: e.clientX, startScroll: vp.scrollLeft };
    vp.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const vp = vpRef.current;
    if (!vp || !dragging.current) return;
    vp.scrollLeft = drag.current.startScroll - (e.clientX - drag.current.startX);
  };
  const stopDrag = () => { dragging.current = false; };

  return (
    <section className="brands" aria-label="Бренды">
      <div className="container"><h2 className="section-title section-title--caps section-title--line">Бренды</h2></div>
      <div
        className="brands__viewport"
        ref={vpRef}
        onMouseEnter={() => { hover.current = true; }}
        onMouseLeave={() => { hover.current = false; stopDrag(); }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div className="brands__track">
          {loop.map((b, i) => (
            <span className="brands__item" key={`${b.id}-${i}`} aria-hidden={i >= brands.length}>
              <img src={brandImageUrl(b.image)} alt="" draggable={false} />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
