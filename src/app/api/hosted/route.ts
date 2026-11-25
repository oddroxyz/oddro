import { NextResponse } from "next/server";
import { allow, allowPublic, badBody, readBody, tooLarge, tooMany } from "@/lib/guard";
import type { HostedOp } from "@/lib/holder/hosted";
import { usage } from "@/lib/holder/hosted";
import type { SignedSession } from "@/lib/holder/session";
import { readTier, sessionFrom } from "@/lib/server/holder";
import { runOp, storageConfigured } from "@/lib/server/hosted";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/*
 * POST /api/hosted { session, op, ... } → the wallet's hosted desks and saved strategies after the operation.
 * Every call: session verified, tier read on chain (≤ 30 s cache), quota of that tier enforced here, never only in the page.
 */
export async function POST(request: Request) {
  const store = getStore();
  if (!(await allowPublic(store, request, "hosted", 40, 1200))) return tooMany();
  const body = await readBody<{ session?: SignedSession } & HostedOp>(request, 70_000);
  if (!body.ok) return body.tooLarge ? tooLarge() : badBody();
  const s = await sessionFrom(body.value);
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: 401, headers: { "cache-control": "no-store" } });
  if (!(await allow(store, "hosted-wallet", [s.address.toLowerCase()], 30, 60))) return tooMany();
  let tier;
  try {
    tier = await readTier(s.address);
  } catch {
    return NextResponse.json({ error: "The chain could not be reached to read your tier." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  const { session: _session, ...op } = body.value;
  void _session;
  const r = await runOp(s.address, op as HostedOp, tier.quota);
  const meta = { tier: tier.tier, quota: tier.quota, storage: storageConfigured() ? "shared" : "memory" };
  if (!r.ok) return NextResponse.json({ error: r.error, quotaHit: r.quota, ...meta }, { status: r.quota ? 403 : 400, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ ...r.state, usage: usage(r.state), ...meta }, { headers: { "cache-control": "no-store" } });
}
