/*
 * The assets a desk may buy. A short, fixed list on purpose (one strategy, one asset, PK): Robinhood stock tokens that have
 *   - a Chainlink price feed on Robinhood Chain (stock-feeds.json), and
 *   - a Uniswap v3 pool against USDG with depth (read live; the deepest fee tier is used).
 * Addresses come from the vetted list in src/lib/fixtures/stock-tokens.json and are re-proven on chain before they are shown
 * (src/lib/server/assets.ts). A symbol here is only a lookup key: identity is the address plus the on-chain proof.
 */
export const SUPPORTED = ["NVDA", "AAPL", "TSLA", "MSFT", "AMZN", "GOOGL", "META", "SPY", "QQQ", "AMD", "PLTR", "COIN"] as const;
export type Supported = (typeof SUPPORTED)[number];

/** The asset the practice desk starts with. */
export const DEFAULT_ASSET: Supported = "NVDA";

/** Vetted addresses (stock-tokens.json), used as lookup keys before the live board answers; the board re-proves each one. */
export const ADDRESSES: Record<Supported, string> = {
  NVDA: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", // NVIDIA
  AAPL: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9", // Apple
  TSLA: "0x322f0929c4625ed5bad873c95208d54e1c003b2d", // Tesla
  MSFT: "0xe93237c50d904957cf27e7b1133b510c669c2e74", // Microsoft
  AMZN: "0x12f190a9f9d7d37a250758b26824b97ce941bf54", // Amazon
  GOOGL: "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3", // Alphabet Class A
  META: "0xc0d6457c16cc70d6790dd43521c899c87ce02f35", // Meta Platforms
  SPY: "0x117cc2133c37b721f49de2a7a74833232b3b4c0c", // SPDR S&P 500 ETF Trust
  QQQ: "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68", // Invesco QQQ
  AMD: "0x86923f96303d656e4aa86d9d42d1e57ad2023fdc", // AMD
  PLTR: "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a", // Palantir Technologies
  COIN: "0x6330d8c3178a418788df01a47479c0ce7ccf450b", // Coinbase
};
