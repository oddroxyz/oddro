import { keccak256, toBytes } from "viem";
import { SUPPORTED, type Supported } from "@/config/assets";

/*
 * One periodic-buy strategy for one supported asset, and the deterministic reader that turns plain text into it.
 * No language model: a fixed set of patterns. Anything it cannot place with certainty becomes a clarifying question; nothing
 * ambiguous is guessed (PK: "meminta klarifikasi jika instruksinya ambigu").
 */

export type Cadence = "daily" | "weekly" | "biweekly" | "monthly";
export type PeriodUnit = "week" | "month";

export type Strategy = {
  asset: Supported | null;
  /** USDG per order. */
  amount: number | null;
  cadence: Cadence | null;
  /** 0 = Sunday … 6 = Saturday, for weekly / biweekly. */
  weekday: number | null;
  /** USDG per period (the budget). */
  periodCap: number | null;
  periodUnit: PeriodUnit | null;
  /** Price protection: the minimum received is the quote minus this. */
  slippageBps: number;
  /** How long a ticket may wait for your decision. */
  ticketHours: number;
};

export type Question = {
  id: "asset" | "amount" | "cadence" | "budget" | "conflict" | "condition" | "sell" | "many-assets" | "many-amounts";
  text: string;
  /** Answers the reader offers; each one is a patch to the strategy. */
  options: { label: string; patch: Partial<Strategy> }[];
};

export type Reading = { strategy: Strategy; questions: Question[]; found: string[] };

export const EMPTY: Strategy = { asset: null, amount: null, cadence: null, weekday: null, periodCap: null, periodUnit: null, slippageBps: 100, ticketHours: 24 };

export const CADENCE_WORDS: Record<Cadence, string> = { daily: "every day", weekly: "every week", biweekly: "every two weeks", monthly: "every month" };
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Company words people write instead of the ticker. Each maps to exactly one supported asset. */
const ALIASES: Record<string, Supported> = {
  nvidia: "NVDA",
  apple: "AAPL",
  tesla: "TSLA",
  microsoft: "MSFT",
  amazon: "AMZN",
  google: "GOOGL",
  alphabet: "GOOGL",
  meta: "META",
  facebook: "META",
  "s&p 500": "SPY",
  "s&p500": "SPY",
  nasdaq: "QQQ",
  "nasdaq 100": "QQQ",
  palantir: "PLTR",
  coinbase: "COIN",
};

const MONEY = /(?:\$\s?(\d+(?:[.,]\d+)?)(k)?|(\d+(?:[.,]\d+)?)(k)?\s?(?:usdg|usd|dollars?|bucks))/gi;
const CAP_WORDS = /(at most|max(?:imum)?|up to|no more than|cap(?:ped)?(?: at)?|limit(?: of)?|budget(?: of)?|never more than|not more than)\s*$/i;

function num(a: string, k?: string) {
  const v = Number(a.replace(",", "."));
  return k ? v * 1000 : v;
}

