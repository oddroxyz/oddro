import "server-only";
import { keccak256 } from "viem";
import { SUPPORTED } from "@/config/assets";
import { BEACON_SLOT, ETH_USD_FEED, STOCK_BEACON, STOCK_PROXY_CODEHASH, UNISWAP_V3, USDG } from "@/config/dex";
import { rpcBatchAnswers } from "@/lib/feeds/rpc";
import { headBlock, multicall } from "@/lib/server/chainread";
import TOKENS from "@/lib/fixtures/stock-tokens.json";
import FEEDS from "@/lib/fixtures/stock-feeds.json";

/*
 * The supported assets, read live from Robinhood Chain. For each one:
 *   - proof: in the vetted list + proxy code hash + beacon slot (once per process; a beacon proxy cannot change either) +
 *     totalSupply() > 0 (every read),
 *   - price: its Chainlink feed's latestRoundData() with updatedAt (stock feeds pause outside market hours: "stale" is shown),
 *   - pool: Uniswap v3 getPool(asset, USDG, fee) for every fee tier and USDG.balanceOf(pool) as depth; the deepest is used.
 * A failed read leaves the field null and the page says "Not known". A failed refresh is never cached
 * (memory: cache-papan-gagal-meracuni-build); the last complete board is served while a retry waits.
 */

export type Feed = { proxy: string; kind: "standard" | "24/7"; decimals: number; heartbeat: number; answer: string | null; updatedAt: number | null; stale: boolean | null };
export type Pool = { address: string; fee: number; usdgDepth: string };
export type Asset = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  proof: { inList: boolean; codeHash: boolean | null; beacon: boolean | null; supply: string | null; proven: boolean };
  feed: Feed | null;
  pool: Pool | null;
};
export type AssetBoard = { assets: Asset[]; head: number | null; readAt: number; ethUsd: { answer: string | null; updatedAt: number | null }; complete: boolean };

type Cand = { a: string; s: string; n: string; d: number | null; proven: boolean };
type FeedInfo = { symbol: string; proxy: string; heartbeat: number; kind: string; decimals: number };
const LIST = (TOKENS.tokens as Cand[]).filter((t) => t.proven && (SUPPORTED as readonly string[]).includes(t.s));
const FEED_LIST = FEEDS.feeds as FeedInfo[];
const GRACE = 600;
const SEL = { totalSupply: "0x18160ddd", latestRoundData: "0xfeaf968c", getPool: "0x1698ee82", balanceOf: "0x70a08231" } as const;
const pad = (hex: string) => hex.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const word = (hex: string | null) => (hex && hex.length >= 66 ? BigInt(hex.slice(0, 66)) : null);

const proofs = new Map<string, { code: boolean; slot: boolean }>();

async function proveCode() {
  const todo = LIST.filter((c) => !proofs.has(c.a));
  if (!todo.length) return;
  const ans = await rpcBatchAnswers(todo.flatMap((c) => [{ method: "eth_getCode", params: [c.a, "latest"] }, { method: "eth_getStorageAt", params: [c.a, BEACON_SLOT, "latest"] }])).catch(() => null);
  if (!ans) return;
  todo.forEach((c, k) => {
    const code = ans[2 * k];
    const slot = ans[2 * k + 1];
    if (code.kind !== "ok" || slot.kind !== "ok") return;
    const codeOk = typeof code.result === "string" && code.result.length > 2 && keccak256(code.result as `0x${string}`) === STOCK_PROXY_CODEHASH;
    const slotOk = typeof slot.result === "string" && /^0x[0-9a-f]+$/i.test(slot.result) && BigInt(slot.result) === BigInt(STOCK_BEACON);
    proofs.set(c.a, { code: codeOk, slot: slotOk });
  });
}

/** latestRoundData() → answer (signed) and updatedAt. Null when malformed. */
export function parseRound(hex: string | null): { answer: bigint; updatedAt: number } | null {
  if (!hex || hex.length < 2 + 64 * 5) return null;
  const w = (i: number) => BigInt(`0x${hex.slice(2 + 64 * i, 2 + 64 * (i + 1))}`);
  const raw = w(1);
  return { answer: raw >= 1n << 255n ? raw - (1n << 256n) : raw, updatedAt: Number(w(3)) };
}

