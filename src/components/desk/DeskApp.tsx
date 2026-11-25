"use client";

import { useEffect, useMemo, useState } from "react";
import { ADDRESSES, SUPPORTED, type Supported } from "@/config/assets";
import { explorerAddress } from "@/config/brand";
import { deskLive } from "@/config/contracts";
import { storageKey } from "@/config/storage";
import { useAssets, useChain, LiveStrip } from "@/components/home/LiveFacts";
import { ReviewCard, type CardCost, type CardModel } from "@/components/desk/ReviewCard";
import { ChainDesk } from "@/components/desk/ChainDesk";
import { HolderSection } from "@/components/holder/HolderSection";
import { StatusBadge } from "@/components/site/PageHead";
import { useLocalStore } from "@/components/wallet/useLocalStore";
import { BIT_WORDS, bitNames } from "@/lib/desk/bits";
import { decisionBits, executeBits, reasonsFor, verdictOf, type DeskState, type Ticket } from "@/lib/desk/review";
import { GAS, practiceApprove, practiceDesk, practiceExecute, runScenarios, SCENARIOS, type Market, type ReviewCard as Scen } from "@/lib/desk/scenarios";
import { CADENCE_WORDS, EMPTY, WEEKDAYS, complete, readStrategy, ruleLines, toDesk, type Cadence, type Question, type Strategy } from "@/lib/desk/strategy";
import type { Asset } from "@/lib/server/assets";
import { ago } from "@/lib/format";

/*
 * The desk, in five steps on one page: write the strategy (plain text or form), read the rules (with the asset's live proof),
 * run the four scenarios (review cards), decide in the approval queue, and see the results. Practice mode runs entirely in the
 * browser with live prices, gas and quotes; the on-chain desk (ChainDesk) uses the same rules once the contract is deployed.
 */

const EXAMPLE = "Buy $50 of NVDA every Monday, at most $200 a month.";
const STEPS = [
  { id: "strategy", label: "Strategy" },
  { id: "rules", label: "Rules" },
  { id: "scenarios", label: "Scenario run" },
  { id: "queue", label: "Approval queue" },
  { id: "results", label: "Results" },
] as const;

type Quote = { amountOut: string; fee: number } | null;
type LogEntry = { at: number; clock: number; ticket: number; what: string; detail: string };