/** Reads one strategy from plain English. */
export function readStrategy(text: string): Reading {
  const t = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const s: Strategy = { ...EMPTY };
  const q: Question[] = [];
  const found: string[] = [];

  // ---- asset: tickers ($NVDA, NVDA) and company words; the strategy buys ONE asset
  const assets = new Set<Supported>();
  for (const sym of SUPPORTED) if (new RegExp(`(^|[^a-z])\\$?${sym.toLowerCase()}([^a-z]|$)`).test(t)) assets.add(sym);
  for (const [w, sym] of Object.entries(ALIASES)) if (new RegExp(`(^|[^a-z])${w.replace(/[&]/g, "\\&")}([^a-z]|$)`).test(t)) assets.add(sym);
  if (assets.size === 1) {
    s.asset = [...assets][0];
    found.push(`asset ${s.asset}`);
  } else if (assets.size > 1) {
    q.push({ id: "many-assets", text: `A desk buys one asset. You named ${[...assets].join(", ")}. Which one should this strategy buy?`, options: [...assets].map((a) => ({ label: a, patch: { asset: a } })) });
  } else {
    q.push({ id: "asset", text: "Which asset should the agent buy? Only the supported stock tokens can be used.", options: SUPPORTED.slice(0, 6).map((a) => ({ label: a, patch: { asset: a } })) });
  }

  // ---- money: amounts after a cap word are the period budget, the others are the order size
  const per: number[] = [];
  const caps: { v: number; unit: PeriodUnit | null }[] = [];
  for (const m of t.matchAll(MONEY)) {
    const v = m[1] ? num(m[1], m[2]) : num(m[3], m[4]);
    const before = t.slice(Math.max(0, (m.index ?? 0) - 24), m.index);
    const after = t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 22);
    if (CAP_WORDS.test(before)) {
      const unit: PeriodUnit | null = /^\s*(a|per|each|every|in a|for the)?\s*(week|weekly)/.test(after) ? "week" : /^\s*(a|per|each|every|in a|for the)?\s*(month|monthly)/.test(after) ? "month" : null;
      caps.push({ v, unit });
    } else per.push(v);
  }
  if (per.length === 1) {
    s.amount = per[0];
    found.push(`order size ${per[0]} USDG`);
  } else if (per.length > 1) {
    const uniq = [...new Set(per)];
    if (uniq.length === 1) s.amount = uniq[0];
    else q.push({ id: "many-amounts", text: `More than one order size is written (${uniq.map((v) => `$${v}`).join(", ")}). How much should each order spend?`, options: uniq.map((v) => ({ label: `$${v} per order`, patch: { amount: v } })) });
  } else {
    q.push({ id: "amount", text: "How much should each order spend (in USDG)?", options: [25, 50, 100].map((v) => ({ label: `$${v}`, patch: { amount: v } })) });
  }
  if (caps.length >= 1) {
    s.periodCap = caps[0].v;
    s.periodUnit = caps[0].unit;
    found.push(`budget ${caps[0].v} USDG${caps[0].unit ? ` per ${caps[0].unit}` : ""}`);
  }

  // ---- schedule
  const day = WEEKDAYS.findIndex((d) => new RegExp(`(every|each|on)\\s+${d.toLowerCase()}s?`).test(t) || new RegExp(`${d.toLowerCase()}s`).test(t));
  if (/(every|each)\s+(two|2|other)\s+weeks?|bi-?weekly|fortnight/.test(t)) s.cadence = "biweekly";
  else if (/(every|each)\s+day|daily|per day|a day/.test(t) && !caps.some((c) => c.unit)) s.cadence = "daily";
  else if (/(every|each|once a)\s+week|weekly/.test(t) || day >= 0) s.cadence = "weekly";
  else if (/(every|each|once a)\s+month|monthly/.test(t)) s.cadence = "monthly";
  if (day >= 0 && (s.cadence === "weekly" || s.cadence === "biweekly")) s.weekday = day;
  if (s.cadence) found.push(`schedule ${CADENCE_WORDS[s.cadence]}${s.weekday !== null ? ` on ${WEEKDAYS[s.weekday]}` : ""}`);
  else q.push({ id: "cadence", text: "How often should the agent buy?", options: (["daily", "weekly", "biweekly", "monthly"] as Cadence[]).map((c) => ({ label: CADENCE_WORDS[c], patch: { cadence: c } })) });

  // a cap without a unit: ask which period it covers
  if (s.periodCap !== null && s.periodUnit === null) {
    q.push({ id: "budget", text: `Is the $${s.periodCap} budget per week or per month?`, options: [{ label: "Per week", patch: { periodUnit: "week" } }, { label: "Per month", patch: { periodUnit: "month" } }] });
  }
  // no cap at all: offer the schedule's own total, never assume it silently
  if (s.periodCap === null && s.amount !== null && s.cadence) {
    const unit = defaultUnit(s.cadence);
    const v = s.amount * buysPer(s.cadence, unit);
    q.push({ id: "budget", text: `No budget per period is written. Cap spending at $${v} per ${unit} (exactly what the schedule buys)?`, options: [{ label: `$${v} per ${unit}`, patch: { periodCap: v, periodUnit: unit } }, { label: `$${v * 2} per ${unit}`, patch: { periodCap: v * 2, periodUnit: unit } }] });
  }
  if (s.amount !== null && s.periodCap !== null && s.amount > s.periodCap) {
    q.push({ id: "conflict", text: `One order ($${s.amount}) is larger than the budget ($${s.periodCap}). Which one is right?`, options: [{ label: `Orders of $${s.periodCap}`, patch: { amount: s.periodCap } }, { label: `Budget of $${s.amount}`, patch: { periodCap: s.amount } }] });
  }

  // ---- things this version does not do: price conditions and selling
  if (/\b(dip|dips|drops?|falls?|cheap|below|above|under \$|over \$|rsi|moving average|when the price|if the price|crash)\b/.test(t)) {
    q.push({ id: "condition", text: "Price conditions (a dip, a level, an indicator) are not supported in this version: Oddro buys on a schedule only. Keep the time-based buy and drop the condition?", options: [{ label: "Keep the schedule only", patch: {} }] });
  }
  if (/\b(sell|sells|selling|take profit|stop loss|short)\b/.test(t)) {
    q.push({ id: "sell", text: "This version only buys. Selling, take-profit and stop-loss are not supported. Continue with the buy part only?", options: [{ label: "Buy part only", patch: {} }] });
  }

  const slip = t.match(/(\d+(?:\.\d+)?)\s?%\s*(slippage|price protection)|slippage (?:of )?(\d+(?:\.\d+)?)\s?%/);
  if (slip) {
    const v = Number(slip[1] ?? slip[3]);
    if (v > 0 && v <= 5) {
      s.slippageBps = Math.round(v * 100);
      found.push(`price protection ${v}%`);
    }
  }
  return { strategy: s, questions: q, found };
}

