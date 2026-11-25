import "server-only";
import { decodeEventLog, getAddress, pad, toHex } from "viem";
import { CONTRACTS, deskLive } from "@/config/contracts";
import { DESK_ABI } from "@/lib/abi";
import { headBlock, logReader, reads, type RawLog, type Read } from "@/lib/server/chainread";
import { scanBack } from "@/lib/logscan";

/*
 * Desks of one owner or agent, read from OddroOrderDesk (views), their latest tickets, and the decision history from the
 * desk's logs (proposed, approved, rejected, cancelled, expired, executed, pauses, rule versions). A refused proposal reverts
 * and leaves no log: the site records those from the pre-check (checkTicket) in the visitor's browser instead.
 */

const MAX_DESKS = 12;
const MAX_TICKETS = 40;
const STATUS = ["None", "Proposed", "Approved", "Rejected", "Cancelled", "Expired", "Executed"] as const;

export type DeskView = {
  id: number;
  owner: string;
  agent: string;
  asset: string;
  quote: string;
  fee: number;
  maxPerTicket: string;
  periodCap: string;
  periodLength: number;
  minGap: number;
  maxTicketLife: number;
  start: number;
  expiry: number;
  lastApprovedAt: number;
  ruleHash: string;
  version: number;
  paused: boolean;
  closed: boolean;
  period: number;
  used: string;
  left: string;
  ticketCount: number;
};

export type TicketView = {
  id: number;
  deskId: number;
  status: (typeof STATUS)[number];
  asset: string;
  amountIn: string;
  minOut: string;
  amountOut: string;
  deadline: number;
  proposedAt: number;
  decidedAt: number;
  period: number;
  rejectCode: number;
  ruleHash: string;
  ref: string;
  hash: string;
  /** checkDecision (Proposed) or checkExecute (Approved) right now; null for final tickets. */
  bits: string | null;
};

export type DeskEvent = { name: string; deskId: number; ticketId: number | null; block: number; tx: string; logIndex: number; args: Record<string, string> };

export type Activity = {
  deployed: boolean;
  desk: string;
  head: number | null;
  desks: DeskView[];
  tickets: TicketView[];
  events: DeskEvent[];
  scanned: { fromBlock: number; toBlock: number; gaps: [number, number][]; complete: boolean } | null;
};

const r = (fn: string, args: readonly unknown[] = []): Read => ({ to: CONTRACTS.desk, abi: DESK_ABI, fn, args });
const str = (v: unknown): string => (typeof v === "bigint" ? v.toString() : typeof v === "string" ? v : String(v));
function ok<T>(a: { kind: string; value?: unknown }): T {
  if (a.kind !== "ok") throw new Error("A desk read failed.");
  return a.value as T;
}

