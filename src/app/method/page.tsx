import Link from "next/link";
import { BRAND, CHAIN, explorerAddress } from "@/config/brand";
import { CONTRACTS, deskLive } from "@/config/contracts";
import { ETH_USD_FEED, FEED_DIRECTORY, STOCK_BEACON, STOCK_PROXY_CODEHASH, UNISWAP_V3, USDG, WETH } from "@/config/dex";
import { SUPPORTED } from "@/config/assets";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { JsonLd } from "@/components/JsonLd";
import { BIT_ORDER, BIT_WORDS, BITS } from "@/lib/desk/bits";
import { GAS } from "@/lib/desk/scenarios";
import { FAQ } from "@/lib/faq";
import { breadcrumbLd, faqLd, pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/method",
  title: "Method: how a ticket is checked, and the limits",
  description: "How Oddro turns a strategy into rules, checks every ticket with the same reason bits as its contract, proves stock-token identity on chain, estimates cost, and what it does not do.",
});

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="display h-card scroll-mt-8" data-reveal="">
      {children}
    </h2>
  );
}

function Addr({ a, label }: { a: string; label: string }) {
  return (
    <tr>
      <td className="text-[var(--muted)]">{label}</td>
      <td>
        <a className="elink num text-[12.5px]" href={explorerAddress(a)} target="_blank" rel="noreferrer">
          {a}
        </a>
      </td>
    </tr>
  );
}

