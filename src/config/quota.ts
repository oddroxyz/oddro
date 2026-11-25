/*
 * Hosted desk quotas, the only place they are written. Enforced on the server (src/lib/server/hosted.ts), shown on /token and /desk.
 * Free = any wallet with a signed session. Holder = balanceOf >= totalSupply / 1000 (0.1 % of supply), read on chain.
 *   desks       hosted desks (a strategy + its practice queue and decisions, saved on the server)
 *   assets      distinct stock tokens across those desks
 *   strategies  saved strategies (text + rules) to reuse later
 */
export const QUOTA = {
  free: { desks: 2, assets: 2, strategies: 3 },
  holder: { desks: 12, assets: 12, strategies: 30 },
} as const;

export type Tier = keyof typeof QUOTA;

/** Holder threshold: 1 / HOLDER_DIVISOR of total supply (0.1 %). */
export const HOLDER_DIVISOR = 1000n;
