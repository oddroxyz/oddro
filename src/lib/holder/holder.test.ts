import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { QUOTA } from "@/config/quota";
import { applyOp, EMPTY_STATE, usage, type HostedState } from "@/lib/holder/hosted";
import { allowedOrigins, newSession, parseSession, sessionMessage, verifySession } from "@/lib/holder/session";
import { isHolder, shareBps, threshold } from "@/lib/holder/tier";
import { deriveAlerts } from "@/lib/alerts";
import type { Activity } from "@/lib/server/activity";

const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const other = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const NOW = 1_800_000_000;
const sign = async (message: string, by = acct) => ({ message, signature: await by.signMessage({ message }) });

const N = "a1b2c3d4e5f60718293a4b5c";
const msg = (o: Partial<{ domain: string; uri: string; chainId: number; issuedAt: number; expiresAt: number }> = {}) =>
  sessionMessage({ domain: "oddro.xyz", uri: "https://oddro.xyz", address: acct.address, chainId: 4663, nonce: N, issuedAt: NOW, expiresAt: NOW + 3600, ...o });

test("session: a SIWE message for oddro.xyz signed by the wallet passes; local hosts only outside a deployment", async () => {
  const m = newSession("oddro.xyz", "https://oddro.xyz", acct.address, NOW, 3600, N);
  assert.match(m, /^oddro\.xyz wants you to sign in with your Ethereum account:\n0x/);
  assert.match(m, /\nVersion: 1\nChain ID: 4663\n/);
  const r = await verifySession(await sign(m), NOW + 10);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.address, acct.address);
  const local = newSession("localhost:6720", "http://localhost:6720", acct.address, NOW, 3600, N);
  assert.equal((await verifySession(await sign(local), NOW, allowedOrigins(true))).ok, true);
  assert.equal((await verifySession(await sign(local), NOW, allowedOrigins(false))).ok, false);
  assert.equal((await verifySession(await sign(newSession("localhost:3000", "http://localhost:3000", acct.address, NOW, 3600, N)), NOW, allowedOrigins(true))).ok, false);
});

test("session: foreign domain, spoofed host, URI mismatch, non-SIWE text, expired, > 4 h, wrong chain, other signer, edited are refused", async () => {
  // a phishing site's message: refused whatever Host header the request carries (verification never reads headers)
  assert.equal((await verifySession(await sign(msg({ domain: "evil.example", uri: "https://evil.example" })), NOW)).ok, false);
  // the right domain but another URI (a page elsewhere pretending to be oddro.xyz)
  assert.equal((await verifySession(await sign(msg({ uri: "https://evil.example" })), NOW)).ok, false);
  // plain text that is not this site's SIWE layout
  assert.equal((await verifySession(await sign("I agree to sign in to oddro.xyz"), NOW)).ok, false);
  const good = await sign(msg());
  assert.equal((await verifySession(good, NOW + 3600)).ok, false); // expired
  assert.equal((await verifySession(good, NOW + 90_000)).ok, false); // replay long after expiry
  assert.equal((await verifySession(await sign(msg({ expiresAt: NOW + 4 * 3600 + 1 })), NOW)).ok, false); // > 4 h
  assert.equal((await verifySession(await sign(msg({ chainId: 1 })), NOW)).ok, false);
  assert.equal((await verifySession(await sign(msg(), other), NOW)).ok, false);
  assert.equal((await verifySession(await sign(msg() + "\nResources: everything"), NOW)).ok, false);
  assert.equal((await verifySession(await sign(msg({ issuedAt: NOW + 3600, expiresAt: NOW + 7000 })), NOW)).ok, false); // future
  assert.equal((await verifySession(null, NOW)).ok, false);
  assert.ok(parseSession(msg()));
  assert.equal(parseSession("hello"), null);
});

