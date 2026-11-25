import { BRAND, isAddress } from "@/config/brand";

/*
 * Oddro's own contract on Robinhood Chain (chain 4663), deployed by the owner on 25 Nov 2026 (block 122888907, 3,411,190 gas).
 * Check it yourself: `npm run verify-deployment -- --desk <address> --desk-tx <tx>` (values below) prints MATCH.
 *   desk  OddroOrderDesk (+ internal library OddroTicketMath, inlined): desks per owner and agent, order tickets proposed by the
 *         agent, the owner's manual approve / reject per ticket (bound to the ticket hash), checkTicket / checkDecision /
 *         checkExecute reason bits, execute() of an approved ticket through the Uniswap v3 SwapRouter02 with the output forced
 *         to the owner. No admin, no fee, no upgrade, never holds a balance at rest.
 */
const DEPLOYED = {
  desk: "0xfe0cf0b102d1a04c562234369e27661b514f55fb",
  /** Block of the deployment transaction (log scans start here). */
  block: 122888907,
  /** Creation transaction. */
  tx: "0x29b6c7f2a36fb62fc45a2e905527d12bf0054ddda1eb361df501cb1988d79ea7",
  /** Local tests only (via the override below): a test ERC-20 standing in for $ODDRO on an anvil chain. Empty in production. */
  token: "",
};

/**
 * Local tests only: NEXT_PUBLIC_ODDRO_TEST_CONTRACTS='{"desk":"0x…","block":1,"token":"0x…"}' at build time points a second build at a
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

/**
 * The token the holder tier reads: the real $ODDRO once BRAND.ca is an address; before launch only the local test token (anvil
 * E2E) and otherwise null ("Unlocks at launch").
 */
export function holderToken(): `0x${string}` | null {
  if (isAddress(CONTRACTS.token)) return CONTRACTS.token;
  return isAddress(BRAND.ca) ? BRAND.ca : null;
}
