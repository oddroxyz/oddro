import type { Activity } from "@/lib/server/activity";

/*
 * Alerts, derived in the browser from the desk contract's state and events for the connected wallet (as owner and as agent).
 * Free for everyone: the chain is public, so gating alerts would be pretend. Level 1 = the bell inbox; level 2 = browser
 * notifications while a tab of the site is open (Notification API, after the visitor clicks Enable). No email, no push service.
 */

export type AlertKind = "waiting" | "expiring" | "executed" | "failed" | "paused" | "rejected";
export type Alert = { id: string; kind: AlertKind; title: string; detail: string; deskId: number; ticketId: number | null; tx: string | null; at: number };

export const EXPIRING_SECONDS = 2 * 3600;
const usd = (raw: string | undefined) => (raw ? (Number(raw) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "?");

export function deriveAlerts(owner: Activity | null, agent: Activity | null, now: number): Alert[] {
  const out = new Map<string, Alert>();
  const add = (a: Alert) => out.set(a.id, a);
  for (const [role, act] of [["owner", owner], ["agent", agent]] as const) {
    if (!act) continue;
    for (const t of act.tickets) {
      const left = t.deadline - now;
      if (role === "owner" && t.status === "Proposed" && left > 0) {
        add({ id: `waiting:${t.id}`, kind: "waiting", title: `Ticket #${t.id} waits for your approval`, detail: `Desk #${t.deskId} · ${usd(t.amountIn)} USDG · decide before ${new Date(t.deadline * 1000).toUTCString().slice(5, 22)} UTC`, deskId: t.deskId, ticketId: t.id, tx: null, at: t.proposedAt });
      }
      if ((t.status === "Proposed" || t.status === "Approved") && left > 0 && left <= EXPIRING_SECONDS) {
        add({ id: `expiring:${t.id}`, kind: "expiring", title: `Ticket #${t.id} expires in ${Math.max(1, Math.round(left / 60))} min`, detail: `${t.status} · desk #${t.deskId}`, deskId: t.deskId, ticketId: t.id, tx: null, at: t.deadline - EXPIRING_SECONDS });
      }
      if (t.status === "Approved" && left <= 0) {
        add({ id: `failed:${t.id}`, kind: "failed", title: `Ticket #${t.id} was approved but not executed in time`, detail: `Its deadline passed; nothing was bought. Desk #${t.deskId}.`, deskId: t.deskId, ticketId: t.id, tx: null, at: t.deadline });
      }
    }
    for (const e of act.events) {
      if (e.name === "TicketExecuted" && e.ticketId !== null) {
        add({ id: `executed:${e.ticketId}`, kind: "executed", title: `Ticket #${e.ticketId} executed`, detail: `${usd(e.args.amountIn)} USDG spent, ${(Number(e.args.amountOut ?? 0) / 1e18).toFixed(6)} received by the owner`, deskId: e.deskId, ticketId: e.ticketId, tx: e.tx, at: e.block });
      }
      if (e.name === "DeskPaused") {
        add({ id: `paused:${e.deskId}:${e.block}`, kind: "paused", title: `Desk #${e.deskId} paused`, detail: "Nothing can be proposed, approved or executed until the owner unpauses it.", deskId: e.deskId, ticketId: null, tx: e.tx, at: e.block });
      }
      if (role === "agent" && e.name === "TicketRejected" && e.ticketId !== null) {
        add({ id: `rejected:${e.ticketId}`, kind: "rejected", title: `Ticket #${e.ticketId} rejected by the owner`, detail: `Reason code ${e.args.reasonCode ?? "0"}`, deskId: e.deskId, ticketId: e.ticketId, tx: e.tx, at: e.block });
      }
    }
  }
  return [...out.values()];
}

/** A transaction of this browser that reverted becomes a "failed" alert (a revert leaves no event on chain). */
export function failedTxAlert(label: string, tx: string, reason: string, at: number): Alert {
  return { id: `failed-tx:${tx}`, kind: "failed", title: `${label} failed`, detail: reason, deskId: 0, ticketId: null, tx, at };
}

export const unread = (alerts: Alert[], seen: string[]) => alerts.filter((a) => !seen.includes(a.id));
