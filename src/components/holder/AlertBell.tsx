"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { explorerTx } from "@/config/brand";
import { deskLive } from "@/config/contracts";
import { storageKey } from "@/config/storage";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useLocalStore } from "@/components/wallet/useLocalStore";
import { deriveAlerts, unread, type Alert } from "@/lib/alerts";
import type { Activity } from "@/lib/server/activity";

/*
 * Level 1: the bell inbox, computed from the desk contract for the connected wallet (owner and agent) since the last visit
 * (alerts you have not opened are counted). Level 2: browser notifications while a tab of this site is open, after "Enable".
 * Free for everyone. No email, no push service: when every tab is closed, nothing is sent.
 */

export const LOCAL_ALERTS = storageKey("alerts", "local");
const POLL = 30_000;

async function activity(role: "owner" | "agent", address: string): Promise<Activity | null> {
  const r = await fetch(`/api/activity?${role}=${address}`, { cache: "no-store" }).catch(() => null);
  return r && r.ok ? ((await r.json()) as Activity) : null;
}

export function AlertBell() {
  const { address } = useWallet();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useLocalStore<string[]>(storageKey("alerts", "seen", (address ?? "none").toLowerCase()), []);
  const [notified, setNotified] = useLocalStore<string[]>(storageKey("alerts", "notified", (address ?? "none").toLowerCase()), []);
  const [local] = useLocalStore<Alert[]>(LOCAL_ALERTS, []);
  const [perm, setPerm] = useState<string>("unsupported");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reads the browser's notification permission once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPerm(typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
  }, []);

  useEffect(() => {
    if (!address || !deskLive()) return;
    let dead = false;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      const [o, a] = await Promise.all([activity("owner", address), activity("agent", address)]);
      if (!dead) setAlerts(deriveAlerts(o, a, Math.floor(Date.now() / 1000)));
    };
    load();
    const t = setInterval(load, POLL);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [address]);

  const all = useMemo(() => [...local, ...alerts].sort((x, y) => y.at - x.at), [local, alerts]);
  const fresh = unread(all, seen);

  // Level 2: one browser notification per new alert, only while this tab is open and only after the visitor enabled it.
  useEffect(() => {
    if (perm !== "granted") return;
    const todo = fresh.filter((a) => !notified.includes(a.id));
    if (!todo.length) return;
    for (const a of todo.slice(0, 3)) {
      try {
        new Notification(`Oddro: ${a.title}`, { body: a.detail, tag: a.id });
      } catch {
        // some browsers only allow notifications from a service worker; the bell still shows them
      }
    }
    setNotified((n) => [...n, ...todo.map((a) => a.id)].slice(-300));
  }, [fresh, notified, perm, setNotified]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  if (!address) return null;
  return (
    <div className="relative" ref={box}>
      <button type="button" className="rq-iconbtn relative" aria-label={`Alerts, ${fresh.length} new`} aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="bell">
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M4 7a4 4 0 0 1 8 0v3l1.2 2H2.8L4 10z" />
          <path d="M6.5 13.5a1.6 1.6 0 0 0 3 0" />
        </svg>
        {fresh.length ? (
          <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--neon)] px-1 text-[10.5px] font-semibold text-black" data-testid="bell-count">
            {fresh.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="rq-menu right-0 top-[52px] !absolute w-[min(330px,calc(100vw-32px))]" role="dialog" aria-label="Alerts" data-testid="bell-panel">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-medium">Alerts</p>
            <button type="button" className="text-[12px] text-[var(--muted)] hover:text-[var(--neon)]" onClick={() => setSeen(all.map((a) => a.id).slice(-300))}>
              Mark all read
            </button>
          </div>
          {!deskLive() ? <p className="mt-2 text-[12.5px] text-[var(--muted)]">Alerts start when the desk contract is deployed.</p> : null}
          <ul className="mt-2 grid max-h-[320px] gap-1 overflow-y-auto">
            {all.length ? (
              all.slice(0, 30).map((a) => (
                <li key={a.id} className={`rounded-[8px] px-2 py-1.5 ${seen.includes(a.id) ? "opacity-60" : "bg-white/5"}`} data-testid={`alert-${a.kind}`}>
                  <p className="text-[13px]">{a.title}</p>
                  <p className="text-[12px] text-[var(--muted)]">
                    {a.detail}{" "}
                    {a.tx ? (
                      <a className="elink" href={explorerTx(a.tx)} target="_blank" rel="noreferrer">
                        tx
                      </a>
                    ) : null}
                  </p>
                </li>
              ))
            ) : (
              <li className="text-[12.5px] text-[var(--muted)]">Nothing yet.</li>
            )}
          </ul>
          <div className="mt-2 border-t border-[var(--line)] pt-2 text-[12px] text-[var(--muted)]">
            {perm === "granted" ? (
              "Browser notifications on while a tab of this site is open."
            ) : perm === "denied" ? (
              "Browser notifications are blocked in this browser's settings."
            ) : perm === "unsupported" ? (
              "This browser has no notifications; the bell still works."
            ) : (
              <button type="button" className="rq-btn w-full" data-testid="enable-notifications" onClick={async () => setPerm(await Notification.requestPermission())}>
                Enable browser notifications
              </button>
            )}
            <p className="mt-1">Free for everyone. Nothing is sent when no tab is open: no email, no push service.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
