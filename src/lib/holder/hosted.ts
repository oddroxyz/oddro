import { SUPPORTED } from "@/config/assets";
import type { QUOTA, Tier } from "@/config/quota";

/*
 * Hosted desk data of one wallet and the operations on it, pure so the quota rules are unit tested. The server
 * (src/lib/server/hosted.ts) loads the wallet's state, applies one operation with the wallet's tier quota, and saves the result.
 * A hosted desk = a strategy + its practice queue snapshot, so the same desk opens on any device after signing in.
 */

export type HostedDesk = { id: string; name: string; asset: string; strategy: unknown; queue: unknown; savedAt: number };
export type HostedStrategy = { id: string; name: string; text: string; strategy: unknown; savedAt: number };
export type HostedState = { desks: HostedDesk[]; strategies: HostedStrategy[] };
export type HostedOp =
  | { op: "list" }
  | { op: "save-desk"; desk: Omit<HostedDesk, "savedAt"> }
  | { op: "delete-desk"; id: string }
  | { op: "save-strategy"; strategy: Omit<HostedStrategy, "savedAt"> }
  | { op: "delete-strategy"; id: string }
  | { op: "import"; state: HostedState };
export type OpResult = { ok: true; state: HostedState; changed: boolean } | { ok: false; error: string; quota: boolean };

export const EMPTY_STATE: HostedState = { desks: [], strategies: [] };
/** Largest serialized state per wallet. */
export const MAX_STATE_BYTES = 64_000;
const ID = /^[a-z0-9-]{4,40}$/;
const clean = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, " ").slice(0, n) : "");

export const assetsOf = (desks: HostedDesk[]) => new Set(desks.map((d) => d.asset));

export function usage(s: HostedState) {
  return { desks: s.desks.length, assets: assetsOf(s.desks).size, strategies: s.strategies.length };
}

/** Applies one operation under `quota`. Changing or deleting existing items is always allowed; only growth is limited. */
export function applyOp(state: HostedState, o: HostedOp, quota: (typeof QUOTA)[Tier], now = Date.now()): OpResult {
  const s: HostedState = { desks: [...state.desks], strategies: [...state.strategies] };
  if (o.op === "list") return { ok: true, state: s, changed: false };
  if (o.op === "delete-desk" || o.op === "delete-strategy") {
    const before = s.desks.length + s.strategies.length;
    if (o.op === "delete-desk") s.desks = s.desks.filter((x) => x.id !== o.id);
    else s.strategies = s.strategies.filter((x) => x.id !== o.id);
    return { ok: true, state: s, changed: s.desks.length + s.strategies.length !== before };
  }
  if (o.op === "save-desk") {
    const d = o.desk;
    if (!d || !ID.test(d.id) || !(SUPPORTED as readonly string[]).includes(d.asset)) return { ok: false, error: "Invalid desk.", quota: false };
    const i = s.desks.findIndex((x) => x.id === d.id);
    const next: HostedDesk = { id: d.id, name: clean(d.name, 60) || d.asset, asset: d.asset, strategy: d.strategy ?? null, queue: d.queue ?? null, savedAt: now };
    if (i < 0 && s.desks.length >= quota.desks) return { ok: false, error: `Desk limit reached: ${quota.desks} hosted desks on this tier.`, quota: true };
    const others = s.desks.filter((x) => x.id !== d.id);
    if (!assetsOf(others).has(d.asset) && assetsOf(others).size >= quota.assets) return { ok: false, error: `Asset limit reached: ${quota.assets} different assets on this tier.`, quota: true };
    if (i < 0) s.desks.push(next);
    else s.desks[i] = next;
    return { ok: true, state: s, changed: true };
  }
  if (o.op === "save-strategy") {
    const t = o.strategy;
    if (!t || !ID.test(t.id)) return { ok: false, error: "Invalid strategy.", quota: false };
    const i = s.strategies.findIndex((x) => x.id === t.id);
    if (i < 0 && s.strategies.length >= quota.strategies) return { ok: false, error: `Strategy limit reached: ${quota.strategies} saved strategies on this tier.`, quota: true };
    const next: HostedStrategy = { id: t.id, name: clean(t.name, 60) || "Strategy", text: clean(t.text, 400), strategy: t.strategy ?? null, savedAt: now };
    if (i < 0) s.strategies.push(next);
    else s.strategies[i] = next;
    return { ok: true, state: s, changed: true };
  }
  if (o.op === "import") {
    const inc = o.state;
    if (!inc || !Array.isArray(inc.desks) || !Array.isArray(inc.strategies)) return { ok: false, error: "Invalid import file.", quota: false };
    let cur: HostedState = s;
    for (const d of inc.desks) {
      const r = applyOp(cur, { op: "save-desk", desk: d }, quota, now);
      if (!r.ok) return r;
      cur = r.state;
    }
    for (const t of inc.strategies) {
      const r = applyOp(cur, { op: "save-strategy", strategy: t }, quota, now);
      if (!r.ok) return r;
      cur = r.state;
    }
    return { ok: true, state: cur, changed: true };
  }
  return { ok: false, error: "Unknown operation.", quota: false };
}
