"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NAV } from "@/config/nav";
import { Wordmark } from "@/components/site/Mark";
import { CloseIcon } from "@/components/site/Icons";
import { NavWallet } from "@/components/wallet/WalletButton";
import { AlertBell } from "@/components/holder/AlertBell";
import { CaBox } from "@/components/site/CaCopy";
import { useFocusTrap } from "@/components/site/useFocusTrap";

/* The reference's header: wordmark left, four text links centred, one outlined pill right; a hairline rule with "+" marks below. */
export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="hd">
        <div className="hd-bar">
          <Link href="/" aria-label="Oddro home" className="shrink-0">
            <Wordmark size={24} />
          </Link>
          <nav aria-label="Main" className="hd-nav">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={path === n.href || path.startsWith(`${n.href}/`) ? "page" : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2 min-[1101px]:ml-0">
            <AlertBell />
            <NavWallet label="Connect wallet" />
            <button type="button" className="rq-iconbtn min-[1101px]:hidden" aria-label="Open the menu" aria-expanded={open} onClick={() => setOpen(true)} data-testid="menu-open">
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>
          </div>
        </div>
        <div className="rule">
          <span className="plus" style={{ left: 0 }} />
          <span className="plus" style={{ left: "100%" }} />
        </div>
      </header>
      {open ? <MobileMenu onClose={() => setOpen(false)} path={path} /> : null}
    </>
  );
}

function MobileMenu({ onClose, path }: { onClose: () => void; path: string }) {
  const trap = useRef<HTMLDivElement>(null);
  useFocusTrap(trap, true, onClose);
  return createPortal(
    <div className="hd-menu" role="dialog" aria-modal="true" aria-label="Menu" ref={trap} data-testid="menu">
      <div className="wrap flex h-[72px] items-center justify-between">
        <Wordmark size={22} />
        <button type="button" className="rq-iconbtn" aria-label="Close the menu" onClick={onClose}>
          <CloseIcon size={16} />
        </button>
      </div>
      <nav className="wrap mt-2" aria-label="Main">
        {[{ href: "/", label: "Home" }, ...NAV].map((n) => (
          <Link key={n.href} href={n.href} onClick={onClose} className="big" aria-current={path === n.href ? "page" : undefined}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="wrap mt-8 grid gap-3 pb-10">
        <Link href="/desk" className="btn btn-white w-full" onClick={onClose}>
          Open the desk
        </Link>
        <CaBox testid="menu-ca" />
      </div>
    </div>,
    document.body,
  );
}
