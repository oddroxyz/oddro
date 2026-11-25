/*
 * Reason bits, the same positions as contracts/src/OddroTicketMath.sol (bits.test.ts reads the .sol and compares).
 * Every check returns a bitmask: 0 means the desk would accept; every set bit is one reason a card says "Hold".
 */

export const BITS = {
  UNKNOWN_DESK: 1n << 0n,
  DESK_PAUSED: 1n << 1n,
  DESK_CLOSED: 1n << 2n,
  DESK_EXPIRED: 1n << 3n,
  NOT_AGENT: 1n << 4n,
  WRONG_ASSET: 1n << 5n,
  ZERO_AMOUNT: 1n << 6n,
  OVER_TICKET_CAP: 1n << 7n,
  OVER_PERIOD_CAP: 1n << 8n,
  TOO_SOON: 1n << 9n,
  DEADLINE_PASSED: 1n << 10n,
  DEADLINE_TOO_FAR: 1n << 11n,
  RULES_CHANGED: 1n << 12n,
  NO_MIN_OUT: 1n << 13n,
  NOT_PENDING: 1n << 14n,
  NOT_APPROVED: 1n << 15n,
  LOW_ALLOWANCE: 1n << 16n,
  LOW_BALANCE: 1n << 17n,
  UNKNOWN_TICKET: 1n << 18n,
  TOKEN_UNREADABLE: 1n << 19n,
} as const;

export type BitName = keyof typeof BITS;
export const BIT_ORDER = Object.keys(BITS) as BitName[];
export const KNOWN_MASK = BIT_ORDER.reduce((m, n) => m | BITS[n], 0n);

/** Short label for chips, one sentence for the card, and the rule line it belongs to. */
export const BIT_WORDS: Record<BitName, { label: string; why: string }> = {
  UNKNOWN_DESK: { label: "Unknown desk", why: "There is no desk with this number." },
  DESK_PAUSED: { label: "Desk paused", why: "The desk is paused (by you, or by the agent itself). Nothing moves until you unpause." },
  DESK_CLOSED: { label: "Desk closed", why: "The desk was closed for good. Open tickets can only be cancelled." },
  DESK_EXPIRED: { label: "Desk expired", why: "The desk's end date has passed." },
  NOT_AGENT: { label: "Not the agent", why: "Only the agent address named on the desk may propose tickets." },
  WRONG_ASSET: { label: "Wrong asset", why: "The ticket names a different token than the one asset this strategy buys." },
  ZERO_AMOUNT: { label: "Zero amount", why: "The ticket spends nothing." },
  OVER_TICKET_CAP: { label: "Over ticket cap", why: "The amount is above the most one order may spend." },
  OVER_PERIOD_CAP: { label: "Over period budget", why: "Approving it would spend more than the budget for this period." },
  TOO_SOON: { label: "Too soon", why: "The last approved order was too recent for the schedule's minimum gap." },
  DEADLINE_PASSED: { label: "Deadline passed", why: "The ticket's deadline is already behind us." },
  DEADLINE_TOO_FAR: { label: "Deadline too far", why: "The ticket asks to stay open longer than the desk allows." },
  RULES_CHANGED: { label: "Rules changed", why: "The ticket was written for another version of the rules." },
  NO_MIN_OUT: { label: "No minimum out", why: "The ticket has no minimum amount to receive, so price protection is missing." },
  NOT_PENDING: { label: "Already decided", why: "This ticket was already approved, rejected, cancelled, expired or executed." },
  NOT_APPROVED: { label: "Not approved", why: "You have not approved this ticket. Nothing executes without your approval." },
  LOW_ALLOWANCE: { label: "Low allowance", why: "Your wallet has not allowed the desk to spend enough of the quote token." },
  LOW_BALANCE: { label: "Low balance", why: "Your wallet holds less of the quote token than the ticket spends." },
  UNKNOWN_TICKET: { label: "Unknown ticket", why: "There is no ticket with this number." },
  TOKEN_UNREADABLE: { label: "Token unreadable", why: "The quote token's balance or allowance could not be read." },
};

export function bitNames(mask: bigint): BitName[] {
  return BIT_ORDER.filter((n) => (mask & BITS[n]) !== 0n);
}

/** Bits that only matter when an approved ticket is executed (the wallet is read then). */
export const FUNDS_MASK = BITS.LOW_ALLOWANCE | BITS.LOW_BALANCE | BITS.TOKEN_UNREADABLE;
