import { test } from "node:test";
import assert from "node:assert/strict";
import { BITS } from "@/lib/desk/bits";
import { decisionBits, executeBits, proposalBits, releaseTicket, ticketHash, usedNow, type Ticket } from "@/lib/desk/review";
import { PRACTICE_AGENT, practiceApprove, practiceDesk, runScenarios } from "@/lib/desk/scenarios";
import { readStrategy } from "@/lib/desk/strategy";

const NOW = 1_800_000_000;
const NVDA = { symbol: "NVDA", address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec" };
const AAPL = { symbol: "AAPL", address: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9" };
const s = readStrategy("Buy $50 of NVDA every Monday, at most $120 per week.").strategy;
const market = { price: 180, priceStale: false, fee: 500, quoteOut: 0.27 };

test("the four scenarios give the PK's four outcomes", () => {
  const desk = practiceDesk(s, NVDA.address, NOW)!;
  const cards = runScenarios(s, desk, NVDA, AAPL, market, NOW);
  const by = Object.fromEntries(cards.map((c) => [c.scenario, c]));
  assert.equal(by.within.verdict, "Proceed");
  assert.equal(by.within.queued, true);
  assert.equal(by["over-cap"].bits, BITS.OVER_TICKET_CAP);
  assert.equal(by["wrong-asset"].bits, BITS.WRONG_ASSET);
  assert.equal(by["not-approved"].bits, BITS.NOT_APPROVED);
  assert.equal(by["not-approved"].stage, "execution");
  assert.equal(by["not-approved"].queued, true);
  assert.ok(by["over-cap"].reasons[0].detail?.includes("75 USDG asked"));
});

test("approval reserves the budget, the gap holds the next one, release gives it back", () => {
  let desk = practiceDesk(s, NVDA.address, NOW)!;
  const [a, , , d] = runScenarios(s, desk, NVDA, AAPL, market, NOW);
  const r = practiceApprove(desk, a.ticket, NOW);
  assert.ok(r.ok);
  if (!r.ok) return;
  desk = r.desk;
  assert.equal(usedNow(desk, NOW), 50_000_000n);
  assert.equal(decisionBits(desk, d.ticket, NOW), BITS.TOO_SOON);
  // six days later the gap is over, but this ticket only lived 24 h
  assert.equal(decisionBits(desk, d.ticket, NOW + 6 * 86400), BITS.DEADLINE_PASSED);
  assert.equal(decisionBits(desk, r.ticket, NOW), BITS.NOT_PENDING | BITS.TOO_SOON);
  assert.equal(executeBits(desk, r.ticket, NOW, null), 0n);
  assert.equal(executeBits(desk, r.ticket, NOW, { balance: 1n, allowance: 0n }), BITS.LOW_ALLOWANCE | BITS.LOW_BALANCE);
  assert.equal(usedNow(releaseTicket(desk, r.ticket), NOW), 0n);
});

test("period budget across approvals, and the period rolls over", () => {
  let desk = practiceDesk(s, NVDA.address, NOW)!;
  const t = (id: number, amt: bigint, now: number): Ticket => ({ asset: NVDA.address, amountIn: amt, minOut: 1n, deadline: now + 3600, ruleHash: desk.ruleHash, ref: "0x" + "00".repeat(32), id, deskId: 1, status: "Proposed", period: 0, proposedAt: now, decidedAt: 0, hash: "0x", amountOut: 0n, rejectCode: 0 });
  const r1 = practiceApprove(desk, t(1, 50_000_000n, NOW), NOW);
  assert.ok(r1.ok);
  if (!r1.ok) return;
  desk = { ...r1.desk, minGap: 0 };
  const r2 = practiceApprove(desk, t(2, 50_000_000n, NOW + 10), NOW + 10);
  assert.ok(r2.ok);
  if (!r2.ok) return;
  desk = r2.desk;
  assert.equal(proposalBits(desk, PRACTICE_AGENT, t(3, 50_000_000n, NOW + 20), NOW + 20), BITS.OVER_PERIOD_CAP);
  const later = desk.start + 7 * 86400 + 1;
  assert.equal(proposalBits(desk, PRACTICE_AGENT, t(3, 50_000_000n, later), later), 0n);
});

test("proposal bits mirror the contract's order of checks", () => {
  const desk = practiceDesk(s, NVDA.address, NOW)!;
  const input = { asset: AAPL.address, amountIn: 200_000_000n, minOut: 0n, deadline: NOW + 10 * 86400, ruleHash: "0x" + "11".repeat(32), ref: "0x" + "00".repeat(32) };
  const bits = proposalBits(desk, "0x0000000000000000000000000000000000000001", input, NOW);
  assert.equal(bits, BITS.NOT_AGENT | BITS.WRONG_ASSET | BITS.OVER_TICKET_CAP | BITS.OVER_PERIOD_CAP | BITS.DEADLINE_TOO_FAR | BITS.RULES_CHANGED | BITS.NO_MIN_OUT);
  assert.equal(proposalBits(null, PRACTICE_AGENT, input, NOW), BITS.UNKNOWN_DESK);
  assert.equal(proposalBits({ ...desk, paused: true, closed: true, expiry: NOW - 1 }, PRACTICE_AGENT, { ...input, asset: NVDA.address, amountIn: 1n, minOut: 1n, deadline: NOW - 1, ruleHash: desk.ruleHash }, NOW), BITS.DESK_PAUSED | BITS.DESK_CLOSED | BITS.DESK_EXPIRED | BITS.DEADLINE_PASSED);
});

test("ticket hash matches the value forge computes for the same fields", () => {
  // cast keccak $(cast abi-encode …) of the same fields: keccak256(abi.encode(4663, desk, 1, 1, NVDA, 25e6, 1, 1800086400, keccak256("x"), bytes32("fork")))
  const h = ticketHash(4663, "0x00000000000000000000000000000000000000d5", 1, 1, { asset: NVDA.address, amountIn: 25_000_000n, minOut: 1n, deadline: 1_800_086_400, ruleHash: "0x7521d1cadbcfa91eec65aa16715b94ffc1c9654ba57ea2ef1a2127bca1127a83", ref: "0x666f726b00000000000000000000000000000000000000000000000000000000" });
  assert.equal(h, "0x76c2c96eef4f4bb51c4c464dac779a790baba4bf8b6f45eb75f0d7aa8bca5257");
});
