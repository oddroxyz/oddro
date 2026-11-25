// verify-lib against a fake chain built from this build's artifacts: a true deployment matches; a foreign runtime, another
// router, a wrong chain, extra constructor bytes, a missing tx or a tx for another address each fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROUTER, expectedRuntime, match, verifyDeployment } from "./verify-lib.mjs";

const ART = JSON.parse(readFileSync(new URL("../src/lib/contracts/artifacts.json", import.meta.url), "utf8")).contracts;
const A = (n) => "0x" + n.toString(16).padStart(40, "0");
const DESK = A(0xd35c);
const TX1 = "0x" + "01".repeat(32);
const R = ART.OddroOrderDesk;
const ARG = ROUTER.slice(2).padStart(64, "0");

function chain(over = {}) {
  const codes = { [DESK]: expectedRuntime(ART, ROUTER), [ROUTER]: "0x6080", ...over.codes };
  const txs = { [TX1]: { input: over.input ?? R.creation + ARG, to: over.to ?? null, created: over.created ?? DESK, status: over.status ?? "0x1" } };
  return async (method, params) => {
    if (method === "eth_chainId") return over.chainId ?? "0x1237";
    if (method === "eth_getCode") return codes[params[0].toLowerCase()] ?? "0x";
    if (method === "eth_getTransactionByHash") return txs[params[0]] ? { input: txs[params[0]].input, to: txs[params[0]].to } : null;
    if (method === "eth_getTransactionReceipt") return txs[params[0]] ? { status: txs[params[0]].status, contractAddress: txs[params[0]].created } : null;
    throw new Error(`unexpected ${method}`);
  };
}
const run = (over = {}, args = {}) => verifyDeployment({ desk: DESK, deskTx: TX1, rpc: chain(over), ART, ...args });

test("the desk has exactly one immutable (ROUTER) and matches its own runtime", () => {
  assert.ok(R.immutables.length >= 1);
  assert.ok(R.immutables.every((i) => i.name === "ROUTER" && i.length === 32));
  assert.ok(match(ART, expectedRuntime(ART, ROUTER)));
  assert.equal(match(ART, expectedRuntime(ART, A(7))), false);
});

test("a true deployment matches", async () => {
  const r = await run();
  assert.equal(r.ok, true, r.lines.join("\n"));
});

test("every way to be wrong fails", async () => {
  assert.equal((await run({ chainId: "0x1" })).ok, false);
  assert.equal((await run({ codes: { [DESK]: "0x6000" } })).ok, false);
  assert.equal((await run({ codes: { [DESK]: expectedRuntime(ART, A(9)) } })).ok, false);
  assert.equal((await run({ codes: { [ROUTER]: "0x" } })).ok, false);
  assert.equal((await run({ input: R.creation + ARG + "00" })).ok, false);
  assert.equal((await run({ input: R.creation + A(9).slice(2).padStart(64, "0") })).ok, false);
  assert.equal((await run({ created: A(1) })).ok, false);
  assert.equal((await run({ status: "0x0" })).ok, false);
  assert.equal((await run({ to: A(5) })).ok, false);
  assert.equal((await run({}, { deskTx: undefined })).ok, false);
  assert.equal((await run({}, { desk: "nope" })).ok, false);
  assert.equal((await verifyDeployment({ desk: DESK, deskTx: TX1, rpc: async () => { throw new Error("down"); }, ART })).ok, false);
});
