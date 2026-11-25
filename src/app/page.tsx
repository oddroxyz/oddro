import Link from "next/link";
import { BRAND, CHAIN, TOKEN } from "@/config/brand";
import { CONTRACTS, deskLive } from "@/config/contracts";
import { Hero } from "@/components/home/Hero";
import { Statement } from "@/components/home/Statement";
import { Features } from "@/components/home/Features";
import { Tabs } from "@/components/home/Tabs";
import { Steps } from "@/components/home/Steps";
import { AssetRows, LiveStrip } from "@/components/home/LiveFacts";
import { StatusBadge } from "@/components/site/PageHead";
import { MarkGlyph } from "@/components/site/Mark";
import { CheckIcon } from "@/components/site/Icons";
import { JsonLd } from "@/components/JsonLd";
import { appLd, pageMeta, HOME_DESCRIPTION, HOME_TITLE } from "@/lib/seo";

export const metadata = pageMeta({ path: "/", title: HOME_TITLE, description: HOME_DESCRIPTION });

function Rule() {
  return (
    <div className="rule">
      <span className="plus" style={{ left: 0 }} />
      <span className="plus" style={{ left: "100%" }} />
    </div>
  );
}

function Arrow() {
  return (
    <span className="arrow" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 8h10M9 4l4 4-4 4" />
      </svg>
    </span>
  );
}

function TabText({ title, children, cta = true }: { title: string; children: React.ReactNode; cta?: boolean }) {
  return (
    <>
      <h3 className="display h-card max-w-[440px]">{title}</h3>
      <div className="mt-6 max-w-[540px] text-[16px] leading-[24px] text-[var(--muted)]">{children}</div>
      {cta ? (
        <Link href="/desk" className="btn btn-white btn-sm mt-10 !min-h-[52px] !text-[16px]">
          Try the desk
          <Arrow />
        </Link>
      ) : null}
    </>
  );
}

