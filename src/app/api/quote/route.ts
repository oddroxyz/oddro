import { SUPPORTED } from "@/config/assets";
import { allowPublic, tooMany } from "@/lib/guard";
import { readAssets } from "@/lib/server/assets";
import { quoteBuy } from "@/lib/server/quote";
import { bad, ok } from "@/lib/server/respond";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/*
 * GET /api/quote?asset=NVDA&usdg=50 → a live QuoterV2 quote for that buy through the asset's deepest USDG pool.
 * Only supported assets (resolved to their proven address on the server) and 1–100,000 USDG; anything else is refused.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const sym = (q.get("asset") ?? "").toUpperCase();
  const usdg = Number(q.get("usdg"));
  if (!(SUPPORTED as readonly string[]).includes(sym)) return bad("Unknown asset.");
  if (!Number.isFinite(usdg) || usdg < 1 || usdg > 100_000) return bad("usdg must be between 1 and 100000.");
  if (!(await allowPublic(getStore(), request, "quote", 40, 800))) return tooMany();
  const board = await readAssets().catch(() => null);
  const a = board?.assets.find((x) => x.symbol === sym);
  if (!a || !a.proof.proven || !a.pool) return ok({ asset: sym, quote: null, reason: "No proven asset or pool right now." }, 10);
  const quote = await quoteBuy(a.address, BigInt(Math.round(usdg * 1e6)), a.pool.fee);
  return ok({ asset: sym, address: a.address, decimals: a.decimals, pool: a.pool, quote }, 10);
}
