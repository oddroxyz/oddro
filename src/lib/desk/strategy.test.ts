import { test } from "node:test";
import assert from "node:assert/strict";
import { complete, readStrategy, ruleLines, toDesk, buysPer } from "@/lib/desk/strategy";

test("a clear strategy reads without questions", () => {
  const r = readStrategy("Buy $50 of NVDA every Monday, at most $200 per month.");
  assert.equal(r.strategy.asset, "NVDA");
  assert.equal(r.strategy.amount, 50);
  assert.equal(r.strategy.cadence, "weekly");
  assert.equal(r.strategy.weekday, 1);
  assert.equal(r.strategy.periodCap, 200);
  assert.equal(r.strategy.periodUnit, "month");
  assert.deepEqual(r.questions, []);
  assert.ok(complete(r.strategy));
});

test("company names map to one asset; two assets ask which one", () => {
  assert.equal(readStrategy("buy 25 usdg of apple weekly, max $100 a month").strategy.asset, "AAPL");
  const r = readStrategy("buy $20 of NVDA and TSLA every week");
  assert.equal(r.strategy.asset, null);
  assert.ok(r.questions.some((q) => q.id === "many-assets" && q.options.length === 2));
});

test("missing pieces become questions, never guesses", () => {
  const r = readStrategy("buy some nvidia");
  const ids = r.questions.map((q) => q.id);
  assert.ok(ids.includes("amount"));
  assert.ok(ids.includes("cadence"));
  assert.equal(r.strategy.amount, null);
  assert.equal(complete(r.strategy), false);
});

test("no budget written: the reader offers one instead of assuming it", () => {
  const r = readStrategy("Buy $40 of SPY every day");
  assert.equal(r.strategy.periodCap, null);
  const q = r.questions.find((x) => x.id === "budget");
  assert.ok(q);
  assert.equal(q!.options[0].patch.periodCap, 40 * 7);
});

test("a cap without a period asks week or month; a cap below one order is a conflict", () => {
  assert.ok(readStrategy("Buy $50 of META weekly, at most $150").questions.some((q) => q.id === "budget"));
  assert.ok(readStrategy("Buy $500 of META weekly, at most $100 a week").questions.some((q) => q.id === "conflict"));
});

test("price conditions and selling are flagged as unsupported", () => {
  const ids = readStrategy("buy $50 of TSLA every week when the price drops, sell at 10% profit, max $200 a month").questions.map((q) => q.id);
  assert.ok(ids.includes("condition"));
  assert.ok(ids.includes("sell"));
});

test("desk parameters and rule hash are deterministic", () => {
  const s = readStrategy("Buy $50 of NVDA every Monday, at most $200 per month.").strategy;
  const a = toDesk(s)!;
  const b = toDesk({ ...s })!;
  assert.equal(a.ruleHash, b.ruleHash);
  assert.equal(a.maxPerTicket, 50_000_000n);
  assert.equal(a.periodCap, 200_000_000n);
  assert.equal(a.periodLength, 30 * 86400);
  assert.equal(a.minGap, 6 * 86400);
  assert.notEqual(toDesk({ ...s, amount: 51 })!.ruleHash, a.ruleHash);
  assert.equal(ruleLines(s).length, 7);
  assert.equal(buysPer("weekly", "month"), 4);
});