const fmtTime = (t: number) => new Date(t * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";

function useQuote(sym: string | null, usdg: number | null) {
  const [q, setQ] = useState<{ key: string; value: Quote; decimals: number } | null>(null);
  const key = sym && usdg ? `${sym}:${usdg}` : null;
  useEffect(() => {
    if (!key || !sym || !usdg) return;
    let dead = false;
    fetch(`/api/quote?asset=${sym}&usdg=${usdg}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b: { quote?: Quote; decimals?: number }) => {
        if (!dead) setQ({ key, value: b.quote ?? null, decimals: b.decimals ?? 18 });
      })
      .catch(() => {
        if (!dead) setQ({ key, value: null, decimals: 18 });
      });
    return () => {
      dead = true;
    };
  }, [key, sym, usdg]);
  return q && q.key === key ? q : null;
}

export function DeskApp() {
  const [text, setText] = useState(EXAMPLE);
  const first = useMemo(() => readStrategy(EXAMPLE), []);
  const [s, setS] = useState<Strategy>(first.strategy);
  const [questions, setQuestions] = useState<Question[]>(first.questions);
  const [found, setFound] = useState<string[]>(first.found);
  const { data: board, error: boardError } = useAssets();
  const chain = useChain();
  const [clock, setClock] = useState<number>(() => Math.floor(Date.now() / 1000));
  const [desk, setDesk] = useState<DeskState | null>(null);
  const [cards, setCards] = useState<Scen[]>([]);
  const [queue, setQueue] = useState<Ticket[]>([]);
  const [log, setLog] = useLocalStore<LogEntry[]>(storageKey("desk", "log"), []);
  const [msg, setMsg] = useState<string | null>(null);

  const ok = complete(s);
  const params = toDesk(s);
  const asset: Asset | null = board?.assets.find((a) => a.symbol === s.asset) ?? null;
  const assetAddr = s.asset ? (asset?.address ?? ADDRESSES[s.asset]) : null;
  const other = (SUPPORTED.find((x) => x !== s.asset && x === "AAPL") ?? SUPPORTED.find((x) => x !== s.asset)) as Supported;
  const otherAsset = board?.assets.find((a) => a.symbol === other) ?? null;
  const price = (a: Asset | null) => (a?.feed?.answer ? Number(a.feed.answer) / 10 ** a.feed.decimals : null);
  const q1 = useQuote(s.asset, s.amount);
  const q2 = useQuote(s.asset, s.amount ? Math.round(s.amount * 1.5 * 100) / 100 : null);
  const q3 = useQuote(other, s.amount);
  const gasPrice = chain?.gasPriceWei ? Number(chain.gasPriceWei) : null;
  const ethUsd = chain?.ethUsd?.price ?? null;

  const read = () => {
    const r = readStrategy(text);
    // Keep what the reader could not find from the form, so a partial sentence does not wipe a choice already made.
    setS({ ...r.strategy, slippageBps: r.strategy.slippageBps });
    setQuestions(r.questions);
    setFound(r.found);
    setCards([]);
    setQueue([]);
    setDesk(null);
  };
  const answer = (qi: number, patch: Partial<Strategy>) => {
    setS((p) => ({ ...p, ...patch }));
    setQuestions((qs) => qs.filter((_, i) => i !== qi));
  };
  const edit = (patch: Partial<Strategy>) => {
    setS((p) => ({ ...p, ...patch }));
    setCards([]);
    setQueue([]);
    setDesk(null);
  };

  const market = (a: Asset | null, q: typeof q1): Market => ({
    price: price(a),
    priceStale: a?.feed?.stale ?? null,
    fee: a?.pool?.fee ?? null,
    quoteOut: q?.value ? Number(q.value.amountOut) / 10 ** (q.decimals ?? 18) : null,
  });

  const cost = (a: Asset | null, amount: number, q: typeof q1, gasUnits: number, gasLabel: string): CardCost => {
    const p = price(a);
    const qo = q?.value ? Number(q.value.amountOut) / 10 ** (q.decimals ?? 18) : null;
    const gasEth = gasPrice !== null ? (gasUnits * gasPrice) / 1e18 : null;
    return {
      gasUnits,
      gasLabel,
      gasEth,
      gasUsd: gasEth !== null && ethUsd !== null ? gasEth * ethUsd : null,
      feePct: a?.pool ? a.pool.fee / 10_000 : null,
      feeUsdg: a?.pool ? (amount * a.pool.fee) / 1_000_000 : null,
      quoteOut: qo,
      impactPct: qo !== null && p ? (qo / (amount / p) - 1) * 100 : null,
      priceAge: a?.feed?.updatedAt ? `${ago(a.feed.updatedAt)}${a.feed.stale ? ", stale (market closed?)" : ""}` : null,
    };
  };

  const note = (ticket: number, what: string, detail: string) => setLog((l) => [{ at: Date.now(), clock, ticket, what, detail }, ...l].slice(0, 200));

  const run = () => {
    if (!ok || !s.asset || !assetAddr) return;
    const d = practiceDesk(s, assetAddr, clock);
    if (!d) return;
    const otherAddr = otherAsset?.address ?? ADDRESSES[other];
    const c = runScenarios(s, d, { symbol: s.asset, address: assetAddr }, { symbol: other, address: otherAddr }, { main: market(asset, q1), over: market(asset, q2), other: market(otherAsset, q3) }, clock);
    setDesk(d);
    setCards(c);
    setQueue(c.filter((x) => x.queued).map((x) => x.ticket));
    setMsg(null);
    for (const x of c) note(x.ticket.id, `${SCENARIOS.find((y) => y.id === x.scenario)?.title}: ${x.verdict}`, x.reasons.map((r) => r.label).join(", ") || "all rules hold");
    document.getElementById("scenarios")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const decide = (t: Ticket, kind: "approve" | "reject" | "execute") => {
    if (!desk) return;
    if (kind === "reject") {
      setQueue((qs) => qs.map((x) => (x.id === t.id ? { ...x, status: "Rejected", decidedAt: clock, rejectCode: 1 } : x)));
      note(t.id, "Rejected by you", "reason code 1 (not now)");
      return;
    }
    if (kind === "approve") {
      const r = practiceApprove(desk, t, clock);
      if (!r.ok) {
        const names = bitNames(r.bits).map((n) => BIT_WORDS[n].label).join(", ");
        setMsg(`Ticket #${t.id} cannot be approved now: ${names}.`);
        note(t.id, "Approval refused", names);
        return;
      }
      setDesk(r.desk);
      setQueue((qs) => qs.map((x) => (x.id === t.id ? r.ticket : x)));
      note(t.id, "Approved by you", `bound to ${r.ticket.hash.slice(0, 10)}…, ${Number(r.ticket.amountIn) / 1e6} USDG reserved`);
      setMsg(null);
      return;
    }
    const r = practiceExecute(desk, t, clock);
    if (!r.ok) {
      const names = bitNames(r.bits).map((n) => BIT_WORDS[n].label).join(", ");
      setMsg(`Ticket #${t.id} cannot execute: ${names}.`);
      note(t.id, "Execution refused", names);
      return;
    }
    setQueue((qs) => qs.map((x) => (x.id === t.id ? r.ticket : x)));
    const m = market(asset, q1);
    note(t.id, "Executed (practice)", m.quoteOut ? `expected ≈ ${m.quoteOut.toFixed(5)} ${s.asset} from the live quote; nothing was bought` : "no live quote; nothing was bought");
  };

  const toCard = (x: Scen): CardModel => {
    const amt = Number(x.ticket.amountIn) / 1e6;
    const isOther = x.assetSymbol !== s.asset;
    const a = isOther ? otherAsset : asset;
    const q = x.scenario === "over-cap" ? q2 : isOther ? q3 : q1;
    const sc = SCENARIOS.find((y) => y.id === x.scenario)!;
    return {
      key: x.scenario,
      title: sc.title,
      subtitle: sc.says,
      ticketId: x.ticket.id,
      firedRule: x.firedRule,
      assetSymbol: x.assetSymbol,
      assetAddress: x.ticket.asset,
      proven: a ? a.proof.proven : null,
      amountUsdg: amt,
      minOut: x.ticket.minOut > 0n ? `${(Number(x.ticket.minOut) / 1e18).toFixed(6)} ${x.assetSymbol}` : "0 (no live quote, price protection missing)",
      deadline: fmtTime(x.ticket.deadline),
      hash: x.ticket.hash,
      verdict: x.verdict,
      stage: x.stage,
      reasons: x.reasons,
      cost: cost(a, amt, q, x.stage === "execution" ? GAS.execute : GAS.propose, x.stage === "execution" ? "Gas to execute" : "Gas to propose"),
      sample: true,
    };
  };

  const queueCard = (t: Ticket): CardModel | null => {
    if (!desk || !s.asset) return null;
    const stage = t.status === "Approved" ? "execution" : "decision";
    const bits = t.status === "Proposed" ? decisionBits(desk, t, clock) : t.status === "Approved" ? executeBits(desk, t, clock, null) : 0n;
    const amt = Number(t.amountIn) / 1e6;
    const used = Number(desk.use.period === Math.floor((clock - desk.start) / desk.periodLength) ? desk.use.used : 0n) / 1e6;
    const gapLeftH = desk.lastApprovedAt ? Math.max(0, (desk.lastApprovedAt + desk.minGap - clock) / 3600) : 0;
    return {
      key: `q${t.id}`,
      title: `Ticket #${t.id} · ${s.asset}`,
      subtitle: t.status === "Proposed" ? "Waiting for your decision" : t.status === "Approved" ? "Approved; the agent or you may execute it" : `Final: ${t.status}`,
      ticketId: t.id,
      firedRule: `R2 schedule: ${s.cadence ? CADENCE_WORDS[s.cadence] : ""} buy`,
      assetSymbol: s.asset,
      assetAddress: t.asset,
      proven: asset ? asset.proof.proven : null,
      amountUsdg: amt,
      minOut: `${(Number(t.minOut) / 1e18).toFixed(6)} ${s.asset}`,
      deadline: fmtTime(t.deadline),
      hash: t.hash,
      verdict: t.status === "Rejected" || t.status === "Cancelled" || t.status === "Expired" ? "Hold" : verdictOf(bits),
      stage,
      reasons: reasonsFor(bits, { amount: amt, perTicket: Number(desk.maxPerTicket) / 1e6, periodCap: Number(desk.periodCap) / 1e6, used, asset: s.asset, expected: s.asset, gapLeftH }),
      cost: cost(asset, amt, q1, t.status === "Proposed" ? GAS.approve : GAS.execute, t.status === "Proposed" ? "Gas to approve" : "Gas to execute"),
      status: t.status,
      sample: true,
    };
  };

  const done = { strategy: ok && questions.length === 0, rules: ok, scenarios: cards.length > 0, queue: queue.some((t) => t.status !== "Proposed"), results: log.length > 0 };

  return (
    <div className="app" data-testid="desk-app">
      <nav className="app-side" aria-label="Desk steps">
        {STEPS.map((st, i) => (
          <a key={st.id} href={`#${st.id}`} data-done={done[st.id]}>
            <span className="n">{i + 1}</span> {st.label}
          </a>
        ))}
        <div className="mt-3 hidden border-t border-[var(--line)] px-2 pt-3 text-[12px] text-[var(--muted)] min-[961px]:block">
          <p>Mode</p>
          <p className="mt-1 text-[var(--ink)]">{deskLive() ? "Practice + on chain" : "Practice (no wallet)"}</p>
        </div>
      </nav>

      <div className="grid min-w-0 gap-6">
        <div className="panel panel-pad">
          <LiveStrip />
        </div>

        {/* 1. Strategy */}
        <section id="strategy" className="panel panel-pad scroll-mt-6" data-testid="step-strategy">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="display text-[24px] leading-[30px]">1 · Write the strategy</h2>
            <StatusBadge status="Prototype" />
          </div>
          <p className="mt-2 text-[14px] text-[var(--muted)]">One periodic buy of one supported stock token. Write it in plain English, or use the form. The reader is a fixed set of patterns, not an AI model; it asks when something is unclear.</p>
          <label className="field mt-4">
            <span>Your strategy</span>
            <textarea className="inp" value={text} onChange={(e) => setText(e.target.value)} data-testid="strategy-text" maxLength={400} />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-white btn-sm" onClick={read} data-testid="read-strategy">
              Read it
              <span className="arrow" aria-hidden="true">→</span>
            </button>
            {found.map((f) => (
              <span key={f} className="chip ok">
                {f}
              </span>
            ))}
          </div>
          {questions.length ? (
            <div className="mt-4 grid gap-3" data-testid="questions">
              {questions.map((q, i) => (
                <div key={q.id + i} className="q">
                  <p className="text-[14px]">{q.text}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {q.options.map((o) => (
                      <button key={o.label} type="button" className="btn btn-sm btn-line" onClick={() => answer(i, o.patch)} data-testid={`answer-${q.id}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="field">
              <span>Asset</span>
              <select className="inp" value={s.asset ?? ""} onChange={(e) => edit({ asset: (e.target.value || null) as Supported | null })} data-testid="f-asset">
                <option value="">Choose…</option>
                {SUPPORTED.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>USDG per order</span>
              <input className="inp num" type="number" min={1} max={100000} value={s.amount ?? ""} onChange={(e) => edit({ amount: e.target.value ? Number(e.target.value) : null })} data-testid="f-amount" />
            </label>
            <label className="field">
              <span>Budget (USDG)</span>
              <input className="inp num" type="number" min={1} value={s.periodCap ?? ""} onChange={(e) => edit({ periodCap: e.target.value ? Number(e.target.value) : null })} data-testid="f-cap" />
            </label>
            <label className="field">
              <span>Budget period</span>
              <select className="inp" value={s.periodUnit ?? ""} onChange={(e) => edit({ periodUnit: (e.target.value || null) as Strategy["periodUnit"] })}>
                <option value="">Choose…</option>
                <option value="week">per 7 days</option>
                <option value="month">per 30 days</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div className="field">
              <span>Schedule</span>
              <div className="seg" role="group" aria-label="Schedule">
                {(["daily", "weekly", "biweekly", "monthly"] as Cadence[]).map((c) => (
                  <button key={c} type="button" aria-pressed={s.cadence === c} onClick={() => edit({ cadence: c })}>
                    {CADENCE_WORDS[c]}
                  </button>
                ))}
              </div>
            </div>
            {s.cadence === "weekly" || s.cadence === "biweekly" ? (
              <label className="field">
                <span>Day</span>
                <select className="inp" value={s.weekday ?? ""} onChange={(e) => edit({ weekday: e.target.value === "" ? null : Number(e.target.value) })}>
                  <option value="">Any</option>
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="field w-[150px]">
              <span>Price protection %</span>
              <input className="inp num" type="number" min={0.1} max={5} step={0.1} value={s.slippageBps / 100} onChange={(e) => edit({ slippageBps: Math.round(Math.min(5, Math.max(0.1, Number(e.target.value) || 1)) * 100) })} />
            </label>
            <label className="field w-[150px]">
              <span>Ticket waits (hours)</span>
              <input className="inp num" type="number" min={1} max={720} value={s.ticketHours} onChange={(e) => edit({ ticketHours: Math.min(720, Math.max(1, Math.round(Number(e.target.value) || 24))) })} />
            </label>
          </div>
          {!ok ? <p className="note warn mt-4">Not complete yet: {[!s.asset && "asset", !s.amount && "order size", !s.cadence && "schedule", !s.periodCap && "budget", !s.periodUnit && "budget period", s.amount && s.periodCap && s.amount > s.periodCap && "order larger than budget"].filter(Boolean).join(", ")}.</p> : null}
        </section>

        {/* 2. Rules */}
        <section id="rules" className="panel panel-pad scroll-mt-6" data-testid="step-rules">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="display text-[24px] leading-[30px]">2 · Check the rules</h2>
            <StatusBadge status="Prototype" />
          </div>
          {ok && params ? (
            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="overflow-x-auto">
                <table className="tbl" data-testid="rules-table">
                  <tbody>
                    {ruleLines(s).map((r) => (
                      <tr key={r.id}>
                        <td className="num w-[44px] text-[var(--neon)]">{r.id}</td>
                        <td className="whitespace-nowrap text-[var(--muted)]">{r.label}</td>
                        <td>{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[12px] text-[var(--muted)]">
                  Rule hash (keccak256 of the rules, stored on the desk): <span className="num break-all text-[var(--ink)]">{params.ruleHash}</span>
                </p>
              </div>
              <div className="rounded-[12px] border border-[var(--line)] p-4" data-testid="asset-proof">
                <p className="text-[14px]">
                  {s.asset} identity, read live{" "}
                  {asset ? <span className={`chip dot ${asset.proof.proven ? "ok" : "hold"}`}>{asset.proof.proven ? "proven" : "not proven"}</span> : null}
                </p>
                {asset ? (
                  <dl className="kv mt-3">
                    <dt>Address</dt>
                    <dd>
                      <a className="elink num text-[12px]" href={explorerAddress(asset.address)} target="_blank" rel="noreferrer">
                        {asset.address}
                      </a>
                    </dd>
                    <dt>Vetted list</dt>
                    <dd>{asset.proof.inList ? "yes" : "no"}</dd>
                    <dt>Proxy code hash</dt>
                    <dd>{asset.proof.codeHash === null ? "Not known" : asset.proof.codeHash ? "matches" : "differs"}</dd>
                    <dt>Beacon slot</dt>
                    <dd>{asset.proof.beacon === null ? "Not known" : asset.proof.beacon ? "official beacon" : "other"}</dd>
                    <dt>Supply</dt>
                    <dd className="num">{asset.proof.supply ? (Number(asset.proof.supply) / 10 ** asset.decimals).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "Not known"}</dd>
                    <dt>Chainlink price</dt>
                    <dd className="num">
                      {price(asset) !== null ? `$${price(asset)!.toFixed(2)}` : "Not known"}
                      {asset.feed?.updatedAt ? <span className="text-[var(--faint)]"> · {ago(asset.feed.updatedAt)}{asset.feed.stale ? " · stale" : ""}</span> : null}
                    </dd>
                    <dt>Pool</dt>
                    <dd className="num">
                      {asset.pool ? (
                        <a className="elink" href={explorerAddress(asset.pool.address)} target="_blank" rel="noreferrer">
                          {asset.pool.fee / 10_000}% · {(Number(asset.pool.usdgDepth) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })} USDG
                        </a>
                      ) : (
                        "None found"
                      )}
                    </dd>
                  </dl>
                ) : (
                  <p className="mt-2 text-[13px] text-[var(--muted)]">{boardError ? `Could not read the board: ${boardError}` : "Reading from chain…"}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[14px] text-[var(--muted)]">Finish step 1 first.</p>
          )}
        </section>

        {/* 3. Scenarios */}
        <section id="scenarios" className="panel panel-pad scroll-mt-6" data-testid="step-scenarios">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="display text-[24px] leading-[30px]">3 · Run the scenarios</h2>
            <StatusBadge status="Prototype" />
          </div>
          <p className="mt-2 text-[14px] text-[var(--muted)]">Four tickets an agent could send. Each is checked with the same rules as the desk contract and becomes a review card. Prices, gas and quotes are live; the desk and the tickets are practice.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/* The minimum out of every ticket comes from a live quote: wait for the three quotes (they may answer "no quote"). */}
            <button type="button" className="btn btn-neon btn-sm" disabled={!ok || !q1 || !q2 || !q3} onClick={run} data-testid="run-scenarios">
              {ok && (!q1 || !q2 || !q3) ? "Reading live quotes…" : "Run 4 scenarios"}
            </button>
            <span className="text-[13px] text-[var(--muted)]">Practice clock: {fmtTime(clock)}</span>
          </div>
          {cards.length ? (
            <div className="mt-5 grid gap-4 xl:grid-cols-2" data-testid="scenario-cards">
              {cards.map((c, i) => (
                <ReviewCard key={c.scenario} c={toCard(c)} delay={i * 90} />
              ))}
            </div>
          ) : null}
        </section>

        {/* 4. Queue */}
        <section id="queue" className="panel panel-pad scroll-mt-6" data-testid="step-queue">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="display text-[24px] leading-[30px]">4 · Approval queue</h2>
            <StatusBadge status="Prototype" />
          </div>
          <p className="mt-2 text-[14px] text-[var(--muted)]">Tickets that passed wait here. Approve or reject each by hand. The desk keeps a minimum gap between approvals and a budget per period, so approving one can put the next on Hold. Move the practice clock to see the rules change.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["+1 hour", 3600],
              ["+1 day", 86_400],
              ["+7 days", 7 * 86_400],
            ].map(([l, d]) => (
              <button key={l} type="button" className="btn btn-sm btn-line" onClick={() => setClock((c) => c + Number(d))} data-testid={`clock-${String(l).replace(/\W+/g, "")}`}>
                {l}
              </button>
            ))}
            <button type="button" className="btn btn-sm btn-line" onClick={() => setClock(Math.floor(Date.now() / 1000))}>
              Reset clock
            </button>
          </div>
          {msg ? <p className="rq-alert mt-4" role="status">{msg}</p> : null}
          {queue.length ? (
            <div className="mt-5 grid gap-4 xl:grid-cols-2" data-testid="queue-cards">
              {queue.map((t, i) => {
                const c = queueCard(t);
                if (!c) return null;
                return (
                  <ReviewCard
                    key={t.id}
                    c={c}
                    delay={i * 90}
                    actions={
                      t.status === "Proposed" ? (
                        <>
                          <button type="button" className="btn btn-sm btn-neon flex-1" onClick={() => decide(t, "approve")} data-testid={`approve-${t.id}`}>
                            Approve
                          </button>
                          <button type="button" className="btn btn-sm btn-line flex-1" onClick={() => decide(t, "reject")} data-testid={`reject-${t.id}`}>
                            Reject
                          </button>
                        </>
                      ) : t.status === "Approved" ? (
                        <button type="button" className="btn btn-sm btn-white flex-1" onClick={() => decide(t, "execute")} data-testid={`execute-${t.id}`}>
                          Execute (practice)
                        </button>
                      ) : null
                    }
                  />
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-[14px] text-[var(--muted)]">Empty. Run the scenarios first.</p>
          )}
          {desk ? (
            <p className="mt-4 text-[13px] text-[var(--muted)]" data-testid="budget-line">
              Budget this period: <span className="num text-[var(--ink)]">{Number(desk.use.period === Math.floor((clock - desk.start) / desk.periodLength) ? desk.use.used : 0n) / 1e6}</span> of{" "}
              <span className="num">{Number(desk.periodCap) / 1e6}</span> USDG approved.
            </p>
          ) : null}
          <div className="mt-6">
            <ChainDesk strategy={s.asset ? s : EMPTY} />
          </div>
        </section>

        <div id="hosted" className="scroll-mt-6">
          <HolderSection
            desk={{
              strategy: s,
              text,
              queue: queue.map((t) => ({ id: t.id, status: t.status, amountIn: t.amountIn.toString(), hash: t.hash })),
              onLoad: (st, tx) => {
                edit({ ...EMPTY, ...st });
                if (tx) setText(tx);
                document.getElementById("strategy")?.scrollIntoView({ behavior: "smooth" });
              },
            }}
          />
        </div>

        {/* 5. Results */}
        <section id="results" className="panel panel-pad scroll-mt-6" data-testid="step-results">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="display text-[24px] leading-[30px]">5 · Results</h2>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-line"
                disabled={!log.length}
                onClick={() => {
                  const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "oddro-practice-log.json";
                  a.click();
                }}
              >
                Export JSON
              </button>
              <button type="button" className="btn btn-sm btn-line" disabled={!log.length} onClick={() => setLog([])}>
                Clear
              </button>
            </div>
          </div>
          <p className="mt-2 text-[14px] text-[var(--muted)]">Every card and decision of the practice desk, kept in this browser only. On-chain decisions are on the History page, read from the contract&apos;s events.</p>
          {log.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="tbl" data-testid="log-table">
                <thead>
                  <tr>
                    <th>Clock</th>
                    <th>Ticket</th>
                    <th>Event</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {log.slice(0, 40).map((e, i) => (
                    <tr key={i}>
                      <td className="num whitespace-nowrap text-[var(--muted)]">{fmtTime(e.clock)}</td>
                      <td className="num">#{e.ticket}</td>
                      <td>{e.what}</td>
                      <td className="text-[var(--muted)]">{e.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-[14px] text-[var(--muted)]">Nothing recorded yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