function Ticks({ items }: { items: string[] }) {
  return (
    <ul className="ticks mt-2">
      {items.map((t) => (
        <li key={t}>
          <CheckIcon size={14} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function HoldCard() {
  return (
    <div className="rcard hold w-full max-w-[420px]">
      <div className="rcard-head">
        <span className="text-[13px]">Ticket #13 · NVDA</span>
        <span className="verdict hold">Hold</span>
      </div>
      <dl>
        <dt>Rule fired</dt>
        <dd>R2 weekly buy, Monday</dd>
        <dt>Asset</dt>
        <dd>NVDA · 0xd060…9eec ✓</dd>
        <dt>Amount</dt>
        <dd className="num">75.00 USDG</dd>
        <dt>Minimum out</dt>
        <dd className="num">quote − 1.00%</dd>
      </dl>
      <ul className="reasons">
        <li>
          <b>Over ticket cap.</b> 75 USDG asked, 50 USDG allowed per order.
        </li>
        <li>
          <b>Over period budget.</b> 70 of 120 USDG already approved this week.
        </li>
      </ul>
      <p className="px-3.5 py-2 text-[11px] text-[var(--faint)]">Sample data</p>
    </div>
  );
}

function QueueVis() {
  return (
    <div className="panel glow w-full max-w-[460px] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[14px]">Approval queue</span>
        <span className="chip dot wait">2 waiting</span>
      </div>
      {[
        ["#14", "NVDA", "50.00", "R2 weekly"],
        ["#15", "NVDA", "50.00", "R2 weekly"],
      ].map(([id, a, amt, r], i) => (
        <div key={id} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[var(--line)] bg-black/40 p-3" style={{ animation: `rise .6s var(--ease) ${i * 0.15}s both` }}>
          <span className="text-[13px]">
            <span className="num text-[var(--muted)]">{id}</span> {a} · <span className="num">{amt} USDG</span> · <span className="text-[var(--muted)]">{r}</span>
          </span>
          <span className="flex gap-2">
            <span className="btn btn-sm btn-neon !min-h-[32px]">Approve</span>
            <span className="btn btn-sm btn-line !min-h-[32px]">Reject</span>
          </span>
        </div>
      ))}
      <p className="mt-3 text-[11px] text-[var(--faint)]">Sample data · each button is one transaction from your wallet</p>
    </div>
  );
}

function HistoryVis() {
  const rows = [
    ["TicketExecuted", "#11", "50 USDG → 0.327 NVDA", "ok"],
    ["TicketApproved", "#11", "hash 0x7a…41c2", "ok"],
    ["TicketRejected", "#10", "code 2 · not this week", "hold"],
    ["TicketProposed", "#11", "agent 0x9b…02fe", "wait"],
  ];
  return (
    <div className="panel w-full max-w-[460px] p-4">
      <p className="text-[14px]">Decision history</p>
      <ol className="mt-3 grid gap-2">
        {rows.map(([e, id, d, s], i) => (
          <li key={e + id} className="row-in flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2 text-[13px]" style={{ animationDelay: `${i * 0.12}s` }}>
            <span>
              <span className={`chip dot ${s}`}>{e}</span> <span className="num text-[var(--muted)]">{id}</span>
            </span>
            <span className="num text-[var(--muted)]">{d}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-[var(--faint)]">Sample data · the real list is read from the desk contract&apos;s logs</p>
    </div>
  );
}

function NodeVis() {
  const nodes = [
    { t: "Asset proof", x: "left-0 top-[30%]" },
    { t: "Chainlink price", x: "left-0 top-[62%]" },
    { t: "Pool quote", x: "right-0 top-[30%]" },
    { t: "Gas price", x: "right-0 top-[62%]" },
    { t: "Your approval", x: "left-1/2 top-[88%] -translate-x-1/2" },
    { t: "Rules (hash)", x: "left-1/2 top-[4%] -translate-x-1/2" },
  ];
  return (
    <div className="relative h-[380px] w-full max-w-[600px] max-[640px]:h-[340px]">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 380" preserveAspectRatio="none" aria-hidden="true">
        {["M150 132H300V190", "M150 252H300V190", "M450 132H300V190", "M450 252H300V190", "M300 190V340", "M300 40V190"].map((d) => (
          <path key={d} d={d} className="flowline" stroke="rgba(200,255,46,.55)" strokeWidth="1.2" fill="none" />
        ))}
      </svg>
      {nodes.map((n) => (
        <span key={n.t} className={`absolute ${n.x} -translate-y-1/2 rounded-[12px] border border-[var(--line-2)] bg-[#0b0d0a] px-3 py-2 text-[13px] max-[640px]:text-[11.5px]`}>
          {n.t}
        </span>
      ))}
      <div className="panel glow absolute left-1/2 top-1/2 w-[230px] -translate-x-1/2 -translate-y-1/2 p-3 max-[640px]:w-[170px]">
        <span className="inline-flex items-center gap-2 text-[13px]">
          <MarkGlyph size={16} className="text-[var(--neon)]" /> Review card
        </span>
        <p className="mt-1.5 text-[12px] text-[var(--muted)]">Proceed or Hold, with every reason</p>
      </div>
    </div>
  );
}

const STATUS: { f: string; s: "Prototype" | "Concept"; n: string }[] = [
  { f: "Plain-text strategy reader + clarifying questions", s: "Prototype", n: "Deterministic patterns in the browser; no AI model." },
  { f: "Rule check with live asset proof", s: "Prototype", n: "Vetted list + proxy code hash + beacon slot + supply, read on chain." },
  { f: "Scenario run and review cards", s: "Prototype", n: "Same checks as the contract; cost from live gas, fee tier and quote." },
  { f: "Approval queue: manual approve / reject", s: "Prototype", n: "Practice mode in the browser, and on chain with the live, source-verified OddroOrderDesk." },
  { f: "Execute an approved ticket (USDG → stock token)", s: "Prototype", n: "Uniswap v3 SwapRouter02, output forced to you; tested on a Robinhood Chain fork." },
  { f: "Robinhood Chain Testnet", s: "Concept", n: "Network proven (chain 46630), but the router, USDG and stock tokens do not exist there." },
  { f: "Alerts: bell inbox + browser notifications", s: "Prototype", n: "Free for every connected wallet: ticket waiting, expiring, executed or not, desk paused." },
  { f: `Hosted desks; more room at 0.1 % of ${BRAND.symbol} supply`, s: "Prototype", n: `Sign one message, the server reads your balance on chain. ${TOKEN.isLive ? "Holder tier is active." : "Holder tier unlocks at launch."}` },
];

export default function Home() {
  return (
    <>
      <JsonLd data={appLd} />
      <Hero />
      <div className="h-[120px] max-[640px]:h-[60px]" aria-hidden="true" />
      <Rule />
      <Statement />
      <Features />
      <div className="h-[200px] max-[640px]:h-[80px]" aria-hidden="true" />
      <Tabs
        testid="tabs-card"
        items={[
          {
            id: "card",
            label: "The review card",
            body: (
              <TabText title="See why an order may go, or why it waits">
                <p>
                  Before anything is signed, each order the agent proposes becomes a card: the rule that fired, the asset with its on-chain proof,
                  the amount, the estimated cost and a verdict, Proceed or Hold, with every reason and its numbers.
                </p>
              </TabText>
            ),
            visual: <HoldCard />,
          },
          {
            id: "queue",
            label: "Approval queue",
            body: (
              <TabText title="Nothing buys until you say so">
                <p>Cards that pass wait in a queue. You approve or reject each one by hand. On chain the approval names the ticket&apos;s hash, so it can only approve exactly what the card showed.</p>
              </TabText>
            ),
            visual: <QueueVis />,
          },
          {
            id: "history",
            label: "Decision history",
            body: (
              <TabText title="Every decision, with its transaction">
                <p>Proposed, approved, rejected, cancelled, expired, executed: the history is read from the desk contract&apos;s events, each with an explorer link. Refused proposals leave no event, so the desk keeps them in your browser.</p>
              </TabText>
            ),
            visual: <HistoryVis />,
          },
        ]}
      />
      <div className="h-[200px] max-[640px]:h-[80px]" aria-hidden="true" />
      <Tabs
        testid="tabs-trust"
        items={[
          {
            id: "live",
            label: "Live chain data",
            body: (
              <TabText title="Read from the chain, with the source" cta={false}>
                <Ticks
                  items={[
                    `Block, gas price and the Chainlink ETH/USD price on ${CHAIN.name}.`,
                    "Each supported stock token re-proven: vetted list, proxy code hash, beacon slot, minted supply.",
                    "Its Chainlink price with the time it was updated (feeds rest outside market hours).",
                    "The deepest Uniswap v3 pool against USDG and a live quote for your order size.",
                  ]}
                />
                <div className="mt-6">
                  <LiveStrip />
                </div>
              </TabText>
            ),
            visual: (
              <div className="w-full max-w-[460px]">
                <AssetRows />
              </div>
            ),
          },
          {
            id: "contract",
            label: "The desk contract",
            body: (
              <TabText title="Limits the contract enforces" cta={false}>
                <Ticks
                  items={[
                    "One agent, one asset, a cap per order and a budget per period, a minimum gap between approvals.",
                    "Only the owner approves or rejects, ticket by ticket, bound to the ticket hash.",
                    "checkTicket, checkDecision and checkExecute say why before anyone signs.",
                    "Non-custodial: USDG moves from your wallet only inside an execution, output straight to you.",
                    "No admin, no fee, no upgrade. Pause takes effect from the next block.",
                  ]}
                />
                <p className="mt-6 text-[14px] text-[var(--muted)]">
                  {deskLive() ? `OddroOrderDesk ${CONTRACTS.desk}` : "OddroOrderDesk address not configured; the desk runs in practice mode."}
                </p>
              </TabText>
            ),
            visual: <NodeVis />,
          },
          {
            id: "wallet",
            label: "Your wallet",
            body: (
              <TabText title="Your keys stay yours" cta={false}>
                <Ticks
                  items={[
                    "Practice mode needs no wallet at all.",
                    "Connecting adds Robinhood Chain to your wallet and reads your USDG balance and allowance.",
                    "The agent proposes with its own key; it can never approve, and never raise its own limits.",
                    "You can pause the desk, cancel a ticket or reset the allowance at any time.",
                  ]}
                />
              </TabText>
            ),
            visual: <QueueVis />,
          },
        ]}
      />
      <div className="h-[160px] max-[640px]:h-[60px]" aria-hidden="true" />
      <Rule />
      <section className="wrap py-20 max-[640px]:py-12" data-testid="status">
        <h2 className="display h-sec max-w-[760px]" data-reveal="">
          What runs today
        </h2>
        <div className="mt-10 grid gap-px overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--line)]">
          {STATUS.map((r) => (
            <div key={r.f} className="grid gap-2 bg-[var(--ground)] p-4 md:grid-cols-[minmax(0,1.2fr)_120px_minmax(0,1.4fr)] md:items-center" data-reveal="">
              <span className="text-[15px]">{r.f}</span>
              <span>
                <StatusBadge status={r.s} />
              </span>
              <span className="text-[14px] text-[var(--muted)]">{r.n}</span>
            </div>
          ))}
        </div>
      </section>
      <Rule />
      <section className="py-[130px] text-center max-[640px]:py-16">
        <h2 className="display h-sec mx-auto uppercase" data-reveal="">
          Review first
          <br />
          then sign
        </h2>
      </section>
      <Rule />
      <section className="grid lg:grid-cols-2">
        <div className="px-[var(--pad)] py-12">
          <Steps
            items={[
              { title: "Write the strategy", text: "One periodic buy, one supported stock token, in plain words or with the form. Answer the questions it asks." },
              { title: "Run the scenarios", text: "Within budget, over the cap, the wrong asset, not approved yet: four review cards, each with its verdict." },
              { title: "Approve by hand", text: "Passing tickets wait in the queue. Approve or reject each one; on chain, an approved ticket can then execute." },
            ]}
          />
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/desk" className="btn btn-white">
              Open the desk
              <Arrow />
            </Link>
            <Link href="/history" className="btn btn-line">
              See the history
            </Link>
          </div>
        </div>
        <div className="dots grid place-items-center px-6 py-12">
          <div className="panel w-full max-w-[266px] p-4 text-center" data-reveal="">
            <MarkGlyph size={22} className="mx-auto text-[var(--neon)]" />
            <p className="mt-2 text-[14px]">Your approval queue</p>
            <div className="mt-3 grid gap-0 text-left">
              {[
                ["#14 NVDA", "50.00 USDG"],
                ["#15 NVDA", "50.00 USDG"],
                ["#16 NVDA", "50.00 USDG"],
              ].map(([a, b]) => (
                <div key={a} className="flex items-center justify-between gap-2 border-b border-[var(--line)] py-3 text-[13px]">
                  <span>
                    {a}
                    <span className="block text-[11.5px] text-[var(--muted)]">{b}</span>
                  </span>
                  <span className="chip dot wait">Waiting</span>
                </div>
              ))}
            </div>
            <Link href="/desk" className="mt-3 inline-flex w-full items-center justify-center rounded-[99px] border border-[var(--line-2)] py-2 text-[13px] hover:border-[var(--neon)]">
              Review now
            </Link>
            <p className="mt-2 text-[10.5px] text-[var(--faint)]">Sample data</p>
          </div>
        </div>
      </section>
    </>
  );
}