/** The standard (market-hours) feed is preferred; the 24/7 one is used only when no standard feed exists. */
function feedFor(symbol: string): FeedInfo | null {
  const all = FEED_LIST.filter((f) => f.symbol === symbol);
  return all.find((f) => f.kind === "standard") ?? all[0] ?? null;
}

async function readNow(): Promise<AssetBoard> {
  const head = await headBlock().catch(() => null);
  await proveCode();
  const fees = UNISWAP_V3.fees;
  const feeds = LIST.map((c) => feedFor(c.s));
  // 1: supply, feed, pools
  const calls1 = [
    ...LIST.map((c) => ({ to: c.a, data: SEL.totalSupply })),
    ...feeds.map((f) => ({ to: f?.proxy ?? ETH_USD_FEED, data: SEL.latestRoundData })),
    ...LIST.flatMap((c) => fees.map((fee) => ({ to: UNISWAP_V3.factory, data: `${SEL.getPool}${pad(c.a)}${pad(USDG.address)}${pad(fee.toString(16))}` }))),
    { to: ETH_USD_FEED, data: SEL.latestRoundData },
  ];
  const r1 = await multicall(calls1);
  const n = LIST.length;
  const poolAddr = (i: number, k: number) => {
    const v = word(r1[2 * n + i * fees.length + k]);
    return v === null ? null : v === 0n ? "" : `0x${v.toString(16).padStart(40, "0")}`;
  };
  // 2: depth of every pool that exists
  const found: { i: number; k: number; pool: string }[] = [];
  LIST.forEach((_, i) => fees.forEach((_, k) => {
    const p = poolAddr(i, k);
    if (p) found.push({ i, k, pool: p });
  }));
  const r2 = found.length ? await multicall(found.map((f) => ({ to: USDG.address, data: `${SEL.balanceOf}${pad(f.pool)}` }))) : [];
  const now = Math.floor(Date.now() / 1000);
  let complete = head !== null;
  const assets: Asset[] = LIST.map((c, i) => {
    const proof = proofs.get(c.a);
    const supply = word(r1[i]);
    if (!proof || supply === null) complete = false;
    const proven = !!proof && proof.code && proof.slot && supply !== null && supply > 0n;
    const fi = feeds[i];
    const round = fi ? parseRound(r1[n + i]) : null;
    if (fi && !round) complete = false;
    const feed: Feed | null = fi
      ? {
          proxy: fi.proxy,
          kind: fi.kind === "24/7" ? "24/7" : "standard",
          decimals: fi.decimals,
          heartbeat: fi.heartbeat,
          answer: round && round.answer > 0n ? round.answer.toString() : null,
          updatedAt: round ? round.updatedAt : null,
          stale: round ? now - round.updatedAt > fi.heartbeat + GRACE : null,
        }
      : null;
    let pool: Pool | null = null;
    let best = -1n;
    found.forEach((f, j) => {
      if (f.i !== i) return;
      const depth = word(r2[j] ?? null);
      if (depth === null) {
        complete = false;
        return;
      }
      if (depth > best) {
        best = depth;
        pool = { address: f.pool, fee: fees[f.k], usdgDepth: depth.toString() };
      }
    });
    return {
      symbol: c.s,
      name: c.n,
      address: c.a,
      decimals: c.d ?? 18,
      proof: { inList: true, codeHash: proof ? proof.code : null, beacon: proof ? proof.slot : null, supply: supply === null ? null : supply.toString(), proven },
      feed,
      pool,
    };
  });
  const eth = parseRound(r1[r1.length - 1]);
  return { assets, head, readAt: Date.now(), ethUsd: { answer: eth && eth.answer > 0n ? eth.answer.toString() : null, updatedAt: eth?.updatedAt ?? null }, complete };
}

const usable = (b: AssetBoard) => b.assets.some((a) => a.proof.proven && a.feed?.answer);

let cache: { at: number; value: AssetBoard } | null = null;
let inflight: Promise<AssetBoard> | null = null;
let lastFail = 0;
const TTL = 60_000;
const FAIL_GAP = 10_000;

/** One refresh at a time for everyone; the last usable board is served while a failed refresh waits FAIL_GAP. */
export async function readAssets(): Promise<AssetBoard> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  if (cache && Date.now() - lastFail < FAIL_GAP) return cache.value;
  inflight ??= readNow()
    .then((value) => {
      if (usable(value) && value.complete) {
        cache = { at: Date.now(), value };
        return value;
      }
      lastFail = Date.now();
      return cache && !value.complete ? cache.value : value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
