// Checks behind scripts/verify-deployment.mjs, free of I/O so they can be tested with a fake chain.
//
// How it decides that an address runs this repository's OddroOrderDesk:
//   - The desk has one immutable, ROUTER, set from its single constructor argument. It must be the Uniswap v3 SwapRouter02
//     on Robinhood Chain (ROUTER below, read on chain 25 Nov 2026); any other router is a FAIL.
//   - Runtime code is compared byte for byte with src/lib/contracts/artifacts.json after writing that router into the
//     immutable's byte ranges (`npm run contracts:artifacts -- --check` proves the file is a fresh forge build).
//   - The creation transaction is required (no tx => FAIL, never MATCH). It must have succeeded, created exactly the address
//     checked, have no recipient, and carry exactly this build's creation code followed by abi.encode(ROUTER).
// Every check fails closed: an RPC error, an empty or malformed answer is a FAIL, never a skip.

export const CHAIN_ID = 4663;
export const NAME = "OddroOrderDesk";
/** Uniswap v3 SwapRouter02 on Robinhood Chain (factory() = 0x1f7d…2efa, WETH9() = 0x0bd7…ad73). */
export const ROUTER = "0xcaf681a66d020601342297493863e78c959e5cb2";

const isAddr = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
const isHex = (v) => typeof v === "string" && /^0x([0-9a-fA-F]{2})*$/.test(v);
const isTx = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const word = (addr) => addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");

/** This build's runtime with `router` written into the ROUTER immutable ranges (hex, with 0x). */
export function expectedRuntime(ART, router) {
  const a = ART[NAME];
  if (!a) return null;
  const imm = a.immutables;
  if (imm.length === 0 || imm.some((i) => i.name !== "ROUTER" || i.length !== 32)) return null;
  let hex = a.runtime.slice(2);
  for (const i of imm) hex = hex.slice(0, i.start * 2) + word(router) + hex.slice((i.start + i.length) * 2);
  return `0x${hex}`;
}

/** True when `code` is this build's runtime with ROUTER = `router`. */
export function match(ART, code, router = ROUTER) {
  const want = expectedRuntime(ART, router);
  return want !== null && String(code).toLowerCase() === want;
}

/** input: { desk, deskTx, rpc, ART }. Returns { ok, lines }. */
export async function verifyDeployment({ desk, deskTx, rpc, ART }) {
  const lines = [];
  let failed = false;
  const ok = (m) => lines.push(`OK   ${m}`);
  const fail = (m) => {
    failed = true;
    lines.push(`FAIL ${m}`);
  };
  const done = () => ({ ok: !failed, lines });

  try {
    const id = await rpc("eth_chainId", []);
    if (Number(BigInt(id)) !== CHAIN_ID) {
      fail(`chain id ${id}, expected ${CHAIN_ID}`);
      return done();
    }
    ok(`chain id ${CHAIN_ID} (Robinhood Chain)`);
  } catch (e) {
    fail(`chain id unreadable: ${e.message}`);
    return done();
  }
  if (!isAddr(desk)) {
    fail("give --desk <address>");
    return done();
  }
  try {
    const c = await rpc("eth_getCode", [desk, "latest"]);
    if (!isHex(c) || c.length <= 2) throw new Error(`no code at ${desk}`);
    if (match(ART, c)) ok(`${NAME} at ${desk}: runtime matches this build with ROUTER = ${ROUTER}`);
    else fail(`${NAME} at ${desk}: runtime differs from this build (or its ROUTER is not ${ROUTER})`);
  } catch (e) {
    fail(`${NAME}: ${e.message}`);
  }
  try {
    const r = await rpc("eth_getCode", [ROUTER, "latest"]);
    if (isHex(r) && r.length > 2) ok(`router ${ROUTER} has code`);
    else fail(`router ${ROUTER} has no code on this chain`);
  } catch (e) {
    fail(`router code unreadable: ${e.message}`);
  }
  if (!isTx(deskTx)) {
    fail(`${NAME}: no valid creation tx given; runtime alone is not a full match`);
    return done();
  }
  try {
    const [t, rc] = await Promise.all([rpc("eth_getTransactionByHash", [deskTx]), rpc("eth_getTransactionReceipt", [deskTx])]);
    const want = (ART[NAME].creation + word(ROUTER)).toLowerCase();
    if (!t || !rc) fail(`${NAME}: creation tx ${deskTx} not found`);
    else if (rc.status !== "0x1") fail(`${NAME}: creation tx failed`);
    else if (!same(rc.contractAddress, desk)) fail(`${NAME}: tx created ${rc.contractAddress}, not ${desk}`);
    else if (t.to) fail(`${NAME}: tx has a recipient, not a deployment`);
    else if (String(t.input).toLowerCase() === want) ok(`${NAME}: creation input is exactly this build's creation code + abi.encode(ROUTER)`);
    else fail(`${NAME}: creation input differs from this build + abi.encode(ROUTER)`);
  } catch (e) {
    fail(`${NAME}: creation tx unreadable: ${e.message}`);
  }
  return done();
}