test("tier: exactly 0.1 % is holder, one wei under is not, zero supply has no holders", () => {
  const supply = 1_000_000n * 10n ** 18n;
  assert.equal(isHolder(supply / 1000n, supply), true);
  assert.equal(isHolder(supply / 1000n - 1n, supply), false);
  assert.equal(isHolder(5n, 0n), false);
  assert.equal(isHolder(0n, 10n), false);
  assert.equal(threshold(1001n), 2n); // ceil
  assert.equal(isHolder(1n, 1001n), false);
  assert.equal(isHolder(2n, 1001n), true);
  assert.equal(shareBps(supply / 1000n, supply), 10);
});

test("quota: free tier stops at 2 desks / 2 assets / 3 strategies, holder goes further, edits always allowed", () => {
  let s: HostedState = EMPTY_STATE;
  const desk = (id: string, asset: string) => ({ op: "save-desk" as const, desk: { id, name: id, asset, strategy: {}, queue: [] } });
  for (const [id, a] of [["d-001", "NVDA"], ["d-002", "AAPL"]]) {
    const r = applyOp(s, desk(id, a), QUOTA.free);
    assert.ok(r.ok);
    if (r.ok) s = r.state;
  }
  const third = applyOp(s, desk("d-003", "NVDA"), QUOTA.free);
  assert.equal(third.ok, false);
  if (!third.ok) assert.equal(third.quota, true);
  const swap = applyOp(s, desk("d-002", "TSLA"), QUOTA.free); // editing an existing desk to a new asset: still 2 assets
  assert.ok(swap.ok);
  const holder = applyOp(s, desk("d-003", "MSFT"), QUOTA.holder);
  assert.ok(holder.ok);
  if (holder.ok) assert.deepEqual(usage(holder.state), { desks: 3, assets: 3, strategies: 0 });
  assert.equal(applyOp(s, desk("x", "NVDA"), QUOTA.free).ok, false); // bad id
  assert.equal(applyOp(s, desk("d-009", "FAKE"), QUOTA.holder).ok, false); // unsupported asset
  let t = s;
  for (let i = 0; i < 3; i++) {
    const r = applyOp(t, { op: "save-strategy", strategy: { id: `s-00${i}`, name: "x", text: "Buy $50 of NVDA weekly", strategy: {} } }, QUOTA.free);
    assert.ok(r.ok);
    if (r.ok) t = r.state;
  }
  assert.equal(applyOp(t, { op: "save-strategy", strategy: { id: "s-009", name: "x", text: "", strategy: {} } }, QUOTA.free).ok, false);
  const del = applyOp(t, { op: "delete-strategy", id: "s-000" }, QUOTA.free);
  assert.ok(del.ok && del.state.strategies.length === 2);
});

test("alerts: waiting, expiring, executed, approved-but-expired, paused, rejected for the agent", () => {
  const t = (id: number, status: string, deadline: number) => ({ id, deskId: 1, status, asset: "0x", amountIn: "50000000", minOut: "1", amountOut: "0", deadline, proposedAt: NOW - 100, decidedAt: 0, period: 0, rejectCode: 0, ruleHash: "0x", ref: "0x", hash: "0x", bits: null });
  const ev = (name: string, ticketId: number | null, args: Record<string, string> = {}) => ({ name, deskId: 1, ticketId, block: 10, tx: "0xabc", logIndex: 0, args });
  const owner = {
    deployed: true, desk: "0x", head: 1, desks: [], scanned: null,
    tickets: [t(1, "Proposed", NOW + 86400), t(2, "Approved", NOW + 600), t(3, "Approved", NOW - 5)],
    events: [ev("TicketExecuted", 4, { amountIn: "50000000", amountOut: "330000000000000000" }), ev("DeskPaused", null)],
  } as unknown as Activity;
  const agent = { ...owner, tickets: [], events: [ev("TicketRejected", 5, { reasonCode: "1" })] } as unknown as Activity;
  const ids = deriveAlerts(owner, agent, NOW).map((a) => a.id).sort();
  assert.deepEqual(ids, ["executed:4", "expiring:2", "failed:3", "paused:1:10", "rejected:5", "waiting:1"].sort());
  assert.deepEqual(deriveAlerts(null, null, NOW), []);
});
