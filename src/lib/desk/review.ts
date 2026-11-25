import { encodeAbiParameters, keccak256 } from "viem";
import { BITS, BIT_WORDS, bitNames, type BitName } from "@/lib/desk/bits";

/*
 * The review engine: the same rules as OddroOrderDesk (_proposalBits, _decisionBits, _executeBits), written for the browser so
 * practice mode and the cards say exactly what the contract would say. review.test.ts walks every rule; the E2E compares the
 * site's bits with the contract's checkTicket on a fork.
 */

export type Status = "Proposed" | "Approved" | "Rejected" | "Cancelled" | "Expired" | "Executed";

export type DeskState = {
  id: number;
  owner: string;
  agent: string;
  asset: string;
  quote: string;
  fee: number;
  maxPerTicket: bigint;
  periodCap: bigint;
  periodLength: number;
  minGap: number;
  maxTicketLife: number;
  start: number;
  expiry: number;
  lastApprovedAt: number;
  ruleHash: string;
  paused: boolean;
  closed: boolean;
  /** Stored (period, used) pair, as the contract keeps it. */
  use: { period: number; used: bigint };
};

export type TicketInput = { asset: string; amountIn: bigint; minOut: bigint; deadline: number; ruleHash: string; ref: string };
export type Ticket = TicketInput & { id: number; deskId: number; status: Status; period: number; proposedAt: number; decidedAt: number; hash: string; amountOut: bigint; rejectCode: number };

export const periodOf = (start: number, len: number, t: number) => (t <= start || len === 0 ? 0 : Math.floor((t - start) / len));
export const usedNow = (d: DeskState, now: number) => (d.use.period === periodOf(d.start, d.periodLength, now) ? d.use.used : 0n);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function deskBits(d: DeskState | null, now: number): bigint {
  if (!d) return BITS.UNKNOWN_DESK;
  let b = 0n;
  if (d.closed) b |= BITS.DESK_CLOSED;
  if (d.paused) b |= BITS.DESK_PAUSED;
  if (now > d.expiry) b |= BITS.DESK_EXPIRED;
  return b;
}

function amountBits(amount: bigint, cap: bigint, periodCap: bigint, used: bigint): bigint {
  if (amount === 0n) return BITS.ZERO_AMOUNT;
  let b = 0n;
  if (amount > cap) b |= BITS.OVER_TICKET_CAP;
  if (used > periodCap || amount > periodCap - used) b |= BITS.OVER_PERIOD_CAP;
  return b;
}

const gapBits = (d: DeskState, now: number) => (d.lastApprovedAt === 0 || d.minGap === 0 ? 0n : now < d.lastApprovedAt + d.minGap ? BITS.TOO_SOON : 0n);

/** checkTicket(deskId, proposer, input). */
export function proposalBits(d: DeskState | null, proposer: string, t: TicketInput, now: number): bigint {
  let b = deskBits(d, now);
  if (!d || b & BITS.UNKNOWN_DESK) return b;
  if (!same(proposer, d.agent)) b |= BITS.NOT_AGENT;
  if (!same(t.asset, d.asset)) b |= BITS.WRONG_ASSET;
  b |= amountBits(t.amountIn, d.maxPerTicket, d.periodCap, usedNow(d, now));
  b |= gapBits(d, now);
  if (t.deadline < now) b |= BITS.DEADLINE_PASSED;
  else if (t.deadline - now > d.maxTicketLife) b |= BITS.DEADLINE_TOO_FAR;
  if (t.ruleHash.toLowerCase() !== d.ruleHash.toLowerCase()) b |= BITS.RULES_CHANGED;
  if (t.minOut === 0n) b |= BITS.NO_MIN_OUT;
  return b;
}

function ticketBits(d: DeskState, t: Ticket, now: number): bigint {
  let b = deskBits(d, now);
  if (t.deadline < now) b |= BITS.DEADLINE_PASSED;
  if (t.ruleHash.toLowerCase() !== d.ruleHash.toLowerCase()) b |= BITS.RULES_CHANGED;
  if (!same(t.asset, d.asset)) b |= BITS.WRONG_ASSET;
  return b;
}

