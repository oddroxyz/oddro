import { MemoryKV } from "@/lib/memkv";

/*
 * Signed-out session nonces in bounded memory (used when no shared store is configured). revoke() says whether the nonce was
 * stored: when the memory is full it returns false, and the caller must NOT report a successful sign-out (fail closed: the user is
 * told the session stays valid until its own expiry, and the browser drops its copy anyway).
 */
export class RevocationList {
  constructor(private readonly kv: MemoryKV) {}

  revoke(nonce: string, expiresAt: number, now = Math.floor(Date.now() / 1000)): boolean {
    return this.kv.set(`r:${nonce}`, "1", Math.max(1, expiresAt - now));
  }

  isRevoked(nonce: string): boolean {
    return this.kv.get(`r:${nonce}`) !== null;
  }
}
