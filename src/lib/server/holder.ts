import "server-only";
import { holderToken } from "@/config/contracts";
import { QUOTA, type Tier } from "@/config/quota";
import { isHolder, shareBps, threshold } from "@/lib/holder/tier";
import { verifySession, type SignedSession } from "@/lib/holder/session";
import { headBlock, multicall } from "@/lib/server/chainread";
import { getStore } from "@/lib/server/store";
import { MemoryKV } from "@/lib/memkv";
import { RevocationList } from "@/lib/holder/revoke";

/*
 * The holder tier, read on chain at each holder action: balanceOf(wallet) and totalSupply() of the token in one multicall at the
 * current head, cached at most 30 s per wallet. A failed read is never cached and never grants the holder tier.
 */

export type TierRead = {
  /** False before the token exists: the holder tier then "unlocks at launch". */
  live: boolean;
  token: string | null;
  wallet: string;
  tier: Tier;
  balance: string | null;
  supply: string | null;
  threshold: string | null;
  shareBps: number | null;
  block: number | null;
  checkedAt: number;
  quota: (typeof QUOTA)[Tier];
  error?: string;
};

const pad = (a: string) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const word = (hex: string | null) => (hex && hex.length >= 66 ? BigInt(hex.slice(0, 66)) : null);
const cache = new Map<string, { at: number; value: TierRead }>();
const TTL = 30_000;

export async function readTier(wallet: string, fresh = false): Promise<TierRead> {
  const token = holderToken();
  const base = { token, wallet, checkedAt: Date.now() };
  if (!token) return { ...base, live: false, tier: "free", balance: null, supply: null, threshold: null, shareBps: null, block: null, quota: QUOTA.free };
  const key = `${token}:${wallet.toLowerCase()}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.value;
  const [block, r] = await Promise.all([headBlock().catch(() => null), multicall([{ to: token, data: `0x70a08231${pad(wallet)}` }, { to: token, data: "0x18160ddd" }])]);
  const bal = word(r[0]);
  const sup = word(r[1]);
  if (bal === null || sup === null) {
    return { ...base, live: true, tier: "free", balance: null, supply: null, threshold: null, shareBps: null, block, quota: QUOTA.free, error: "The token could not be read right now; the free tier applies." };
  }
  const tier: Tier = isHolder(bal, sup) ? "holder" : "free";
  const value: TierRead = { ...base, live: true, tier, balance: bal.toString(), supply: sup.toString(), threshold: threshold(sup).toString(), shareBps: shareBps(bal, sup), block, quota: QUOTA[tier] };
  if (cache.size > 2000) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/*
 * Replay guard: "Sign out" sends the session once more; its nonce is then remembered as signed out until the session's own
 * expiry (shared store when configured, else bounded instance memory), and every later request with it is refused. Within its
 * ≤ 4 h life an unrevoked session is a bearer credential kept in one tab; hosted-desk writes it allows only change that wallet's
 * own saved desks under that wallet's own quota.
 */
const revokedMem = new RevocationList(new MemoryKV(20_000, 4_000_000));
const rkey = (nonce: string) => `holder:revoked:${nonce}`;

/** True only when the sign-out was really recorded; false = the session stays valid until its expiry. */
export async function revoke(nonce: string, expiresAt: number): Promise<boolean> {
  const st = getStore();
  if (!st) return revokedMem.revoke(nonce, expiresAt);
  try {
    await st.setEx(rkey(nonce), "1", Math.max(1, expiresAt - Math.floor(Date.now() / 1000)));
    return true;
  } catch {
    return false;
  }
}

async function isRevoked(nonce: string) {
  const st = getStore();
  return st ? (await st.get(rkey(nonce))) !== null : revokedMem.isRevoked(nonce);
}

/** Verifies the signed session in a request body (domain and URI against the fixed allowlist, never request headers). */
export async function sessionFrom(body: { session?: SignedSession } | null) {
  const s = await verifySession(body?.session);
  if (s.ok && (await isRevoked(s.nonce))) return { ok: false as const, error: "This session was signed out. Sign in again." };
  return s;
}
