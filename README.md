# Oddro

Oddro is an order review desk for people who let an agent buy Robinhood Chain stock tokens on a schedule. You write one periodic-buy strategy for one supported asset; Oddro turns it into rules you can read, asks when something is unclear, and shows every order the agent proposes as a review card: the rule that fired, the asset with its on-chain proof, the amount, the estimated cost and a verdict, Proceed or Hold, with the reasons. Nothing is bought until you approve that exact ticket by hand.

Stock-token trading agents with reviewable rules and manual approvals. Every order waits on a review card for your approval on Robinhood Chain.

## Read this before anything else

This repository is the working code behind https://oddro.xyz.

- **What runs today.** The desk (`/desk`): a plain-text strategy reader (fixed patterns, no AI model) with clarifying questions, the rule check, a run of four scenarios (within budget, over the cap, wrong asset, not approved yet) that become review cards, and an approval queue with approve / reject / execute in practice mode. Practice mode needs no wallet and no token. `/history` reads the desk contract's events; `/method` lists every rule, source and limit.
- **What reads live data.** Block, gas price and Chainlink ETH/USD; for each supported stock token: its on-chain identity proof (vetted list, proxy code hash, beacon slot, minted supply), its Chainlink price with age, its deepest Uniswap v3 pool against USDG, and a QuoterV2 quote for the order size. All from Robinhood Chain through its RPC; nothing failed is cached.
- **The contract.** `OddroOrderDesk` enforces the same rules on chain: the agent proposes tickets, the owner approves (bound to the ticket hash) or rejects each one, and an approved ticket can execute through the Uniswap v3 SwapRouter02 with the output forced to the owner. It is **live on Robinhood Chain** at `0xfe0cf0b102d1a04c562234369e27661b514f55fb` (deployed 25 Nov 2026, block 122888907), source verified on Blockscout and Sourcify; `verify-deployment` prints MATCH against this repository.
- **Token features (Prototype).** Alerts are free for every connected wallet: a bell inbox computed from the desk contract (ticket waiting, expiring, executed or not, desk paused) and browser notifications while a tab is open. Hosted desks and saved strategies live on the server after you sign one gasless Sign-In with Ethereum message; a wallet holding at least 0.1 % of the $ODDRO supply (read on chain) gets more room. Before launch the holder tier shows "Unlocks at launch".
- **Planned, not built.** Robinhood Chain Testnet support (the network answers, but the router, USDG and the stock tokens do not exist there).
- **What nothing here claims.** No outside security review of the contract yet (use small amounts first), no safety guarantee, no advice, and no promised value for $ODDRO. A ticket that passes every rule is not a reason to buy.

## Layout

| Path | What it is |
|---|---|
| `src/app/` | Pages (`/`, `/desk`, `/history`, `/method`, `/token`) and API routes (`/api/chain`, `/api/assets`, `/api/quote`, `/api/activity`, `/api/rpc`, `/api/holder`, `/api/hosted`). |
| `src/components/` | Interface: home sections, the desk (review cards, queue, on-chain desk), history, wallet dialog. |
| `src/config/` | `brand.ts` (name, ticker, token address, links), `contracts.ts` (deployed desk address), `dex.ts` (chain addresses read), `assets.ts` (supported stock tokens). |
| `src/lib/desk/` | The rule engine: strategy reader, reason bits (mirroring the contract), review checks, scenarios. |
| `src/lib/holder/` | Holder session (EIP-4361 message check), tier math (0.1 % of supply) and hosted-desk quotas. `src/config/quota.ts` holds the numbers. |
| `src/lib/server/` | Chain reads: asset proofs and prices, quotes, desk activity from logs, relay and rate limits. |
| `contracts/` | Solidity sources (`src/OddroOrderDesk.sol`, `src/OddroTicketMath.sol`) and Foundry tests (`test/`). |
| `examples/` | `agent.mjs`: an example agent that checks with the contract, then proposes; it can never approve. |
| `scripts/` | `verify-deployment` and the contract artifact builder. |
| `public/` | Brand images and wallet logos. |

## Run the tests

Node.js 20 or newer.

```
npm install
npm run typecheck
npm test
```

