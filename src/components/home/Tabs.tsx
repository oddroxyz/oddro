"use client";

import { useEffect, useRef, useState } from "react";

/*
 * The reference's tab rows: three tabs across the frame, the active one with a neon underline that fills over 7 s and then moves
 * to the next tab. Clicking a tab stops the cycle there. Pauses while the tab is hidden or the section is off screen.
 */
export type TabItem = { id: string; label: string; body: React.ReactNode; visual: React.ReactNode };

const DURATION = 7000;

export function Tabs({ items, testid }: { items: TabItem[]; testid: string }) {
  const [on, setOn] = useState(0);
  const [held, setHeld] = useState(false);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (held || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      bars.current[on]?.style.setProperty("--p", "1");
      return;
    }
    let raf = 0;
    let t0 = performance.now();
    let seen = true;
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
    });
    if (box.current) io.observe(box.current);
    const tick = (t: number) => {
      if (!seen || document.visibilityState === "hidden") t0 = t - (Number(bars.current[on]?.style.getPropertyValue("--p") || 0) * DURATION);
      const p = Math.min(1, (t - t0) / DURATION);
      bars.current[on]?.style.setProperty("--p", String(p));
      if (p >= 1) {
        setOn((v) => (v + 1) % items.length);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [on, held, items.length]);
  return (
    <div ref={box} data-testid={testid}>
      <div className="tabs" role="tablist">
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            role="tab"
            id={`${testid}-${it.id}`}
            aria-selected={i === on}
            aria-controls={`${testid}-panel`}
            className="tab"
            onClick={() => {
              setHeld(true);
              setOn(i);
            }}
          >
            {it.label}
            <span className="bar" ref={(el) => { bars.current[i] = el; }} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="tabbody" role="tabpanel" id={`${testid}-panel`} aria-labelledby={`${testid}-${items[on].id}`}>
        <div className="txt" key={`t-${on}`}>
          {items[on].body}
        </div>
        <div className="vis dots" key={`v-${on}`}>
          {items[on].visual}
        </div>
      </div>
    </div>
  );
}
