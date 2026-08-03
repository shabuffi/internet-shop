"use client";

import { useCallback, useEffect, useRef } from "react";

/** Воздух под гридом до низа окна (совпадает с нижним отступом `<main>` в AdminShell). */
const BOTTOM_GAP = 32;
/** Ниже этого грид не ужимаем — на низком окне лучше вернуть странице немного прокрутки. */
const MIN_HEIGHT = 240;
/** Короче этого ползунок не делаем, иначе в широкой таблице его неудобно ловить мышью. */
const MIN_THUMB = 48;

/**
 * Таблица-грид админки: горизонтальная полоса прокрутки НАД таблицей, липкая шапка,
 * строки прокручиваются внутри карточки. Переиспользуемо для любых админ-таблиц
 * (покупатели, заказы, товары): `<ScrollableTable label="…"><table>…</table></ScrollableTable>`.
 *
 * Почему у карточки своя высота (`max-height` в `.dgrid`), а не прокрутка всей страницей:
 * `position: sticky` у `thead` цепляется за БЛИЖАЙШИЙ скролл-контейнер, а `overflow-x: auto`
 * делает контейнер скроллящимся по ОБЕИМ осям. Значит «липкая шапка + горизонтальный overflow +
 * вертикальная прокрутка страницы» нативно несовместимы: шапка липла бы к верху таблицы, а не
 * к экрану. Вариант с клоном шапки (вторая таблица поверх) требует синхронизировать ширины
 * каждой колонки — там рассинхрон штатный риск. Здесь таблица ОДНА и контейнер ОДИН, поэтому
 * шапка и строки не могут разъехаться в принципе, а сортировка по клику на `th` работает как есть.
 *
 * Ползунок нарисован сам (div), системные полосы скрыты: на macOS/Safari системные — overlay
 * (не видны, пока не скроллишь) и в разных браузерах стилизуются по-разному. Прокрутка при этом
 * настоящая (`scrollLeft` контейнера) — колесо, тачпад, клавиши и Ctrl+F работают штатно.
 * Вертикально грид листается колесом и клавишами, своей полосы справа нет (убрана намеренно).
 *
 * Высоту грида («до низа окна») ставит эффект ниже; передайте `style={{ maxHeight }}`, если
 * в каком-то месте нужна своя — тогда авто-подгонка отключается.
 */