export async function readActivity(who: { owner?: string; agent?: string }): Promise<Activity> {
  if (!deskLive()) return { deployed: false, desk: CONTRACTS.desk, head: null, desks: [], tickets: [], events: [], scanned: null };
  const head = await headBlock();
  const [ids] = await reads([who.owner ? r("desksOfOwner", [getAddress(who.owner)]) : r("desksOfAgent", [getAddress(who.agent!)])]);
  const list = ok<bigint[]>(ids).slice(-MAX_DESKS).map(Number);
  const desks: DeskView[] = [];
  const ticketIds: number[] = [];
  for (const id of list) {
    const base = await reads([r("getDesk", [BigInt(id)]), r("periodUse", [BigInt(id)]), r("ticketCountOf", [BigInt(id)])]);
    const d = ok<Record<string, unknown>>(base[0]);
    const [period, used, left] = ok<[bigint, bigint, bigint]>(base[1]);
    const count = Number(ok<bigint>(base[2]));
    desks.push({
      id,
      owner: str(d.owner).toLowerCase(),
      agent: str(d.agent).toLowerCase(),
      asset: str(d.asset).toLowerCase(),
      quote: str(d.quote).toLowerCase(),
      fee: Number(d.fee),
      maxPerTicket: str(d.maxPerTicket),
      periodCap: str(d.periodCap),
      periodLength: Number(d.periodLength),
      minGap: Number(d.minGap),
      maxTicketLife: Number(d.maxTicketLife),
      start: Number(d.start),
      expiry: Number(d.expiry),
      lastApprovedAt: Number(d.lastApprovedAt),
      ruleHash: str(d.ruleHash),
      version: Number(d.version),
      paused: Boolean(d.paused),
      closed: Boolean(d.closed),
      period: Number(period),
      used: str(used),
      left: str(left),
      ticketCount: count,
    });
    const from = Math.max(0, count - Math.ceil(MAX_TICKETS / Math.max(1, list.length)));
    const [page] = await reads([r("ticketsOf", [BigInt(id), BigInt(from), 100n])]);
    ticketIds.push(...ok<bigint[]>(page).map(Number));
  }
  const tickets: TicketView[] = [];
  for (let i = 0; i < ticketIds.length; i += 10) {
    const part = ticketIds.slice(i, i + 10);
    const got = await reads(part.map((t) => r("getTicket", [BigInt(t)])));
    const views = part.map((t, k) => ({ t, v: ok<Record<string, unknown>>(got[k]) }));
    const live = views.filter((x) => Number(x.v.status) === 1 || Number(x.v.status) === 2);
    const checks = live.length ? await reads(live.map((x) => r(Number(x.v.status) === 1 ? "checkDecision" : "checkExecute", [BigInt(x.t)]))) : [];
    for (const { t, v } of views) {
      const li = live.findIndex((x) => x.t === t);
      tickets.push({
        id: t,
        deskId: Number(v.deskId),
        status: STATUS[Number(v.status)] ?? "None",
        asset: str(v.asset).toLowerCase(),
        amountIn: str(v.amountIn),
        minOut: str(v.minOut),
        amountOut: str(v.amountOut),
        deadline: Number(v.deadline),
        proposedAt: Number(v.proposedAt),
        decidedAt: Number(v.decidedAt),
        period: Number(v.period),
        rejectCode: Number(v.rejectCode),
        ruleHash: str(v.ruleHash),
        ref: str(v.ref),
        hash: str(v.hash),
        bits: li >= 0 && checks[li]?.kind === "ok" ? str((checks[li] as { value: unknown }).value) : null,
      });
    }
  }
  tickets.sort((a, b) => b.id - a.id);
  if (list.length === 0) return { deployed: true, desk: CONTRACTS.desk, head, desks, tickets, events: [], scanned: { fromBlock: CONTRACTS.block, toBlock: head, gaps: [], complete: true } };

  // Desk events carry the desk id in topic 1; ticket events carry it in topic 2.
  const topicIds = list.map((id) => pad(toHex(id), { size: 32 }));
  const from = Math.max(0, CONTRACTS.block);
  const [a, b] = await Promise.all([
    scanBack<RawLog>(logReader({ address: CONTRACTS.desk, topics: [null, topicIds] }), from, head, { maxCalls: 16 }),
    scanBack<RawLog>(logReader({ address: CONTRACTS.desk, topics: [null, null, topicIds] }), from, head, { maxCalls: 16 }),
  ]);
  const seen = new Set<string>();
  const events: DeskEvent[] = [];
  for (const l of [...a.logs, ...b.logs]) {
    if ((l as RawLog & { removed?: boolean }).removed) continue;
    const key = `${l.transactionHash}:${l.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const d = decodeEventLog({ abi: DESK_ABI, data: l.data as `0x${string}`, topics: l.topics as [`0x${string}`, ...`0x${string}`[]] });
      const args = Object.fromEntries(Object.entries((d.args ?? {}) as Record<string, unknown>).map(([k, v]) => [k, str(v)]));
      const name = String(d.eventName);
      // Only events of the desks asked for (both scans read this contract only).
      if (!list.includes(Number(args.deskId ?? -1))) continue;
      events.push({ name, deskId: Number(args.deskId ?? 0), ticketId: args.ticketId !== undefined ? Number(args.ticketId) : null, block: Number(BigInt(l.blockNumber)), tx: l.transactionHash, logIndex: Number(BigInt(l.logIndex)), args });
    } catch {
      // not one of the desk's events
    }
  }
  events.sort((x, y) => y.block - x.block || y.logIndex - x.logIndex);
  const gaps = [...a.gaps, ...b.gaps];
  return { deployed: true, desk: CONTRACTS.desk, head, desks, tickets, events: events.slice(0, 300), scanned: { fromBlock: from, toBlock: head, gaps, complete: gaps.length === 0 } };
}
