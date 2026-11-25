import { BRAND, CHAIN, TOKEN, buyUrl, chartUrl } from "@/config/brand";
import { CaBox } from "@/components/site/CaCopy";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbLd, pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/token",
  title: `${BRAND.symbol}: the token, and what it is not`,
  description: `${BRAND.symbol} on ${BRAND.chainName}: contract address, launch status and planned utility. The Oddro desk works without it.`,
});

export default function TokenPage() {
  const live = TOKEN.isLive;
  const chart = chartUrl(BRAND.ca);
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: BRAND.symbol, path: "/token" }])} />
      <PageHead eyebrow={`${BRAND.tokenName} · ${BRAND.chainName}`} title={`${BRAND.symbol}`}>
        <p>A memecoin with planned utility. The desk, the review cards, the queue and the contract never need it.</p>
      </PageHead>
      <div className="wrap grid gap-8 pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="panel glow panel-pad grid gap-4" data-testid="token-panel">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- small versioned logo; next/image refuses the ?v= query */}
            <img src="/brand/mark-tile.webp?v=f9ddcec9" alt={`${BRAND.tokenName} logo`} width={56} height={56} className="rounded-[14px]" />
            <div>
              <p className="text-[18px] font-medium">{BRAND.tokenName}</p>
              <p className="num text-[13px] text-[var(--muted)]">
                {BRAND.symbol} · {CHAIN.name} · gas in {CHAIN.nativeSymbol}
              </p>
            </div>
          </div>
          <CaBox testid="token-ca" />
          <p className="text-[14px] text-[var(--muted)]">
            {live ? "This is the only contract address. Anything else using the name is not ours." : "Not launched. The contract address is published here at launch; launchpad TBA. Until then any token using the name is not ours."}
          </p>
          <div className="flex flex-wrap gap-3">
            <a className="btn btn-white btn-sm" href={buyUrl()} target="_blank" rel="noreferrer">
              {live ? "Buy" : "At launch"}
            </a>
            {chart ? (
              <a className="btn btn-line btn-sm" href={chart} target="_blank" rel="noreferrer">
                Chart (DEXTools)
              </a>
            ) : null}
          </div>
        </section>
        <section className="panel panel-pad grid content-start gap-3">
          <h2 className="display text-[24px]">Planned utility</h2>
          {[
            ["Higher desk limits: more desks and assets per wallet on the hosted queue", "Concept"],
            ["Alerts when a ticket waits for you (email or push)", "Concept"],
            ["Using the desk, the cards, the queue and the contract", "Prototype"],
          ].map(([t, s]) => (
            <div key={t} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2 text-[14px]">
              <span>{t}</span>
              <StatusBadge status={s as "Prototype" | "Concept"} />
            </div>
          ))}
          <p className="text-[13px] text-[var(--muted)]">The last row is free and needs no token. Nothing here is a promise of value, returns or price. We never DM first.</p>
        </section>
      </div>
    </>
  );
}
