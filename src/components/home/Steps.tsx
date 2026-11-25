"use client";

import { useEffect, useState } from "react";

/* The reference's numbered steps: one open at a time, advancing every 4 s while on screen; hover or focus opens one and holds it. */
export function Steps({ items }: { items: { title: string; text: string }[] }) {
  const [on, setOn] = useState(0);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "hidden") setOn((v) => (v + 1) % items.length);
    }, 4000);
    return () => clearInterval(t);
  }, [held, items.length]);
  return (
    <ol className="steps grid gap-5">
      {items.map((s, i) => (
        <li key={s.title} data-on={i === on} className="relative" onMouseEnter={() => { setHeld(true); setOn(i); }} onFocus={() => { setHeld(true); setOn(i); }} tabIndex={0}>
          <span className="n">{i + 1}</span>
          {i < items.length - 1 ? <span className="line" aria-hidden="true" /> : null}
          <div>
            <h3>{s.title}</h3>
            <div className="d">
              <p>{s.text}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
