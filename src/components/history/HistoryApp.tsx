"use client";

import { useEffect, useState } from "react";
import { ADDRESSES, SUPPORTED, type Supported } from "@/config/assets";
import { explorerAddress, explorerTx, isAddress, shortAddress } from "@/config/brand";
import { CONTRACTS, deskLive } from "@/config/contracts";
import { storageKey } from "@/config/storage";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useLocalStore } from "@/components/wallet/useLocalStore";
import { LiveStrip } from "@/components/home/LiveFacts";
import { BIT_WORDS, bitNames } from "@/lib/desk/bits";
import type { Activity } from "@/lib/server/activity";

/*
 * Decision history. On chain: the desks of one wallet (owner or agent), their tickets with the check the contract gives right now,
 * and every desk event from the logs with its transaction. Practice: the log the desk keeps in this browser. Both say which is which.
 */

type LogEntry = { at: number; clock: number; ticket: number; what: string; detail: string };
const usd = (raw: string) => (Number(raw) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });
const sym = (a: string) => SUPPORTED.find((s) => ADDRESSES[s as Supported] === a.toLowerCase()) ?? shortAddress(a);
const EVENT_TONE: Record<string, string> = { TicketExecuted: "ok", TicketApproved: "ok", DeskOpened: "ok", TicketRejected: "hold", TicketCancelled: "hold", TicketExpired: "hold", DeskPaused: "hold", DeskClosed: "hold", TicketProposed: "wait", RulesUpdated: "wait", DeskUnpaused: "ok" };

export function HistoryApp() {
  const { address } = useWallet();
  const [who, setWho] = useState("");
  const [role, setRole] = useState<"owner" | "agent">("owner");
  const [act, setAct] = useState<Activity | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [log] = useLocalStore<LogEntry[]>(storageKey("desk", "log"), []);
  const target = isAddress(who) ? who : address;

  useEffect(() => {
    if (!deskLive() || !target) return;
    let dead = false;
    const run = async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/activity?${role}=${target}`, { cache: "no-store" });
        const b = await r.json();
        if (dead) return;
        if (!r.ok) setErr(b.error ?? "Could not read the desk.");
        else {
          setAct(b);
          setErr(null);
        }
      } catch {
        if (!dead) setErr("Network error.");
      } finally {
        if (!dead) setLoading(false);
      }
    };
    run();
    const t = setInterval(() => document.visibilityState === "visible" && run(), 20_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [target, role]);

  return (
    <div className="grid gap-6">
      <div className="panel panel-pad">
        <LiveStrip />
      </div>
      <section className="panel panel-pad" data-testid="history-chain">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="display text-[24px] leading-[30px]">On-chain decisions</h2>
          <span className="badge live">
            <i aria-hidden="true" /> From the desk contract&apos;s logs
          </span>
        </div>
        {!deskLive() ? (
          <p className="note mt-4" data-testid="history-off">
            No OddroOrderDesk address is configured on this build, so there is no on-chain history to read.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="field min-w-[260px] flex-1">
                <span>Wallet (empty = the connected one)</span>
                <input className="inp num" value={who} onChange={(e) => setWho(e.target.value.trim())} placeholder={address ?? "0x…"} data-testid="history-wallet" />
              </label>
              <div className="seg" role="group" aria-label="Role">
                {(["owner", "agent"] as const).map((r) => (
                  <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)}>
                    as {r}
                  </button>
                ))}
              </div>
            </div>
            {!target ? <p className="mt-4 text-[14px] text-[var(--muted)]">Connect a wallet or paste an address.</p> : null}
            {err ? <p className="rq-alert mt-4">{err}</p> : null}
            {loading && !act ? <p className="mt-4 text-[14px] text-[var(--muted)]">Reading the desk…</p> : null}
            {act ? (
              <div className="mt-5 grid gap-5">
                <p className="text-[13px] text-[var(--muted)]">
                  Desk contract{" "}
                  <a className="elink num" href={explorerAddress(CONTRACTS.desk)} target="_blank" rel="noreferrer">
                    {CONTRACTS.desk}
                  </a>{" "}
                  · read to block <span className="num">{act.head?.toLocaleString("en-US") ?? "?"}</span>
                  {act.scanned && !act.scanned.complete ? <span className="text-[var(--warn)]"> · log scan incomplete ({act.scanned.gaps.length} gaps), refresh to retry</span> : null}
                </p>
                <div className="overflow-x-auto">
                  <table className="tbl" data-testid="history-tickets">
                    <thead>
                      <tr>
                        <th>Ticket</th>
                        <th>Desk</th>
                        <th>Asset</th>
                        <th>USDG</th>
                        <th>Status</th>
                        <th>Received</th>
                        <th>Check now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {act.tickets.map((t) => {
                        const bits = t.bits ? BigInt(t.bits) : 0n;
                        return (
                          <tr key={t.id}>
                            <td className="num">#{t.id}</td>
                            <td className="num">{t.deskId}</td>
                            <td>{sym(t.asset)}</td>
                            <td className="num">{usd(t.amountIn)}</td>
                            <td>{t.status}</td>
                            <td className="num">{t.status === "Executed" ? (Number(t.amountOut) / 1e18).toFixed(6) : "—"}</td>
                            <td>{t.bits === null ? "—" : bits === 0n ? <span className="chip dot ok">Proceed</span> : <span className="chip dot hold">{bitNames(bits).map((n) => BIT_WORDS[n].label).join(", ")}</span>}</td>
                          </tr>
                        );
                      })}
                      {!act.tickets.length ? (
                        <tr>
                          <td colSpan={7} className="text-[var(--muted)]">
                            No tickets for this wallet as {role}.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <ol className="grid gap-2" data-testid="history-events">
                  {act.events.map((e) => (
                    <li key={`${e.tx}:${e.logIndex}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2 text-[13px]">
                      <span>
                        <span className={`chip dot ${EVENT_TONE[e.name] ?? ""}`}>{e.name}</span> desk {e.deskId}
                        {e.ticketId !== null ? ` · ticket #${e.ticketId}` : ""}
                        {e.args.amountOut ? ` · received ${(Number(e.args.amountOut) / 1e18).toFixed(6)}` : ""}
                        {e.args.reasonCode ? ` · code ${e.args.reasonCode}` : ""}
                      </span>
                      <a className="elink num" href={explorerTx(e.tx)} target="_blank" rel="noreferrer">
                        block {e.block.toLocaleString("en-US")}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </>
        )}
      </section>
      <section className="panel panel-pad" data-testid="history-practice">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="display text-[24px] leading-[30px]">Practice log</h2>
          <span className="badge sample">Sample data · this browser only</span>
        </div>
        {log.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Event</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {log.slice(0, 60).map((e, i) => (
                  <tr key={i}>
                    <td className="num">#{e.ticket}</td>
                    <td>{e.what}</td>
                    <td className="text-[var(--muted)]">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-[14px] text-[var(--muted)]">Nothing yet. Run the scenarios on the desk.</p>
        )}
      </section>
    </div>
  );
}
