import { HOLDER_DIVISOR } from "@/config/quota";

/* Tier math, the same on the server and on the page: holder when balance >= totalSupply / 1000, written without division so the
   boundary is exact (balance * 1000 >= supply). Zero supply has no holders. */

export function isHolder(balance: bigint, supply: bigint): boolean {
  if (supply <= 0n || balance <= 0n) return false;
  return balance * HOLDER_DIVISOR >= supply;
}

/** Smallest balance that counts as holder (ceil(supply / 1000)). */
export function threshold(supply: bigint): bigint {
  if (supply <= 0n) return 0n;
  return (supply + HOLDER_DIVISOR - 1n) / HOLDER_DIVISOR;
}

/** Share of supply in basis points, floored (for display). */
export function shareBps(balance: bigint, supply: bigint): number {
  if (supply <= 0n) return 0;
  return Number((balance * 10_000n) / supply);
}
