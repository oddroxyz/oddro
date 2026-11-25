import Link from "next/link";
import { BRAND } from "@/config/brand";
import { BoltIcon } from "@/components/site/Icons";
import { DeskMock } from "@/components/home/DeskMock";

/* Fixed spark positions (no randomness: server and client render the same). */
const SPARKS = [
  [12, 30], [26, 52], [40, 18], [52, 40], [61, 62], [70, 26], [83, 48], [90, 12], [33, 70], [47, 8], [76, 66], [18, 8], [58, 20], [95, 58],
];

/* The reference's hero: horizon arc that opens on load, a small tag, a two-line wide headline, light lede, two pill buttons,
   a fine line, sparks over a glow, then the product mock with a glowing top edge. */
export function Hero() {
  return (
    <section className="hero" data-testid="hero">
      <div className="arc" aria-hidden="true" />
      <div className="wrap">
        <p className="tag">
          <BoltIcon size={12} /> Order review desk for stock tokens
        </p>
        <h1 className="display h-hero mx-auto mt-6 max-w-[1180px]">{BRAND.slogan}</h1>
        <p className="lede mx-auto mt-7 max-w-[470px]">
          Write one periodic-buy strategy for one stock token. Oddro turns it into rules, asks when something is unclear, and puts every
          order the agent proposes on a review card. Nothing is bought until you approve that ticket on {BRAND.chainName}.
        </p>
        <div className="cta mt-12 flex flex-wrap items-center justify-center gap-4 max-[640px]:flex-col max-[640px]:items-stretch max-[640px]:px-6">
          <Link href="/desk" className="btn btn-white" data-testid="hero-open">
            Open the desk
            <span className="arrow" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </span>
          </Link>
          <Link href="/method" className="btn btn-line">
            How it checks
          </Link>
        </div>
        <p className="fine mt-6 text-[16px] max-[640px]:text-[14px]">Practice mode needs no wallet and no token. Prototype on {BRAND.chainName}.</p>
      </div>
      <div className="sparks" style={{ position: "relative", left: 0, margin: "22px auto 0" }} aria-hidden="true">
        {SPARKS.map(([x, y], i) => (
          <i key={i} style={{ left: `${x}%`, top: y, animationDelay: `${(i % 7) * 0.37}s, ${(i % 5) * 0.6}s` }} />
        ))}
      </div>
      <div className="mock-wrap px-[var(--pad)]">
        <DeskMock />
      </div>
    </section>
  );
}