Contracts use [Foundry](https://book.getfoundry.sh/):

```
cd contracts
bash setup.sh
forge test --no-match-contract Fork
forge test --match-contract Fork --fork-url https://rpc.mainnet.chain.robinhood.com --evm-version cancun
```

### What was checked for this snapshot

2026-11-25 (UTC), Node.js 20+, forge 1.x: `npm run typecheck` exit 0; `npm test` 42 pass / 0 fail; `next build` 21 routes; `forge test` 45 passed (OddroOrderDeskTest 42 unit and fuzz tests at 1,024 runs, OddroOrderDeskInvariantTest 3 invariants at 64 runs x 48 calls); fork suite OddroForkTest 5 passed against Robinhood Chain mainnet state (a full propose, approve and execute through the real SwapRouter02 and NVDA/USDG pool). Browser end-to-end run on a local fork with chain id 4663 (injected wallets, the example agent, a test ERC-20 standing in for $ODDRO, verify-deployment): 11 passed / 0 failed (wallet dialog and add-chain, header fit at 360/390/1440, practice desk, opening a desk, the agent refused for wrong asset and over cap, the bell and a browser notification after the agent's proposal, manual approval in the browser, execution through the real router to the owner, history from logs, gap and pause, a wallet under 0.1 % stays Free and one over is Holder, the free tier's third hosted desk refused by the server), plus verify-deployment MATCH for the fork deployment and MISMATCH for a wrong address. Mainnet deployment 2026-11-25 (block 122888907): `verify-deployment` MATCH (runtime with ROUTER = SwapRouter02, creation input = this build + constructor argument); source verified on Sourcify (exact match) and Blockscout.

## Look at the site

```
npm install
npm run build
npm start
```

Open http://localhost:6720. Everything works with no configuration: practice mode, live prices, pools, quotes and asset proofs read through the public Robinhood Chain RPC. Without `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` the wallet dialog shows WalletConnect as "Not configured on this site yet". `ROBINHOOD_RPC_URL` (an `https://` RPC URL with `eth_getLogs`) is recommended for the history page.

## Contracts

| Contract | Address | Explorer |
|---|---|---|
| OddroOrderDesk (+ internal library OddroTicketMath) | `0xfe0cf0b102d1a04c562234369e27661b514f55fb` (block 122888907, tx `0x29b6c7f2a36fb62fc45a2e905527d12bf0054ddda1eb361df501cb1988d79ea7`) | [Blockscout](https://robinhoodchain.blockscout.com/address/0xfe0cf0b102d1a04c562234369e27661b514f55fb?tab=contract) (source verified) |

A desk belongs to one owner and names one agent, one asset, the quote token, the pool fee tier, a cap per ticket, a cap per fixed period, a minimum gap between approvals, a maximum ticket life, an end date and a rule hash. `checkTicket`, `checkDecision` and `checkExecute` return a reason bitmask before anyone signs. The contract has no admin, no fee, no upgrade, no payable function, and holds no balance between transactions: USDG moves from the owner's wallet only inside the execution of a ticket the owner approved, and the bought tokens go straight to the owner. One constructor argument: the Uniswap v3 SwapRouter02 on Robinhood Chain (`0xcaf681a66d020601342297493863e78c959e5cb2`). Measured gas: deploy 3,411,190 on mainnet; openDesk ~334,000; propose ~238,000; approve ~86,000; reject ~36,500; execute ~239,000.

## Verify a deployment

```
npm run verify-deployment -- --desk 0xfe0cf0b102d1a04c562234369e27661b514f55fb --desk-tx 0x29b6c7f2a36fb62fc45a2e905527d12bf0054ddda1eb361df501cb1988d79ea7
```

The script checks the chain id, compares the runtime code on Robinhood Chain with the build in this repository (with the router written into its immutable), checks that the router is the SwapRouter02 above, and that the creation transaction carries exactly this build plus that constructor argument. It prints MATCH or the first difference. Set `VERIFY_RPC_URL` to use another RPC.

## Add the network to your wallet

| Field | Value |
|---|---|
| Network | Robinhood Chain |
| Chain ID | 4663 |
| Currency | ETH |
| RPC | https://rpc.mainnet.chain.robinhood.com |
| Explorer | https://robinhoodchain.blockscout.com |

The site offers to add it when you connect.

## Data sources and limits

- Robinhood Chain RPC (official endpoint, with public fallbacks for reads): blocks, gas price, contract reads, Multicall3, logs.
- Chainlink on Robinhood Chain: ETH/USD and the stock-token feeds (standard market-hours feed preferred). Stock feeds rest outside market hours; the site shows the age and marks old answers as stale.
- Uniswap v3 on Robinhood Chain: factory `getPool` against USDG for every fee tier, pool depth as the pool's USDG balance, QuoterV2 for quotes.
- The vetted stock-token list (`src/lib/fixtures/stock-tokens.json`) only says where to look; each asset is re-proven on chain before it is listed.
- Caches: asset board 60 s, quotes 20 s, chain facts 8 s, desk activity 8 s. Failed or incomplete reads are never cached; a missing value shows as "Not known".
- Periods are fixed 7- or 30-day windows from when a desk opens. The schedule's weekday is a guide for the agent; the contract enforces the minimum gap between approvals.

## Token

$ODDRO is the community token of Oddro on Robinhood Chain. Contract address: announced on https://oddro.xyz at launch. It has no promised value. The desk never needs it.

Token features:

| Feature | Free (any wallet) | Holder (≥ 0.1 % of supply) |
|---|---|---|
| Hosted desks | 2 | 12 |
| Different assets across hosted desks | 2 | 12 |
| Saved strategies | 3 | 30 |
| Alerts (bell + browser notifications) | yes | yes |

How the check works: the wallet signs one EIP-4361 message (no gas) naming the site, chain 4663, an expiry of at most 4 hours and a random nonce. The browser keeps it in the tab and sends it with each hosted-desk request; the server checks the signature, the domain and URI against a fixed allowlist, the chain, the expiry and that it was not signed out, then reads `balanceOf` and `totalSupply` on chain (cached at most 30 s). Holder = balance × 1,000 ≥ supply. Quotas are enforced on the server. Smart-contract wallets cannot sign in yet (EOA only). No fee discounts, rewards or revenue share.

## Deploy your own

1. Import the repository into a Next.js host (framework preset Next.js, root `./`). Nothing is required to build.
2. Optional environment variables (names and formats only):

| Variable | What it is for | Format |
|---|---|---|
| `ROBINHOOD_RPC_URL` | Server reads and log scans | `https://…` RPC URL that serves `eth_getLogs` |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | Browser RPC override | `https://…` (public) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect in the wallet dialog | 32 hex characters |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Shared store: rate limits, hosted desks, signed-out sessions. Without it they live in one instance's memory (bounded; the page says saved data may be lost on restart) | REST URL and token |

3. Point the domain at the host. Check `/` (200), `/api/chain` (JSON with a block number), `/api/assets` (supported assets with `"proven": true`).
4. Contract: deploy `OddroOrderDesk` with the SwapRouter02 address as its only constructor argument (for example `forge create src/OddroOrderDesk.sol:OddroOrderDesk --constructor-args 0xcaf681a66d020601342297493863e78c959e5cb2` from `contracts/`), paste the address, block and transaction into `src/config/contracts.ts`, then run `npm run verify-deployment`.

## Contributing

Fork the repository, branch from `main`, and run `npm run typecheck`, `npm test` and `npm run build`, and `bash setup.sh && forge test` in `contracts/` before opening a pull request. For a bug, open an issue with the expected and actual behavior and minimal steps. Keep private keys, seed phrases and environment values out of issues.

## Security

Please do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. The contracts, the API routes and the transactions the site builds are in scope; wallets, RPC providers, explorers, Uniswap and token issuers are not. There is no bug bounty.

## Notices and license

This project's original code is released under the [MIT License](LICENSE). Self-hosted fonts Archivo, Outfit and Chivo Mono are under the SIL Open Font License (license files in `src/fonts/`). Wallet logos in `public/wallets/` belong to their projects and are used only to identify each wallet. The Oddro name, logo and artwork belong to the project and are not licensed for reuse as a brand. Oddro is not affiliated with Robinhood.