export default function ScrollableTable({
  children,
  label,
  style,
}: {
  children: React.ReactNode;
  /** Название области для скринридера (вьюпорт таблицы фокусируется с клавиатуры). */
  label: string;
  /** Переопределение стилей карточки — например своя `maxHeight`. */
  style?: React.CSSProperties;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  /** Геометрия прокрутки; считается при ресайзе, чтобы на каждый скролл не дёргать layout. */
  const geo = useRef({ hidden: 0, maxOffset: 0 });
  const fixedHeight = style?.maxHeight !== undefined;

  /**
   * Высота грида = «до низа экрана»: тогда страница целиком помещается в окно и НЕ прокручивается,
   * а полоса и шапка физически не могут уехать за кадр. `position: sticky` тут не помогает —
   * карточка последняя в `<main>`, её низ совпадает с низом контейнера, и «прилипать» ей некуда
   * (проверено: при прокрутке страницы верх карточки уходил за экран).
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || fixedHeight) return;
    const fit = () => {
      const docTop = root.getBoundingClientRect().top + window.scrollY;   // отступ от верха документа
      // На низких окнах упираемся в MIN_HEIGHT: лучше немного прокрутить страницу, чем грид в две строки.
      const next = Math.max(MIN_HEIGHT, Math.round(window.innerHeight - docTop - BOTTOM_GAP));
      // Пишем, только если реально изменилось: ResizeObserver ниже следит за родителем, чья
      // высота зависит от нашей → без этой проверки был бы лишний круг пересчётов.
      const current = parseFloat(root.style.maxHeight);   // "" на первом проходе → NaN
      if (!Number.isFinite(current) || Math.abs(current - next) > 1) root.style.maxHeight = `${next}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    // шапка страницы над таблицей меняет высоту (ошибка, счётчики, перенос строки поиска)
    const ro = new ResizeObserver(fit);
    if (root.parentElement) ro.observe(root.parentElement);
    return () => { window.removeEventListener("resize", fit); ro.disconnect(); };
  }, [fixedHeight]);

  /** Реакция на прокрутку: ползунок под текущий scrollLeft + тень под шапкой (только запись). */
  const onScroll = useCallback(() => {
    const viewport = viewportRef.current, thumb = thumbRef.current, root = rootRef.current;
    if (!viewport || !thumb || !root) return;
    root.classList.toggle("dgrid--scrolled", viewport.scrollTop > 0);
    const { hidden, maxOffset } = geo.current;
    if (hidden <= 0) return;
    thumb.style.transform = `translateX(${Math.round((viewport.scrollLeft / hidden) * maxOffset)}px)`;
  }, []);

  /** Пересчитать размеры: влезает ли таблица по ширине и какой ширины ползунок. */
  const measure = useCallback(() => {
    const viewport = viewportRef.current, bar = barRef.current;
    const track = trackRef.current, thumb = thumbRef.current;
    if (!viewport || !bar || !track || !thumb) return;

    const hidden = viewport.scrollWidth - viewport.clientWidth;
    // Таблица влезает целиком — полосы нет (и места она не занимает).
    bar.hidden = hidden <= 1;
    if (bar.hidden) { geo.current = { hidden: 0, maxOffset: 0 }; return; }

    const trackWidth = track.clientWidth;
    const thumbWidth = Math.min(trackWidth, Math.max(MIN_THUMB, Math.round((viewport.clientWidth / viewport.scrollWidth) * trackWidth)));
    thumb.style.width = `${thumbWidth}px`;
    geo.current = { hidden, maxOffset: trackWidth - thumbWidth };
    onScroll();
  }, [onScroll]);

  // Скролл вьюпорта → ползунок; ресайз окна/меню/строк → пересчёт.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    measure();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    if (viewport.firstElementChild) ro.observe(viewport.firstElementChild);
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [measure, onScroll]);

  // Колесо над самой полосой крутит таблицу вбок (иначе жест «проваливается» в страницу).
  // Слушатель вешаем вручную: у React onWheel passive, preventDefault в нём не работает.
  useEffect(() => {
    const bar = barRef.current, viewport = viewportRef.current;
    if (!bar || !viewport) return;
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta) return;
      e.preventDefault();
      viewport.scrollLeft += delta;
    };
    bar.addEventListener("wheel", onWheel, { passive: false });
    return () => bar.removeEventListener("wheel", onWheel);
  }, []);

  /** Позиция курсора на дорожке → scrollLeft таблицы. */
  function scrollToPointer(clientX: number, grabOffset: number) {
    const viewport = viewportRef.current, track = trackRef.current;
    const { hidden, maxOffset } = geo.current;
    if (!viewport || !track || maxOffset <= 0) return;
    const offset = clientX - track.getBoundingClientRect().left - grabOffset;
    viewport.scrollLeft = Math.min(1, Math.max(0, offset / maxOffset)) * hidden;
  }

  /**
   * Нажатие в любом месте полосы (pointer events — мышь, перо и тач одним кодом).
   * По ползунку — тянем его; мимо ползунка — он сначала прыгает под курсор, дальше тянется
   * так же. Мышью можно хватать всю полосу целиком, а не только сам ползунок.
   */
  function onBarPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const bar = barRef.current, thumb = thumbRef.current;
    if (!bar || !thumb || e.button !== 0) return;
    e.preventDefault();          // не выделять текст таблицы во время перетаскивания

    const thumbRect = thumb.getBoundingClientRect();
    const onThumb = thumb.contains(e.target as Node);
    const grabOffset = onThumb ? e.clientX - thumbRect.left : thumbRect.width / 2;
    if (!onThumb) scrollToPointer(e.clientX, grabOffset);

    bar.setPointerCapture(e.pointerId);
    thumb.classList.add("dgrid__thumb--drag");

    const move = (ev: PointerEvent) => scrollToPointer(ev.clientX, grabOffset);
    const stop = (ev: PointerEvent) => {
      bar.releasePointerCapture(ev.pointerId);
      thumb.classList.remove("dgrid__thumb--drag");
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", stop);
      bar.removeEventListener("pointercancel", stop);
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", stop);
    bar.addEventListener("pointercancel", stop);
  }

  return (
    <div ref={rootRef} className="dgrid" style={style}>
      {/* `hidden` в разметке — стартовое состояние (чтобы полоса не мелькала до замера);
          дальше им управляет measure(), и React его не трогает — в JSX значение не меняется. */}
      <div ref={barRef} className="dgrid__bar" aria-hidden="true" hidden onPointerDown={onBarPointerDown}>
        <div ref={trackRef} className="dgrid__track">
          <div ref={thumbRef} className="dgrid__thumb" />
        </div>
      </div>

      <div ref={viewportRef} className="dgrid__viewport" tabIndex={0} role="region" aria-label={label}>
        {children}
      </div>
    </div>
  );
}
