import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BITS, BIT_ORDER, BIT_WORDS, KNOWN_MASK, bitNames } from "@/lib/desk/bits";

const SOL = readFileSync(new URL("../../../contracts/src/OddroTicketMath.sol", import.meta.url), "utf8");

test("every bit matches OddroTicketMath.sol, and the .sol has no bit the site lacks", () => {
  const found = [...SOL.matchAll(/uint256 internal constant R_([A-Z_]+) = 1 << (\d+);/g)].map((m) => [m[1], BigInt(m[2])] as const);
  assert.equal(found.length, BIT_ORDER.length);
  for (const [name, shift] of found) {
    assert.ok(name in BITS, `site lacks ${name}`);
    assert.equal(BITS[name as keyof typeof BITS], 1n << shift, name);
  }
});

test("every bit has words, and names decode in order", () => {
  for (const n of BIT_ORDER) assert.ok(BIT_WORDS[n].label && BIT_WORDS[n].why);
  assert.deepEqual(bitNames(BITS.DESK_PAUSED | BITS.OVER_PERIOD_CAP), ["DESK_PAUSED", "OVER_PERIOD_CAP"]);
  assert.equal(KNOWN_MASK, (1n << 20n) - 1n);
});
