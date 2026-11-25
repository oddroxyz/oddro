"use client";

import { useCallback, useEffect, useState } from "react";
import { storageKey } from "@/config/storage";
import { useWallet } from "@/components/wallet/WalletProvider";
import { newSession, parseSession, type SignedSession } from "@/lib/holder/session";
import type { TierRead } from "@/lib/server/holder";

/*
 * The holder session in the browser: one signed message kept in sessionStorage (gone when the tab closes), sent with every holder
 * request. The server checks it each time; this hook only stores it and reads the tier.
 */

const KEY = storageKey("holder", "session");
export type TierAnswer = TierRead & { sessionExpiresAt: number };

function readStored(address: string | null): SignedSession | null {
  if (!address) return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SignedSession;
    const f = parseSession(s.message);
    if (!f || f.address.toLowerCase() !== address.toLowerCase() || f.expiresAt <= Date.now() / 1000) return null;
    return s;
  } catch {
    return null;
  }
}

export function useHolder() {
  const { address, signMessage } = useWallet();
  const [session, setSession] = useState<SignedSession | null>(null);
  const [tier, setTier] = useState<TierAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTier = useCallback(async (s: SignedSession, fresh = false) => {
    const r = await fetch("/api/holder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: s, fresh }) });
    const b = await r.json().catch(() => null);
    if (!r.ok) {
      setError(b?.error ?? `Request failed (${r.status}).`);
      if (r.status === 401) {
        setSession(null);
        try {
          window.sessionStorage.removeItem(KEY);
        } catch {}
      }
      return;
    }
    setError(null);
    setTier(b as TierAnswer);
  }, []);

  useEffect(() => {
    const s = readStored(address);
    // Restores this tab's session for the connected wallet; the tier read happens after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(s);
    setTier(null);
    if (s) fetchTier(s);
  }, [address, fetchTier]);

  const sign = useCallback(async () => {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const message = newSession(window.location.host, window.location.origin, address);
      const signature = await signMessage(message);
      const s = { message, signature };
      try {
        window.sessionStorage.setItem(KEY, JSON.stringify(s));
      } catch {}
      setSession(s);
      await fetchTier(s, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The wallet did not sign.");
    } finally {
      setBusy(false);
    }
  }, [address, signMessage, fetchTier]);

  const signOut = useCallback(() => {
    // Tell the server first, so this signed message can never be used again (best effort; the tab copy is dropped either way).
    if (session)
      fetch("/api/holder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session, signOut: true }) })
        .then(async (r) => {
          if (!r.ok) setError(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "The sign-out could not be recorded; the session stays valid until it expires.");
        })
        .catch(() => setError("The sign-out could not reach the server; the session stays valid until it expires."));
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {}
    setSession(null);
    setTier(null);
  }, [session]);

  /** A hosted-desk operation with the session attached. */
  const hosted = useCallback(
    async (op: Record<string, unknown>) => {
      if (!session) throw new Error("Sign in first.");
      const r = await fetch("/api/hosted", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session, ...op }) });
      const b = await r.json().catch(() => ({ error: `Request failed (${r.status}).` }));
      return { ok: r.ok, status: r.status, body: b };
    },
    [session],
  );

  return { address, session, tier, busy, error, sign, signOut, refresh: () => session && fetchTier(session, true), hosted };
}
