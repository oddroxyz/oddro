"use client";

import { CHAIN, explorerAddress } from "@/config/brand";
import type { AssetBoard } from "@/lib/server/assets";
import type { ChainSnapshot } from "@/lib/server/snapshot";
import { ago } from "@/lib/format";
import { useJson } from "@/lib/useJson";

/* Live numbers the site really reads, each with its source. Shown as "Not known" until (or unless) the read answers. */
export function useChain() {
  return useJson<ChainSnapshot>("/api/chain", 15_000).data;
}

export function useAssets() {
  return useJson<AssetBoard>("/api/assets", 60_000);
}

export function LiveStrip() {
  const c = useChain();
  const gwei = c?.gasPriceWei ? Number(c.gasPriceWei) / 1e9 : null;
  return (
    <div className="live-strip" data-testid="live-strip">
      <span className="inline-flex items-center gap-2">
        <i className="pulse" aria-hidden="true" /> {CHAIN.name}
      </span>
      <span>
        Block <b className="num">{c?.block != null ? c.block.toLocaleString("en-US") : "Not known"}</b>
      </span>
      <span>
        Gas <b className="num">{gwei != null ? `${gwei < 0.1 ? gwei.toFixed(4) : gwei.toFixed(2)} gwei` : "Not known"}</b>
      </span>
      <span>
        ETH/USD{" "}
        {c?.ethUsd ? (
          <a className="elink" href={explorerAddress(c.ethUsd.feed)} target="_blank" rel="noreferrer">
            <b className="num">${c.ethUsd.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b>
          </a>
        ) : (
          <b>Not known</b>
        )}
        {c?.ethUsd ? <span className="faint"> · Chainlink, {ago(c.ethUsd.updatedAt)}</span> : null}
      </span>
    </div>
  );
}

/** The proven asset list as small rows: symbol, proof, price with age, pool fee tier. */
export function AssetRows({ limit = 6 }: { limit?: number }) {
  const { data, error } = useAssets();
  if (!data) return <p className="text-[13px] text-[var(--muted)]">{error ? `Asset board: ${error}` : "Reading the asset board from chain…"}</p>;
  return (
    <ul className="grid gap-1.5 text-[13px]" data-testid="asset-rows">
      {data.assets.slice(0, limit).map((a) => {
        const price = a.feed?.answer ? Number(a.feed.answer) / 10 ** a.feed.decimals : null;
        return (
          <li key={a.address} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[var(--line)] bg-black/40 px-3 py-2">
            <span className="inline-flex items-center gap-2">
              <a className="font-medium hover:text-[var(--neon)]" href={explorerAddress(a.address)} target="_blank" rel="noreferrer">
                {a.symbol}
              </a>
              <span className={`chip dot ${a.proof.proven ? "ok" : "hold"}`}>{a.proof.proven ? "proven" : "not proven"}</span>
            </span>
            <span className="num text-[var(--muted)]">
              {price != null ? `$${price.toFixed(2)}` : "Not known"}
              {a.feed?.stale ? " · stale" : ""} · {a.pool ? `pool ${a.pool.fee / 10_000}%` : "no pool"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
