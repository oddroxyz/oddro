import { stringToHex } from "viem";
import type { Supported } from "@/config/assets";
import { BITS } from "@/lib/desk/bits";
import { approveTicket, decisionBits, executeBits, proposalBits, reasonsFor, ticketHash, verdictOf, type DeskState, type Reason, type Ticket, type TicketInput, type Verdict } from "@/lib/desk/review";
import { toDesk, type Strategy } from "@/lib/desk/strategy";

/*
 * The scenario run: four tickets an agent could send, each checked by the same rules the contract uses, each turned into a
 * review card. The PK's four cases: within budget, over the cap, the wrong asset, and an order the agent tries to run before
 * you approved it. Passing tickets go to the approval queue; nothing is approved for you.
 */

/** Gas per desk step, from forge (unit tests) and the Robinhood Chain fork test (execute through the real router), 25 Nov 2026. */
export const GAS = { openDesk: 334_071, propose: 238_000, approve: 86_036, reject: 36_477, cancel: 39_297, execute: 239_336 } as const;

export const PRACTICE_DESK = "0x0000000000000000000000000000000000000dd0";
export const PRACTICE_OWNER = "0x00000000000000000000000000000000000a11ce";
export const PRACTICE_AGENT = "0x000000000000000000000000000000000000a6e7";
export const CHAIN_ID = 4663;

export type AssetRef = { symbol: string; address: string };

export type Market = {
  /** Live data for the desk asset, when read; null fields render as "Not known". */
  price: number | null;
  priceStale: boolean | null;
  fee: number | null;
  /** Expected output for the order size from the live quote (asset units). */
  quoteOut: number | null;
};

export type ScenarioId = "within" | "over-cap" | "wrong-asset" | "not-approved";
export const SCENARIOS: { id: ScenarioId; title: string; says: string }[] = [
  { id: "within", title: "Within budget", says: "The agent proposes the scheduled order for the scheduled amount." },
  { id: "over-cap", title: "Over the cap", says: "The agent asks for one and a half times the order size." },
  { id: "wrong-asset", title: "Wrong asset", says: "The agent names a different stock token than the strategy buys." },
  { id: "not-approved", title: "Not approved yet", says: "The agent tries to execute a valid ticket before you approved it." },
];

export type ReviewCard = {
  scenario: ScenarioId;
  ticket: Ticket;
  assetSymbol: string;
  stage: "proposal" | "execution";
  bits: bigint;
  verdict: Verdict;
  reasons: Reason[];
  firedRule: string;
  /** True when the ticket itself is valid and waits in the approval queue. */
  queued: boolean;
};

export function practiceDesk(s: Strategy, assetAddress: string, now: number): DeskState | null {
  const p = toDesk(s);
  if (!p) return null;
  return {
    id: 1,
    owner: PRACTICE_OWNER,
    agent: PRACTICE_AGENT,
    asset: assetAddress,
    quote: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
    fee: 500,
    maxPerTicket: p.maxPerTicket,
    periodCap: p.periodCap,
    periodLength: p.periodLength,
    minGap: p.minGap,
    maxTicketLife: p.maxTicketLife,
    start: now - 60,
    expiry: now + 90 * 86_400,
    lastApprovedAt: 0,
    ruleHash: p.ruleHash,
    paused: false,
    closed: false,
    use: { period: 0, used: 0n },
  };
}

const usdNum = (v: bigint) => Number(v) / 1e6;

/** Minimum received for `amountUsdg`, from the live quote when known, else from the feed price; 0 when neither is known. */
export function minOutFor(amountUsdg: number, slippageBps: number, m: Market, decimals = 18): bigint {
  const expected = m.quoteOut ?? (m.price ? amountUsdg / m.price : null);
  if (!expected || !Number.isFinite(expected)) return 0n;
  const v = expected * (1 - slippageBps / 10_000);
  return BigInt(Math.floor(v * 10 ** Math.min(decimals, 12))) * 10n ** BigInt(Math.max(0, decimals - 12));
}

