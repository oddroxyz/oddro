import { isAddress } from "@/config/brand";
import { allowPublic, tooMany } from "@/lib/guard";
import { readActivity, type Activity } from "@/lib/server/activity";
import { bad, fail, ok } from "@/lib/server/respond";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/*
 * GET /api/activity?owner=0x… | ?agent=0x… → desks, tickets and desk events for that wallet. Rate limited; a complete answer is kept
 * 8 s per key (skipped with ?fresh=1), an incomplete scan or a failure is never cached.
 */
const cache = new Map<string, { at: number; value: Activity }>();
const TTL = 8_000;

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const owner = q.get("owner") ?? "";
  const agent = q.get("agent") ?? "";
  if (!(isAddress(owner) || isAddress(agent)) || (owner && agent)) return bad("Give ?owner=0x… or ?agent=0x… (one of them).");
  const key = owner ? `o:${owner.toLowerCase()}` : `a:${agent.toLowerCase()}`;
  // ?fresh=1 after the visitor's own transaction: skip the short cache (still rate limited).
  const hit = q.get("fresh") ? null : cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return ok(hit.value, 5);
  if (!(await allowPublic(getStore(), request, "activity", 30, 1200))) return tooMany();
  try {
    const value = await readActivity(owner ? { owner } : { agent });
    if (!value.scanned || value.scanned.complete) {
      if (cache.size > 300) cache.clear();
      cache.set(key, { at: Date.now(), value });
    }
    return ok(value, 5);
  } catch (e) {
    return fail(e);
  }
}
