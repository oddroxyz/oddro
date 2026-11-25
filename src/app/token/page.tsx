import { BRAND, CHAIN, TOKEN, buyUrl, chartUrl } from "@/config/brand";
import { QUOTA } from "@/config/quota";
import { CaBox } from "@/components/site/CaCopy";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { ClientOnly } from "@/components/desk/ClientOnly";
import { HolderSection } from "@/components/holder/HolderSection";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbLd, pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/token",
  title: `${BRAND.symbol}: the token, and what it unlocks`,
  description: `${BRAND.symbol} on ${BRAND.chainName}: contract address, launch status and token features. Holding 0.1 % of the supply gives more hosted desks; the Oddro desk and alerts work without it.`,
});

const ROWS: { f: string; free: string; holder: string; s: "Prototype" | "Concept" }[] = [
  { f: "Hosted desks (strategy + practice queue saved on the server)", free: `${QUOTA.free.desks}`, holder: `${QUOTA.holder.desks}`, s: "Prototype" },
  { f: "Different assets across hosted desks", free: `${QUOTA.free.assets}`, holder: `${QUOTA.holder.assets}`, s: "Prototype" },
  { f: "Saved strategies", free: `${QUOTA.free.strategies}`, holder: `${QUOTA.holder.strategies}`, s: "Prototype" },
  { f: "Alerts: bell inbox + browser notifications (ticket waiting, expiring, executed or not, desk paused)", free: "yes", holder: "yes", s: "Prototype" },
  { f: "The desk, review cards, approval queue, contract, history", free: "yes", holder: "yes", s: "Prototype" },
];

export default function TokenPage() {
  const live = TOKEN.isLive;
  const chart = chartUrl(BRAND.ca);
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: BRAND.symbol, path: "/token" }])} />
      <PageHead eyebrow={`${BRAND.tokenName} · ${BRAND.chainName}`} title={`${BRAND.symbol}`}>
        <p>The community token of Oddro. Holding 0.1 % of its supply gives more room on the hosted desk; everything else stays free and works without it.</p>
      </PageHead>
      <div className="wrap grid gap-8 pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="panel glow panel-pad grid content-start gap-4" data-testid="token-panel">
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
            {live ? "This is the only contract address. Anything else using the name is not ours." : "Not launched. The contract address is published here at launch; launchpad TBA. Until then any token using the name is not ours, and the holder tier unlocks at launch."}
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
        <ClientOnly fallback={<div className="panel panel-pad text-[14px] text-[var(--muted)]">Loading…</div>}>
          <HolderSection />
        </ClientOnly>
        <section className="panel panel-pad grid content-start gap-3 lg:col-span-2" data-testid="token-features">
          <h2 className="display text-[24px]">Token features</h2>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Free (any wallet)</th>
                  <th>Holder (≥ 0.1 % of supply)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.f}>
                    <td>{r.f}</td>
                    <td className="num">{r.free}</td>
                    <td className="num">{live || r.holder === r.free ? r.holder : `${r.holder} (unlocks at launch)`}</td>
                    <td>
                      <StatusBadge status={r.s} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="mt-2 text-[16px] font-medium">How the check works</h3>
          <ul className="grid list-disc gap-1.5 pl-5 text-[14px] text-[var(--muted)]">
            <li>You sign one Sign-In with Ethereum message in your wallet (no gas, nothing moves). It names this site, Robinhood Chain (4663), your wallet, an expiry of at most 4 hours and a random nonce. Sign out ends it on the server too.</li>
            <li>The signed message stays in this tab only and goes with each hosted-desk request; the server checks the signature, the site (against a fixed list, never what the request claims), the chain and the expiry every time. Smart-contract wallets cannot sign in yet (EOA only).</li>
            <li>At each request the server reads balanceOf(your wallet) and totalSupply() of {BRAND.symbol} on chain (kept at most 30 seconds). Holder = balance ≥ supply ÷ 1,000. Quotas are enforced on the server.</li>
            <li>Alerts are free for everyone: the chain is public, so the bell and browser notifications are computed for any connected wallet.</li>
          </ul>
          <p className="text-[13px] text-[var(--muted)]">No fee discounts, no rewards, no revenue share. Nothing here is a promise of value, returns or price. We never DM first.</p>
        </section>
      </div>
    </>
  );
}
