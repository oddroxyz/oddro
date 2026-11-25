"use client";

import { useEffect, useRef } from "react";

/*
 * The reference's statement: uppercase display text lit word by word as it scrolls through the viewport (unlit words sit at
 * 20 % opacity), over a large outline that draws itself in a glow. Here the outline is Oddro's ring and check. Without JavaScript,
 * with reduced motion or in a hidden tab every word is lit and the outline is complete.
 */
const TEXT =
  "An agent should not buy on a guess. Every order it proposes waits on a card that says which rule fired, what it costs and why it may proceed, until you sign it yourself.";

export function Statement() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const words = [...el.querySelectorAll<HTMLElement>(".w")];
    const svg = el.querySelector<SVGElement>(".stmt-mark");
    let raf = 0;
    const update = () => {
      raf = 0;
      if (document.visibilityState === "hidden") return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      // 0 when the block's top enters at the bottom, 1 when its middle reaches 35 % from the top.
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.65 + r.height * 0.5)));
      const lit = p * words.length * 1.1;
      words.forEach((w, i) => w.style.setProperty("--lit", String(Math.min(1, Math.max(0.2, lit - i)))));
      svg?.style.setProperty("--draw", String(Math.min(1, p * 1.25)));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    const vis = () => {
      if (document.visibilityState === "hidden") {
        words.forEach((w) => w.style.setProperty("--lit", "1"));
        svg?.style.setProperty("--draw", "1");
      } else update();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      document.removeEventListener("visibilitychange", vis);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <section className="stmt" ref={ref} data-testid="statement">
      <svg className="stmt-mark" viewBox="0 0 320 320" aria-hidden="true">
        <circle cx="160" cy="160" r="128" style={{ "--len": 805 } as React.CSSProperties} />
        <path d="M100 166l40 40 84-86" style={{ "--len": 180 } as React.CSSProperties} />
      </svg>
      <p className="display statement">
        {TEXT.split(" ").map((w, i) => (
          <span key={i}>
            <span className="w">{w}</span>{" "}
          </span>
        ))}
      </p>
    </section>
  );
}
