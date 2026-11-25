"use client";

import { explorerAddress, shortAddress } from "@/config/brand";
import { CopyChip } from "@/components/site/CaCopy";
import type { Reason, Verdict } from "@/lib/desk/review";

/*
 * The product's core object. Before anything is signed it shows: the rule that fired, the asset with its on-chain proof, the
 * amount, the minimum received, the estimated cost (gas, pool fee, quote vs Chainlink price) and a verdict with every reason.
 * Anything that could not be read says "Not known".
 */

export type CardCost = {
  gasEth: number | null;
  gasUsd: number | null;
  gasUnits: number;
  gasLabel: string;
  feePct: number | null;
  feeUsdg: number | null;
  quoteOut: number | null;
  impactPct: number | null;
  priceAge: string | null;
};

export type CardModel = {
  key: string;
  title: string;
  subtitle?: string;
  ticketId: number;
  firedRule: string;
  assetSymbol: string;
  assetAddress: string;
  proven: boolean | null;
  amountUsdg: number;
  minOut: string;
  deadline: string;
  hash: string;
  verdict: Verdict;
  stage: string;
  reasons: Reason[];
  cost: CardCost;
  status?: string;
  sample: boolean;
};

const NK = <span className="text-[var(--faint)]">Not known</span>;

export function ReviewCard({ c, actions, delay = 0 }: { c: CardModel; actions?: React.ReactNode; delay?: number }) {
  const v = c.verdict === "Proceed" ? "proceed" : "hold";
  return (
    <article className={`rcard ${v} enter`} style={{ "--delay": `${delay}ms` } as React.CSSProperties} data-testid={`card-${c.key}`} data-verdict={c.verdict}>
      <div className="rcard-head">
        <div className="min-w-0">
          <p className="text-[14px] font-medium">{c.title}</p>
          {c.subtitle ? <p className="text-[12px] text-[var(--muted)]">{c.subtitle}</p> : null}
        </div>
        <span className={`verdict ${v}`} data-testid="verdict">
          {c.verdict}
        </span>
      </div>
      <dl>
        <dt>Ticket</dt>
        <dd className="num">
          #{c.ticketId} {c.status ? <span className="chip ml-1">{c.status}</span> : null}
        </dd>
        <dt>Rule fired</dt>
        <dd>{c.firedRule}</dd>
        <dt>Asset</dt>
        <dd>
          {c.assetSymbol}{" "}
          <a className="elink num text-[12px]" href={explorerAddress(c.assetAddress)} target="_blank" rel="noreferrer">
            {shortAddress(c.assetAddress)}
          </a>{" "}
          {c.proven === null ? <span className="chip">proof not read</span> : c.proven ? <span className="chip dot ok">proven</span> : <span className="chip dot hold">not proven</span>}
        </dd>
        <dt>Amount</dt>
        <dd className="num">{c.amountUsdg.toFixed(2)} USDG</dd>
        <dt>Minimum out</dt>
        <dd className="num">{c.minOut}</dd>
        <dt>Est. cost</dt>
        <dd>
          <span className="block">
            {c.cost.gasLabel}: {c.cost.gasEth !== null ? <span className="num">{c.cost.gasEth.toFixed(7)} ETH{c.cost.gasUsd !== null ? ` ($${c.cost.gasUsd.toFixed(4)})` : ""}</span> : NK}
            <span className="text-[var(--faint)]"> · {c.cost.gasUnits.toLocaleString("en-US")} gas</span>
          </span>
          <span className="block">Pool fee: {c.cost.feePct !== null ? <span className="num">{c.cost.feePct}% ≈ {c.cost.feeUsdg?.toFixed(4)} USDG</span> : NK}</span>
          <span className="block">
            Quote vs Chainlink: {c.cost.impactPct !== null ? <span className="num">{c.cost.impactPct >= 0 ? "+" : ""}{c.cost.impactPct.toFixed(2)}%</span> : NK}
            {c.cost.priceAge ? <span className="text-[var(--faint)]"> · price {c.cost.priceAge}</span> : null}
          </span>
        </dd>
        <dt>Deadline</dt>
        <dd className="num">{c.deadline}</dd>
        <dt>Ticket hash</dt>
        <dd>
          <CopyChip value={c.hash} head={8} tail={6} />
        </dd>
      </dl>
      {c.reasons.length ? (
        <ul className="reasons" data-testid="reasons">
          {c.reasons.map((r) => (
            <li key={r.bit}>
              <b>{r.label}.</b> {r.detail ?? r.why}
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-b border-[var(--line)] px-3.5 py-2 text-[13px] text-[var(--neon)]">Every rule holds at the {c.stage} stage.</p>
      )}
      {actions ? <div className="flex flex-wrap gap-2 p-3">{actions}</div> : null}
      {c.sample ? <p className="px-3.5 pb-2.5 text-[11px] text-[var(--faint)]">Practice ticket · live prices and gas, sample desk</p> : null}
    </article>
  );
}
