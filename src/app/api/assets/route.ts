import { allowPublic, tooMany } from "@/lib/guard";
import { readAssets } from "@/lib/server/assets";
import { fail, ok } from "@/lib/server/respond";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* GET /api/assets → the supported stock tokens with on-chain proof, Chainlink price and deepest USDG pool (cached 60 s, failures never). */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "assets", 30, 600))) return tooMany();
  try {
    return ok(await readAssets(), 30);
  } catch (e) {
    return fail(e);
  }
}
