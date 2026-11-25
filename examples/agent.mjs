// Example agent for an Oddro desk. It never approves anything: it reads its desk, asks the contract's own checkTicket, and only
// then proposes one ticket for the owner to review. Deterministic, no AI model.
//
//   RPC=<url> DESK=<OddroOrderDesk address> AGENT_PK=<0x… agent key> node examples/agent.mjs status
//   RPC=… DESK=… AGENT_PK=… node examples/agent.mjs propose --desk 1 [--usdg 50] [--slippage-bps 100] [--asset 0x…]
//   RPC=… DESK=… AGENT_PK=… node examples/agent.mjs execute --ticket 3     (only works once the owner approved ticket 3)
//
// The minimum out comes from the Uniswap v3 QuoterV2 on Robinhood Chain for the desk's pool fee. Exit code 0 = done, 3 = the
// desk would refuse (the reasons are printed), 1 = error.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ART = JSON.parse(readFileSync(new URL("../src/lib/contracts/artifacts.json", import.meta.url), "utf8")).contracts.OddroOrderDesk;
const QUOTER = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7";
const QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [{ name: "p", type: "tuple", components: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "fee", type: "uint24" }, { name: "sqrtPriceLimitX96", type: "uint160" }] }],
    outputs: [{ type: "uint256" }, { type: "uint160" }, { type: "uint32" }, { type: "uint256" }],
  },
];
const BITS = ["UNKNOWN_DESK", "DESK_PAUSED", "DESK_CLOSED", "DESK_EXPIRED", "NOT_AGENT", "WRONG_ASSET", "ZERO_AMOUNT", "OVER_TICKET_CAP", "OVER_PERIOD_CAP", "TOO_SOON", "DEADLINE_PASSED", "DEADLINE_TOO_FAR", "RULES_CHANGED", "NO_MIN_OUT", "NOT_PENDING", "NOT_APPROVED", "LOW_ALLOWANCE", "LOW_BALANCE", "UNKNOWN_TICKET", "TOKEN_UNREADABLE"];
const names = (bits) => BITS.filter((_, i) => (bits >> BigInt(i)) & 1n);

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const { RPC, DESK, AGENT_PK } = process.env;
if (!RPC || !DESK || !AGENT_PK) {
  console.error("Set RPC, DESK and AGENT_PK.");
  process.exit(1);
}
const chain = defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount(AGENT_PK);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ chain, account, transport: http(RPC) });
const desk = (fn, a = []) => pub.readContract({ address: DESK, abi: ART.abi, functionName: fn, args: a });

async function main() {
  if ((await pub.getChainId()) !== 4663) throw new Error("RPC is not Robinhood Chain (4663).");
  if (cmd === "status") {
    const ids = await desk("desksOfAgent", [account.address]);
    console.log(JSON.stringify({ agent: account.address, desks: ids.map(String) }));
    for (const id of ids) {
      const d = await desk("getDesk", [id]);
      const [period, used, left] = await desk("periodUse", [id]);
      console.log(JSON.stringify({ id: String(id), asset: d.asset, perTicket: String(d.maxPerTicket), periodCap: String(d.periodCap), period: String(period), used: String(used), left: String(left), paused: d.paused }));
    }
    return 0;
  }
  if (cmd === "propose") {
    const id = BigInt(opt("--desk", "1"));
    const d = await desk("getDesk", [id]);
    const amountIn = opt("--usdg") ? BigInt(Math.round(Number(opt("--usdg")) * 1e6)) : d.maxPerTicket;
    const asset = opt("--asset", d.asset);
    const slip = BigInt(opt("--slippage-bps", "100"));
    let minOut = 0n;
    try {
      const { result } = await pub.simulateContract({ address: QUOTER, abi: QUOTER_ABI, functionName: "quoteExactInputSingle", args: [{ tokenIn: d.quote, tokenOut: asset, amountIn, fee: d.fee, sqrtPriceLimitX96: 0n }] });
      minOut = (result[0] * (10_000n - slip)) / 10_000n;
    } catch {
      minOut = 0n; // no quote: the desk will refuse with NO_MIN_OUT, and that is the right answer
    }
    const block = await pub.getBlock();
    const deadline = block.timestamp + BigInt(Math.min(d.maxTicketLife, 86_400)) - 60n;
    const input = { asset, amountIn, minOut, deadline, ruleHash: d.ruleHash, ref: stringToHex("agent.mjs", { size: 32 }) };
    const bits = await desk("checkTicket", [id, account.address, input]);
    if (bits !== 0n) {
      console.log(JSON.stringify({ refused: names(bits), bits: String(bits) }));
      return 3;
    }
    const hash = await wallet.writeContract({ address: DESK, abi: ART.abi, functionName: "propose", args: [id, input] });
    const rc = await pub.waitForTransactionReceipt({ hash });
    console.log(JSON.stringify({ proposed: true, tx: hash, status: rc.status, ticketCount: String(await desk("ticketCount")), minOut: String(minOut) }));
    return rc.status === "success" ? 0 : 1;
  }
  if (cmd === "execute") {
    const t = BigInt(opt("--ticket", "0"));
    const bits = await desk("checkExecute", [t]);
    if (bits !== 0n) {
      console.log(JSON.stringify({ refused: names(bits), bits: String(bits) }));
      return 3;
    }
    const hash = await wallet.writeContract({ address: DESK, abi: ART.abi, functionName: "execute", args: [t] });
    const rc = await pub.waitForTransactionReceipt({ hash });
    const tk = await desk("getTicket", [t]);
    console.log(JSON.stringify({ executed: rc.status === "success", tx: hash, amountOut: String(tk.amountOut) }));
    return rc.status === "success" ? 0 : 1;
  }
  console.error("Commands: status | propose --desk <id> [--usdg n] | execute --ticket <id>");
  return 1;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(String(e.shortMessage ?? e.message ?? e).slice(0, 400));
  process.exit(1);
});
