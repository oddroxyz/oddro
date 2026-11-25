/*
 * Robinhood Chain (4663) contracts Oddro reads or routes through. Each address was read on chain on 25 Nov 2026 through the
 * official RPC: code present and the cross-checks noted on each line answered as shown. None of them is an Oddro contract.
 */

/** Wrapped ether, 18 decimals (SwapRouter02 WETH9() returns it). */
export const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";

/** Global Dollar (USDG): name() "Global Dollar", symbol() "USDG", decimals() 6, ERC-1967 proxy. The quote token a desk spends.
 *  Many lookalikes use the same symbol; only this address is used. */
export const USDG = { address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", symbol: "USDG", decimals: 6 } as const;

/**
 * Uniswap v3 on Robinhood Chain. SwapRouter02.factory() returns the factory and WETH9() returns WETH; QuoterV2 answers
 * quoteExactInputSingle. Stock-token pools against USDG were found with factory.getPool(token, USDG, fee) and their depth read as
 * USDG.balanceOf(pool) (e.g. NVDA/USDG 0.05 % 0xd4eb21209c4d6093f80b5b84f5c45cc093ea14a3 held about 252,000 USDG on 25 Nov 2026).
 */
export const UNISWAP_V3 = {
  factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
  swapRouter02: "0xcaf681a66d020601342297493863e78c959e5cb2",
  quoterV2: "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7",
  fees: [100, 500, 3000, 10000] as const,
} as const;

/** Chainlink ETH / USD standard proxy on Robinhood Chain, 8 decimals (description() "ETH / USD"). */
export const ETH_USD_FEED = "0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9";

/** Chainlink feed directory the stock feeds were matched from (stock-feeds.json). */
export const FEED_DIRECTORY = "https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json";

/**
 * Robinhood's stock tokens are BeaconProxy contracts pointing at one beacon. Oddro lists an asset only when
 *   - its address is in the vetted list (every BeaconUpgraded(beacon) emitter, src/lib/fixtures/stock-tokens.json),
 *   - keccak256 of its runtime code equals STOCK_PROXY_CODEHASH,
 *   - its ERC-1967 beacon slot holds STOCK_BEACON, and
 *   - its totalSupply() is above zero (minting needs a role only Robinhood's keys hold).
 * A ticker alone proves nothing: dozens of tokens on the chain copy stock tickers.
 */
export const STOCK_BEACON = "0xe10b6f6b275de231345c20d14ab812db62151b00";
export const STOCK_PROXY_CODEHASH = "0x6c1fdd40002dcb440c7fff6a84171404d279ccb057803b65826f7546acd65630";
export const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

/** Multicall3 at its usual address (code confirmed on Robinhood Chain). */
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
