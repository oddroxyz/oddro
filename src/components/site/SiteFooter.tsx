import Link from "next/link";
import { BRAND, CHAIN, hasGithub } from "@/config/brand";
import { CONTRACTS, deskLive } from "@/config/contracts";
import { UNISWAP_V3 } from "@/config/dex";
import { Wordmark } from "@/components/site/Mark";
import { CaBox } from "@/components/site/CaCopy";
import { XIcon } from "@/components/site/Icons";

/* The reference's footer: wordmark + contact row left, three uppercase column heads right, a rule, then the copyright line. */
export function SiteFooter() {
  return (
    <footer className="ft">
      <div className="rule">
        <span className="plus" style={{ left: 0 }} />
        <span className="plus" style={{ left: "100%" }} />
      </div>
      <div className="h-[120px] max-[640px]:h-[60px]" aria-hidden="true" />
      <div className="rule">
        <span className="plus" style={{ left: 0 }} />
        <span className="plus" style={{ left: "100%" }} />
      </div>
      <div className="wrap pb-12 pt-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <Wordmark size={30} />
            <div className="mt-5 flex flex-wrap items-center gap-4 text-[15px] text-[var(--muted)]">
              <a href={BRAND.x} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-[var(--neon)]">
                <XIcon size={14} /> {BRAND.xHandle}
              </a>
              {hasGithub ? (
                <a href={BRAND.github} target="_blank" rel="noreferrer" className="hover:text-[var(--neon)]">
                  GitHub
                </a>
              ) : null}
            </div>
            <div className="mt-6 max-w-[440px]">
              <CaBox testid="footer-ca" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-14 gap-y-8 sm:grid-cols-3">
            <div>
              <h4>Product</h4>
              <ul>
                <li><Link href="/desk">Desk</Link></li>
                <li><Link href="/history">History</Link></li>
                <li><Link href="/method">Method</Link></li>
                <li><Link href="/token">{BRAND.symbol}</Link></li>
              </ul>
            </div>
            <div>
              <h4>Chain</h4>
              <ul>
                <li><a href={CHAIN.explorer} target="_blank" rel="noreferrer">Explorer</a></li>
                <li><a href={`${CHAIN.explorer}/address/${UNISWAP_V3.swapRouter02}`} target="_blank" rel="noreferrer">SwapRouter02</a></li>
                <li>
                  {deskLive() ? (
                    <a href={`${CHAIN.explorer}/address/${CONTRACTS.desk}`} target="_blank" rel="noreferrer">OddroOrderDesk</a>
                  ) : (
                    <Link href="/method#contract">Desk contract (not deployed)</Link>
                  )}
                </li>
              </ul>
            </div>
            <div>
              <h4>Notes</h4>
              <ul>
                <li><Link href="/method#limits">Limits</Link></li>
                <li><Link href="/method#sources">Data sources</Link></li>
                <li><a href="/llms.txt">llms.txt</a></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div className="rule" />
      <div className="wrap flex flex-wrap items-center justify-between gap-3 py-8 text-[14px] text-[var(--muted)]">
        <span>© 2026 {BRAND.name}. Independent prototype on {CHAIN.name}; not affiliated with Robinhood. Not financial advice.</span>
        <span>Funds stay in your wallet.</span>
      </div>
    </footer>
  );
}