export const defaultUnit = (c: Cadence): PeriodUnit => (c === "daily" || c === "weekly" ? "week" : "month");

/** How many buys a cadence makes in one budget period (a month counts as 30 days). */
export function buysPer(c: Cadence, unit: PeriodUnit): number {
  const days = unit === "week" ? 7 : 30;
  const every = c === "daily" ? 1 : c === "weekly" ? 7 : c === "biweekly" ? 14 : 30;
  return Math.max(1, Math.floor(days / every));
}

export const complete = (s: Strategy): boolean => s.asset !== null && s.amount !== null && s.amount > 0 && s.cadence !== null && s.periodCap !== null && s.periodCap > 0 && s.periodUnit !== null && s.amount <= s.periodCap;

// ------------------------------------------------------------------ strategy -> desk rules

export type DeskParams = {
  asset: Supported;
  maxPerTicket: bigint;
  periodCap: bigint;
  periodLength: number;
  minGap: number;
  maxTicketLife: number;
  slippageBps: number;
  ruleHash: `0x${string}`;
};

export type RuleLine = { id: string; label: string; value: string; onChain: boolean };

const DAY = 86_400;
/** The gap is a little under the interval so a run that starts a few hours late is not refused. */
export const GAP: Record<Cadence, number> = { daily: 20 * 3600, weekly: 6 * DAY, biweekly: 13 * DAY, monthly: 27 * DAY };
export const PERIOD: Record<PeriodUnit, number> = { week: 7 * DAY, month: 30 * DAY };
export const usdg = (v: number) => BigInt(Math.round(v * 1e6));

/** The canonical text that is hashed into the rule hash: same strategy => same hash, any change => new hash. */
export function canonical(s: Strategy): string {
  return JSON.stringify({ v: 1, asset: s.asset, amount: s.amount, cadence: s.cadence, weekday: s.weekday, periodCap: s.periodCap, periodUnit: s.periodUnit, slippageBps: s.slippageBps, ticketHours: s.ticketHours });
}

export function toDesk(s: Strategy): DeskParams | null {
  if (!complete(s)) return null;
  const periodLength = PERIOD[s.periodUnit!];
  return {
    asset: s.asset!,
    maxPerTicket: usdg(s.amount!),
    periodCap: usdg(s.periodCap!),
    periodLength,
    minGap: Math.min(GAP[s.cadence!], periodLength),
    maxTicketLife: Math.min(Math.max(s.ticketHours, 1), 720) * 3600,
    slippageBps: s.slippageBps,
    ruleHash: keccak256(toBytes(canonical(s))),
  };
}

/** The rule lines a review card refers to (R1 … R7). */
export function ruleLines(s: Strategy): RuleLine[] {
  const d = toDesk(s);
  if (!d) return [];
  const gapH = d.minGap / 3600;
  return [
    { id: "R1", label: "Asset", value: `${s.asset} only (on-chain proof required)`, onChain: true },
    { id: "R2", label: "Schedule", value: `${CADENCE_WORDS[s.cadence!]}${s.weekday !== null ? `, ${WEEKDAYS[s.weekday]}` : ""} · next approval ≥ ${gapH >= 48 ? `${gapH / 24} days` : `${gapH} h`} after the last`, onChain: true },
    { id: "R3", label: "Per order", value: `≤ ${s.amount} USDG`, onChain: true },
    { id: "R4", label: "Budget", value: `≤ ${s.periodCap} USDG per ${s.periodUnit === "week" ? "7-day" : "30-day"} period`, onChain: true },
    { id: "R5", label: "Price protection", value: `minimum received = quote − ${(s.slippageBps / 100).toFixed(2)}%`, onChain: true },
    { id: "R6", label: "Ticket life", value: `waits ≤ ${s.ticketHours} h for your decision`, onChain: true },
    { id: "R7", label: "Approval", value: "you approve every ticket by hand, on chain", onChain: true },
  ];
}
