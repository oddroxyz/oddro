import "server-only";
import { EMPTY_STATE, MAX_STATE_BYTES, applyOp, type HostedOp, type HostedState, type OpResult } from "@/lib/holder/hosted";
import type { QUOTA, Tier } from "@/config/quota";
import { getStore } from "@/lib/server/store";
import { MemoryKV } from "@/lib/memkv";

/*
 * Server storage of hosted desks: the shared store (kv-gateway / Redis REST) when configured, else this instance's memory, which
 * the page announces as "Not configured: saved data may be lost on restart". One JSON value per wallet; writes for one wallet are
 * serialized in this instance. Export / import JSON always works.
 */

/** Instance memory when no shared store: at most 2,000 wallets and 16 MB, each entry kept 30 days. */
const memory = new MemoryKV(2000, 16_000_000);
const TTL = 30 * 86400;
/** Shared store: kept 180 days after the last save. */
const STORE_TTL = 180 * 86400;
const chains = new Map<string, Promise<unknown>>();
const key = (wallet: string) => `hosted:v1:${wallet.toLowerCase()}`;

export const storageConfigured = () => getStore() !== null;

async function load(wallet: string): Promise<HostedState> {
  const st = getStore();
  const raw = st ? await st.get(key(wallet)) : memory.get(key(wallet));
  if (!raw) return EMPTY_STATE;
  try {
    const v = JSON.parse(raw) as HostedState;
    return Array.isArray(v.desks) && Array.isArray(v.strategies) ? v : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

async function save(wallet: string, s: HostedState) {
  const raw = JSON.stringify(s);
  if (raw.length > MAX_STATE_BYTES) throw new Error("too large");
  const st = getStore();
  if (st) await st.setEx(key(wallet), raw, STORE_TTL);
  else if (!memory.set(key(wallet), raw, TTL)) throw new Error("full");
}

/** Runs one operation for a wallet under its tier's quota; writes run one at a time per wallet in this instance. */
export async function runOp(wallet: string, op: HostedOp, quota: (typeof QUOTA)[Tier]): Promise<OpResult> {
  const k = wallet.toLowerCase();
  const prev = chains.get(k) ?? Promise.resolve();
  const next = prev.then(async () => {
    const s = await load(wallet);
    const r = applyOp(s, op, quota);
    if (r.ok && r.changed) {
      try {
        await save(wallet, r.state);
      } catch {
        return { ok: false, error: "Not saved: the data is over 64 KB for this wallet, or this server's temporary memory is full.", quota: true } as OpResult;
      }
    }
    return r;
  });
  chains.set(k, next.catch(() => {}));
  return next;
}
