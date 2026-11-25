import { NextResponse } from "next/server";
import { allow, allowPublic, badBody, readBody, tooLarge, tooMany } from "@/lib/guard";
import type { SignedSession } from "@/lib/holder/session";
import { readTier, revoke, sessionFrom } from "@/lib/server/holder";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/*
 * POST /api/holder { session: { message, signature } } → the wallet's tier, read on chain now (cached ≤ 30 s per wallet).
 * The signed SIWE session is verified on every call (signature, allowlisted domain + URI, chain 4663, expiry ≤ 4 h, not signed
 * out). { signOut: true } signs the session out for good. No server secret.
 */
export async function POST(request: Request) {
  const store = getStore();
  if (!(await allowPublic(store, request, "holder", 30, 900))) return tooMany();
  const body = await readBody<{ session?: SignedSession; fresh?: boolean; signOut?: boolean }>(request, 4096);
  if (!body.ok) return body.tooLarge ? tooLarge() : badBody();
  const s = await sessionFrom(body.value);
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: 401, headers: { "cache-control": "no-store" } });
  if (!(await allow(store, "holder-wallet", [s.address.toLowerCase()], 20, 60))) return tooMany();
  if (body.value.signOut) {
    if (!(await revoke(s.nonce, s.expiresAt))) {
      const until = new Date(s.expiresAt * 1000).toISOString().replace("T", " ").slice(0, 16);
      return NextResponse.json({ signedOut: false, error: `The sign-out could not be recorded on the server right now. This tab dropped the session, but a copy of it would stay valid until ${until} UTC.` }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ signedOut: true }, { headers: { "cache-control": "no-store" } });
  }
  try {
    const tier = await readTier(s.address, Boolean(body.value.fresh));
    return NextResponse.json({ ...tier, sessionExpiresAt: s.expiresAt }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The chain could not be reached." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
