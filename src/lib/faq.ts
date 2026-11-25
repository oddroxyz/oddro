/* Questions answered on the method page (and as FAQ structured data). Every answer is true of the site as built. */
import { TOKEN } from "@/config/brand";

export type Faq = { q: string; a: string };

export const FAQ: Faq[] = [
  {
    q: "Does Oddro hold my funds?",
    a: "No. USDG stays in your wallet. When an approved ticket executes, the desk contract pulls exactly the ticket's amount under your allowance, hands it to the Uniswap v3 router and the stock token goes straight to your wallet, all in one transaction. The contract never keeps a balance between transactions and has no admin who could move anything.",
  },
  {
    q: "Can the agent buy without me?",
    a: "No. The agent can only propose tickets. Only the desk's owner can approve one, and the approval names the ticket's hash, so it approves exactly what the review card showed. Execution checks that the ticket is approved, within its deadline, under the current rules and that the desk is not paused.",
  },
  {
    q: "Is the strategy reader an AI?",
    a: "No. It is a fixed set of patterns that runs in your browser. It finds an asset, an order size, a schedule and a budget, and when something is missing or unclear (two assets, no budget, a price condition, selling) it asks a question instead of guessing.",
  },
  {
    q: "How does Oddro know a token is the real stock token?",
    a: "Not from its ticker: many tokens copy stock tickers. An asset is listed only when its address is on the vetted list, its code is the stock-token proxy, its beacon slot holds the official beacon and it has minted supply, all read on chain.",
  },
  {
    q: "What does the cost estimate include?",
    a: "Gas for the next step from the live gas price (and its USD value from the Chainlink ETH/USD feed), the pool's fee tier, and the live quote for your order size compared with the asset's Chainlink price. Anything that could not be read says Not known. Stock feeds rest outside market hours, so the price can be stale; the card says so.",
  },
  {
    q: "Do I need the token?",
    a: "No. The desk, the review cards, the queue, the contract and the alerts work without it. Holding at least 0.1 % of the supply (read on chain after you sign one gasless message) gives more hosted desks, assets and saved strategies." +
      (TOKEN.isLive ? " The token is live, so the tier is active now." : " The token is not live yet, so that tier unlocks at launch."),
  },
  {
    q: "How do alerts work?",
    a: "Connect a wallet and the bell shows what needs you: a ticket waiting for approval, a ticket expiring soon, an execution done, an approved ticket that was not executed in time, a paused desk. Click Enable to also get browser notifications while a tab of Oddro is open. Free for everyone; nothing is sent by email or push when no tab is open.",
  },
  {
    q: "Is Oddro connected to Robinhood?",
    a: "No. Oddro is an independent prototype that reads public contracts on Robinhood Chain. Nothing here is investment advice; a rule that holds is not a promise that a trade is a good one.",
  },
];
