import { isAddress } from "@/config/brand";

/*
 * Oddro's own contract on Robinhood Chain (chain 4663). Not deployed yet: the owner deploys it from the localhost-only /deploy
 * page. Until then every on-chain panel says so and the desk runs in practice mode on sample data.
 *   desk  OddroOrderDesk (+ internal library OddroTicketMath, inlined): desks per owner and agent, order tickets proposed by the
 *         agent, the owner's manual approve / reject per ticket (bound to the ticket hash), checkTicket / checkDecision /
 *         checkExecute reason bits, execute() of an approved ticket through the Uniswap v3 SwapRouter02 with the output forced
 *         to the owner. No admin, no fee, no upgrade, never holds a balance at rest.
 * After the deploy: paste the address, its block and its creation tx below; `npm run verify-deployment -- --desk <a> --desk-tx <tx>`.
 */
const DEPLOYED = {
  desk: "TBA",
  /** Block of the deployment transaction (log scans start here). */
  block: 0,
  /** Creation transaction. */
  tx: "",
};

/**
 * Local tests only: NEXT_PUBLIC_ODDRO_TEST_CONTRACTS='{"desk":"0x…","block":1}' at build time points a second build at a
 * contract on an anvil chain. Never set it on Vercel.
 */
function testOverride(): typeof DEPLOYED | null {
  const raw = process.env.NEXT_PUBLIC_ODDRO_TEST_CONTRACTS;
  if (!raw) return null;
  try {
    const v = { ...DEPLOYED, ...(JSON.parse(raw) as Partial<typeof DEPLOYED>) };
    return isAddress(v.desk) ? v : null;
  } catch {
    return null;
  }
}

export const CONTRACTS = testOverride() ?? DEPLOYED;
export const deskLive = () => isAddress(CONTRACTS.desk);
export const CONTRACT_NAME = "OddroOrderDesk" as const;
