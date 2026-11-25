import "server-only";
import { decodeFunctionResult, encodeFunctionData, type Abi } from "viem";
import { UNISWAP_V3, USDG } from "@/config/dex";
import { rpc } from "@/lib/server/chainread";

/*
 * A live quote for spending `amount` USDG on one asset through one Uniswap v3 pool: QuoterV2.quoteExactInputSingle as an eth_call
 * (nothing is sent). The answer includes the pool fee. Compared with the Chainlink price on the page, the gap is the cost of
 * buying through the pool right now (fee + price impact + any pool/feed difference). Failures are returned as null, never cached.
 */

const QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [{ name: "params", type: "tuple", components: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "fee", type: "uint24" }, { name: "sqrtPriceLimitX96", type: "uint160" }] }],
    outputs: [{ name: "amountOut", type: "uint256" }, { name: "sqrtPriceX96After", type: "uint160" }, { name: "initializedTicksCrossed", type: "uint32" }, { name: "gasEstimate", type: "uint256" }],
  },
] as const satisfies Abi;

export type Quote = { amountIn: string; amountOut: string; fee: number; gasEstimate: string; readAt: number; quoter: string };

const cache = new Map<string, { at: number; value: Quote }>();
const TTL = 20_000;

export async function quoteBuy(asset: string, amountUsdg: bigint, fee: number): Promise<Quote | null> {
  const key = `${asset}:${amountUsdg}:${fee}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const data = encodeFunctionData({ abi: QUOTER_ABI, functionName: "quoteExactInputSingle", args: [{ tokenIn: USDG.address as `0x${string}`, tokenOut: asset as `0x${string}`, amountIn: amountUsdg, fee, sqrtPriceLimitX96: 0n }] });
  try {
    const raw = await rpc<string>("eth_call", [{ to: UNISWAP_V3.quoterV2, data, gas: "0x2dc6c0" }, "latest"]);
    const [out, , , gas] = decodeFunctionResult({ abi: QUOTER_ABI, functionName: "quoteExactInputSingle", data: raw as `0x${string}` });
    if (out === 0n) return null;
    const value: Quote = { amountIn: amountUsdg.toString(), amountOut: out.toString(), fee, gasEstimate: gas.toString(), readAt: Date.now(), quoter: UNISWAP_V3.quoterV2 };
    if (cache.size > 200) cache.clear();
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}
