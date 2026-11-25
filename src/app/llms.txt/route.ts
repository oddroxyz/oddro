import { BRAND, CHAIN } from "@/config/brand";
import { CONTRACTS, deskLive } from "@/config/contracts";

export const dynamic = "force-static";

export function GET() {
  const lines = [
    `# ${BRAND.name}`,
    "",
    `> ${BRAND.slogan} ${BRAND.tagline} An order review desk for one periodic-buy strategy of one Robinhood Chain stock token (chain ${CHAIN.id}). A deterministic reader turns plain text into rules and asks clarifying questions; four scenarios (within budget, over cap, wrong asset, not approved) become review cards with the rule that fired, the asset's on-chain proof, the amount, the estimated cost and a Proceed or Hold verdict; passing tickets wait in an approval queue. OddroOrderDesk enforces the same rules on chain: the agent proposes, the owner approves or rejects each ticket (bound to its hash), and an approved ticket executes through Uniswap v3 SwapRouter02 with the output forced to the owner. Non-custodial. Prototype; no token needed. Not affiliated with Robinhood.`,
    "",
    `Desk: ${BRAND.url}/desk`,
    `History: ${BRAND.url}/history`,
    `Method and limits: ${BRAND.url}/method`,
    `Supported assets with proofs (JSON): ${BRAND.url}/api/assets`,
    `Live quote (JSON): ${BRAND.url}/api/quote?asset=NVDA&usdg=50`,
    `Desk activity (JSON): ${BRAND.url}/api/activity?owner=<address> or ?agent=<address>`,
    `OddroOrderDesk (live, source verified): ${deskLive() ? CONTRACTS.desk : "not configured"}`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