/** Market reads per scenario: the order size, 1.5 x the order size, and the other asset at the order size. */
export type Markets = { main: Market; over: Market; other: Market };

export function runScenarios(s: Strategy, desk: DeskState, asset: AssetRef, other: AssetRef, mk: Market | Markets, now: number, firstId = 1): ReviewCard[] {
  const m: Markets = "main" in mk ? mk : { main: mk, over: mk, other: mk };
  const amount = s.amount ?? 0;
  const ref = (x: string) => stringToHex(x, { size: 32 });
  const base = (amt: number, a: AssetRef, r: string, mm: Market): TicketInput => ({
    asset: a.address,
    amountIn: BigInt(Math.round(amt * 1e6)),
    minOut: minOutFor(amt, s.slippageBps, mm),
    deadline: now + Math.min(desk.maxTicketLife, s.ticketHours * 3600),
    ruleHash: desk.ruleHash,
    ref: ref(r),
  });
  const fired = `R2 schedule fired: ${s.cadence} buy of ${s.asset}`;
  const inputs: { id: ScenarioId; input: TicketInput; sym: string }[] = [
    { id: "within", input: base(amount, asset, "within-budget", m.main), sym: asset.symbol },
    { id: "over-cap", input: base(amount * 1.5, asset, "over-cap", m.over), sym: asset.symbol },
    { id: "wrong-asset", input: base(amount, other, "wrong-asset", m.other), sym: other.symbol },
    { id: "not-approved", input: base(amount, asset, "early-execute", m.main), sym: asset.symbol },
  ];
  return inputs.map(({ id, input, sym }, k) => {
    const tid = firstId + k;
    const ticket: Ticket = { ...input, id: tid, deskId: desk.id, status: "Proposed", period: 0, proposedAt: now, decidedAt: 0, hash: ticketHash(CHAIN_ID, PRACTICE_DESK, tid, desk.id, input), amountOut: 0n, rejectCode: 0 };
    const pBits = proposalBits(desk, PRACTICE_AGENT, input, now);
    // "not approved": the proposal itself is fine; the agent then calls execute before the owner decided.
    const stage = id === "not-approved" && pBits === 0n ? "execution" : "proposal";
    const bits = stage === "execution" ? executeBits(desk, ticket, now, null) : pBits;
    const ctx = { amount: usdNum(input.amountIn), perTicket: usdNum(desk.maxPerTicket), periodCap: usdNum(desk.periodCap), used: 0, asset: sym, expected: asset.symbol };
    return {
      scenario: id,
      ticket,
      assetSymbol: sym,
      stage,
      bits,
      verdict: verdictOf(bits),
      reasons: reasonsFor(bits, ctx),
      firedRule: fired,
      queued: pBits === 0n,
    };
  });
}

/** The queue decision in practice mode: same checks and state change as the contract's approve(). */
export function practiceApprove(desk: DeskState, t: Ticket, now: number): { ok: true; desk: DeskState; ticket: Ticket } | { ok: false; bits: bigint } {
  const bits = decisionBits(desk, t, now);
  if (bits !== 0n) return { ok: false, bits };
  return { ok: true, ...approveTicket(desk, t, now) };
}

/** Practice execution: no chain, so the received amount is the quote's expectation, labelled as such. */
export function practiceExecute(desk: DeskState, t: Ticket, now: number): { ok: true; ticket: Ticket } | { ok: false; bits: bigint } {
  const bits = executeBits(desk, t, now, null);
  if (bits !== 0n) return { ok: false, bits };
  return { ok: true, ticket: { ...t, status: "Executed", decidedAt: now } };
}

export const isHold = (bits: bigint) => bits !== 0n;
export const NOT_APPROVED = BITS.NOT_APPROVED;
export type { Supported };