/** checkDecision(ticketId): would the owner's approve() succeed now. */
export function decisionBits(d: DeskState, t: Ticket, now: number): bigint {
  let b = ticketBits(d, t, now);
  if (t.status !== "Proposed") b |= BITS.NOT_PENDING;
  if (t.amountIn > d.maxPerTicket) b |= BITS.OVER_TICKET_CAP;
  b |= amountBits(t.amountIn, d.maxPerTicket, d.periodCap, usedNow(d, now)) & BITS.OVER_PERIOD_CAP;
  b |= gapBits(d, now);
  return b;
}

/** checkExecute(ticketId). `wallet` = the owner's quote balance and allowance to the desk, null when unread (practice). */
export function executeBits(d: DeskState, t: Ticket, now: number, wallet: { balance: bigint; allowance: bigint } | null): bigint {
  let b = ticketBits(d, t, now);
  if (t.status !== "Approved") b |= BITS.NOT_APPROVED;
  if (t.minOut === 0n) b |= BITS.NO_MIN_OUT;
  if (wallet) {
    if (wallet.allowance < t.amountIn) b |= BITS.LOW_ALLOWANCE;
    if (wallet.balance < t.amountIn) b |= BITS.LOW_BALANCE;
  }
  return b;
}

/** The contract's ticket hash: keccak256(abi.encode(chainid, desk, ticketId, deskId, asset, amountIn, minOut, deadline, ruleHash, ref)). */
export function ticketHash(chainId: number, desk: string, ticketId: number, deskId: number, t: TicketInput): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "bytes32" }, { type: "bytes32" }],
      [BigInt(chainId), desk as `0x${string}`, BigInt(ticketId), BigInt(deskId), t.asset as `0x${string}`, t.amountIn, t.minOut, BigInt(t.deadline), t.ruleHash as `0x${string}`, t.ref as `0x${string}`],
    ),
  );
}

// ------------------------------------------------------------------ state changes (practice desk), same as the contract

export function approveTicket(d: DeskState, t: Ticket, now: number): { desk: DeskState; ticket: Ticket } {
  const p = periodOf(d.start, d.periodLength, now);
  const used = usedNow(d, now) + t.amountIn;
  return { desk: { ...d, use: { period: p, used }, lastApprovedAt: now }, ticket: { ...t, status: "Approved", period: p, decidedAt: now } };
}

export function releaseTicket(d: DeskState, t: Ticket): DeskState {
  if (t.status !== "Approved" || d.use.period !== t.period) return d;
  return { ...d, use: { period: d.use.period, used: d.use.used - t.amountIn } };
}

// ------------------------------------------------------------------ the card

export type Verdict = "Proceed" | "Hold";
export type Reason = { bit: BitName; label: string; why: string; detail: string | null };

export type Cost = {
  /** Gas for the next on-chain step(s), in ETH and USD; null = not known. */
  gasEth: number | null;
  gasUsd: number | null;
  gasUnits: number;
  /** Pool fee tier in percent and in USDG for this amount; null when no pool was found. */
  feePct: number | null;
  feeUsdg: number | null;
  /** Expected output from the live quote, and its gap to the Chainlink price (includes the fee). */
  quoteOut: number | null;
  impactPct: number | null;
  source: string;
};

export type Card = { verdict: Verdict; bits: bigint; reasons: Reason[] };

/** Plain reasons with the numbers that made each bit fire. */
export function reasonsFor(bits: bigint, ctx: { amount: number; perTicket: number; periodCap: number; used: number; asset: string; expected: string; gapLeftH?: number }): Reason[] {
  return bitNames(bits).map((bit) => {
    let detail: string | null = null;
    if (bit === "OVER_TICKET_CAP") detail = `${ctx.amount} USDG asked, ${ctx.perTicket} USDG allowed per order.`;
    if (bit === "OVER_PERIOD_CAP") detail = `${ctx.used} of ${ctx.periodCap} USDG already approved this period; ${ctx.amount} more would pass the budget.`;
    if (bit === "WRONG_ASSET") detail = `Ticket names ${ctx.asset}; the strategy buys ${ctx.expected}.`;
    if (bit === "TOO_SOON" && ctx.gapLeftH !== undefined) detail = `${ctx.gapLeftH.toFixed(1)} h left before the next order may be approved.`;
    return { bit, label: BIT_WORDS[bit].label, why: BIT_WORDS[bit].why, detail };
  });
}

export const verdictOf = (bits: bigint): Verdict => (bits === 0n ? "Proceed" : "Hold");