export default function MethodPage() {
  return (
    <>
      <JsonLd data={[breadcrumbLd([{ name: "Method", path: "/method" }]), faqLd(FAQ)]} />
      <PageHead eyebrow="Method & limits" title="How a ticket is checked.">
        <p>The site and the contract use the same rules and the same reason bits. Here is every rule, every source and every limit.</p>
      </PageHead>
      <div className="wrap grid gap-14 pb-24">
        <section className="grid gap-5">
          <H id="flow">From a sentence to a signed approval</H>
          <ol className="grid gap-3 md:grid-cols-2">
            {[
              ["Strategy", "One periodic buy of one supported asset. The reader (fixed patterns, no AI model) extracts asset, order size, schedule, budget and price protection, and asks when something is missing, doubled or unsupported."],
              ["Rules", "R1 asset, R2 schedule (minimum gap between approvals: 20 h daily, 6 d weekly, 13 d every two weeks, 27 d monthly), R3 per order, R4 budget per fixed 7- or 30-day period, R5 price protection, R6 ticket life, R7 manual approval. Hashed (keccak256) into the rule hash the desk stores."],
              ["Scenarios", "Four tickets: within budget, over the cap (1.5 × the order), the wrong asset, and a valid ticket the agent tries to execute before approval. Each is checked like checkTicket / checkExecute and becomes a review card."],
              ["Queue", "Passing tickets wait. Approve reserves the amount in the current period and starts the gap; reject records a code. On chain, approve(ticketId, hash) only succeeds for the exact ticket on the card."],
            ].map(([t, d], i) => (
              <li key={t} className="panel panel-pad" data-reveal="">
                <p className="text-[13px] text-[var(--neon)]">Step {i + 1}</p>
                <p className="mt-1 text-[17px] font-medium">{t}</p>
                <p className="mt-2 text-[14px] leading-[21px] text-[var(--muted)]">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-5">
          <H id="bits">Reason bits</H>
          <p className="max-w-[760px] text-[15px] text-[var(--muted)]">A check returns a bitmask: 0 means Proceed; each set bit is one reason for Hold. The positions are the same as in OddroTicketMath.sol (a test reads the contract source and fails on any difference).</p>
          <div className="overflow-x-auto rounded-[14px] border border-[var(--line)]">
            <table className="tbl" data-testid="bits-table">
              <thead>
                <tr>
                  <th>Bit</th>
                  <th>Label</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                {BIT_ORDER.map((n) => (
                  <tr key={n}>
                    <td className="num text-[var(--neon)]">{BITS[n].toString(2).length - 1}</td>
                    <td className="whitespace-nowrap">{BIT_WORDS[n].label}</td>
                    <td className="text-[var(--muted)]">{BIT_WORDS[n].why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-5">
          <H id="sources">Data sources</H>
          <p className="max-w-[760px] text-[15px] text-[var(--muted)]">
            Every number on a card is read from {CHAIN.name} (chain {CHAIN.id}) through the official RPC, with the time it was read. Nothing failed is cached; a missing read shows as Not known. Supported assets: {SUPPORTED.join(", ")} (stock tokens with a Chainlink feed and a Uniswap v3 pool against USDG).
          </p>
          <div className="overflow-x-auto rounded-[14px] border border-[var(--line)]">
            <table className="tbl">
              <tbody>
                <Addr label="USDG (quote token, 6 decimals)" a={USDG.address} />
                <Addr label="WETH" a={WETH} />
                <Addr label="Uniswap v3 factory" a={UNISWAP_V3.factory} />
                <Addr label="Uniswap v3 SwapRouter02" a={UNISWAP_V3.swapRouter02} />
                <Addr label="Uniswap v3 QuoterV2" a={UNISWAP_V3.quoterV2} />
                <Addr label="Chainlink ETH / USD" a={ETH_USD_FEED} />
                <Addr label="Stock-token beacon" a={STOCK_BEACON} />
                <tr>
                  <td className="text-[var(--muted)]">Stock-token proxy code hash</td>
                  <td className="num break-all text-[12.5px]">{STOCK_PROXY_CODEHASH}</td>
                </tr>
                <tr>
                  <td className="text-[var(--muted)]">Stock price feeds</td>
                  <td>
                    <a className="elink" href={FEED_DIRECTORY} target="_blank" rel="noreferrer">
                      Chainlink feed directory for Robinhood Chain
                    </a>{" "}
                    <span className="text-[var(--muted)]">(standard market-hours feed preferred; stale outside market hours)</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[14px] text-[var(--muted)]">
            Identity of an asset: its address must be on the vetted list (every proxy that ever pointed at the official beacon, proven 23 Nov 2026), its runtime code must hash to the stock-token proxy, its ERC-1967 beacon slot must hold the official beacon, and its supply must be above zero. A ticker alone is never trusted.
          </p>
          <p className="text-[14px] text-[var(--muted)]">
            Cost on a card: gas units measured in the contract tests (propose {GAS.propose.toLocaleString("en-US")}, approve {GAS.approve.toLocaleString("en-US")}, reject {GAS.reject.toLocaleString("en-US")}, execute {GAS.execute.toLocaleString("en-US")} on a fork through the real router) × the live gas price, in ETH and in USD via Chainlink ETH/USD; the pool fee tier; and the QuoterV2 answer for the order size compared with the Chainlink price. That last gap includes the fee, the price impact and any difference between the pool and the feed.
          </p>
        </section>

        <section className="grid gap-5">
          <H id="contract">The desk contract</H>
          <div className="panel panel-pad grid gap-3 text-[15px]" data-reveal="">
            <p>
              <span className="font-medium">OddroOrderDesk</span> (+ internal library OddroTicketMath), live on {CHAIN.name} since 25 Nov 2026 (block {CONTRACTS.block.toLocaleString("en-US")}), source verified on Blockscout:{" "}
              {deskLive() ? (
                <a className="elink num" href={explorerAddress(CONTRACTS.desk)} target="_blank" rel="noreferrer">
                  {CONTRACTS.desk}
                </a>
              ) : (
                <span className="text-[var(--warn)]">Address not configured on this build; the desk runs in practice mode.</span>
              )}
            </p>
            <ul className="grid list-disc gap-1.5 pl-5 text-[14px] text-[var(--muted)]">
              <li>openDesk: one agent, one asset, USDG, the pool fee tier, cap per ticket, cap per period, period length, minimum gap, ticket life, end date, rule hash.</li>
              <li>propose (agent only): reverts with Refused(bits) unless checkTicket would return 0.</li>
              <li>approve(ticketId, hash) / reject(ticketId, code): owner only, one ticket at a time. Approve re-checks the rules, the period budget and the gap.</li>
              <li>cancel (owner or agent), expire (anyone, after the deadline); an approved ticket gives its amount back to its period.</li>
              <li>execute (owner or agent, approved tickets only): USDG from the owner&apos;s wallet into SwapRouter02 exactInputSingle with the recipient forced to the owner, the minimum out enforced, the received amount measured, the router allowance reset, leftovers refused.</li>
              <li>pause (owner) or agentPause (the agent stopping itself) from the next block; updateRules makes older tickets unapprovable; close is final.</li>
              <li>No admin, no fee, no upgrade, not payable. Native ETH is not supported. Fee-on-transfer quote tokens are refused; tokens that return nothing are handled.</li>
            </ul>
            <p className="note">
              Tested with unit, fuzz, invariant and Robinhood Chain fork tests (a full propose, approve and execute against the real NVDA/USDG pool). It has had no outside security review yet: use small amounts first.
            </p>
          </div>
        </section>

        <section className="grid gap-5">
          <H id="limits">What Oddro does not do</H>
          <ul className="grid gap-2 text-[15px] text-[var(--muted)]">
            {[
              "It only buys, on a schedule. No selling, no take-profit or stop-loss, no price conditions; the reader asks you to drop them.",
              "One asset per desk, from the supported list. Other tokens are refused by the contract (wrong asset).",
              "Periods are fixed windows of 7 or 30 days counted from when the desk opens, not calendar weeks or months.",
              "The scheduled day is a guide for the agent; the contract enforces the minimum gap between approvals, not a weekday.",
              "Prices from stock feeds rest outside market hours and can be stale; the card shows the age. A quote can move between the card and execution; the minimum out protects you.",
              `Robinhood Chain Testnet (chain 46630): its RPC and explorer answer, but the router, USDG and the stock tokens do not exist there, so the desk cannot run on it. Testing happens in practice mode and on a local fork of ${CHAIN.name} mainnet.`,
              "Stock tokens on Robinhood Chain are tokens, not the shares themselves, and their issuer can block addresses.",
              "No advice. A ticket that passes every rule is not a recommendation to buy.",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-[var(--neon)]" />
                {t}
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-5">
          <H id="status">Status</H>
          <div className="grid gap-2 text-[14px]">
            {[
              ["Strategy reader, rules, scenario cards, practice queue", "Prototype"],
              ["Live asset proofs, prices, pools, quotes, gas", "Prototype"],
              ["OddroOrderDesk contract and the on-chain queue", "Prototype"],
              ["Execution through SwapRouter02 (fork-tested)", "Prototype"],
              ["Robinhood Chain Testnet", "Concept"],
              ["Alerts (bell + browser notifications), free", "Prototype"],
              [`Hosted desks with the ${BRAND.symbol} holder tier (0.1 % of supply)`, "Prototype"],
            ].map(([f, s]) => (
              <div key={f} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2">
                <span>{f}</span>
                <StatusBadge status={s as "Prototype" | "Concept"} />
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-5">
          <H id="faq">Questions</H>
          <div className="grid gap-3">
            {FAQ.map((f) => (
              <details key={f.q} className="panel panel-pad" data-reveal="">
                <summary className="cursor-pointer text-[16px] font-medium">{f.q}</summary>
                <p className="mt-3 text-[14px] leading-[22px] text-[var(--muted)]">{f.a}</p>
              </details>
            ))}
          </div>
          <Link href="/desk" className="btn btn-white w-fit">
            Open the desk
          </Link>
        </section>
      </div>
    </>
  );
}
