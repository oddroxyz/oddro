"use client";

import { useState } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { CHAIN, explorerAddress, explorerTx } from "@/config/brand";
import { explain, waitForReceipt } from "@/lib/client";
import artifacts from "@/lib/contracts/artifacts.json";
import { UNISWAP_V3 } from "@/config/dex";

/** forge gas report, 25 Nov 2026: 3,410,210 gas for the creation transaction (15,632 bytes of creation code). */
export const DEPLOY_GAS = "about 3.4 million";

export function DeployPanel() {
  const { address, onChain, sendTransaction, switchNetwork } = useWallet();
  const { open } = useWalletModal();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<{ address: string; tx: string; block: number } | null>(null);
  const art = artifacts.contracts.OddroOrderDesk;

  async function deploy() {
    if (!address) return open();
    if (!onChain) return switchNetwork();
    setBusy(true);
    setMsg(null);
    try {
      // Constructor argument: the Uniswap v3 SwapRouter02 address (abi-encoded, 32 bytes).
      const arg = UNISWAP_V3.swapRouter02.slice(2).toLowerCase().padStart(64, "0");
      const hash = await sendTransaction({ data: `${art.creation}${arg}` as `0x${string}` });
      setMsg(`Sent ${hash}. Waiting for the block…`);
      const rc = await waitForReceipt(hash, 300_000);
      if (!rc.ok || !rc.contractAddress) throw new Error("The deployment reverted.");
      setDone({ address: rc.contractAddress, tx: hash, block: rc.blockNumber });
      setMsg(null);
    } catch (e) {
      setMsg(explain(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="panel panel-pad" data-testid="deploy-panel">
        <h2 className="display h-card">OddroOrderDesk</h2>
        <p className="mt-2 text-[13px] text-[var(--muted)] break-all">One constructor argument: the router, Uniswap v3 SwapRouter02 {UNISWAP_V3.swapRouter02}. No owner of the contract. Creation code sha256 {art.sha256.slice(0, 16)}…</p>
        <button type="button" className="btn btn-neon mt-5 w-full" disabled={busy} onClick={deploy} data-testid="deploy-submit">
          {!address ? "Connect wallet" : !onChain ? `Switch to ${CHAIN.name}` : busy ? "Confirm in wallet…" : `Deploy on ${CHAIN.name}`}
        </button>
        {msg ? (
          <p className="rq-alert mt-3" role="status">
            {msg}
          </p>
        ) : null}
        {done ? (
          <div className="mt-4 text-[13px] leading-relaxed" data-testid="deploy-done">
            <p className="font-semibold">Deployed.</p>
            <p className="break-all">
              Address{" "}
              <a className="underline" href={explorerAddress(done.address)} target="_blank" rel="noreferrer">
                {done.address}
              </a>
              <br />
              Tx{" "}
              <a className="underline" href={explorerTx(done.tx)} target="_blank" rel="noreferrer">
                {done.tx}
              </a>{" "}
              · block {done.block}
            </p>
            <p className="mt-2">
              Paste into src/config/contracts.ts: <code className="break-all">{`desk: "${done.address}", block: ${done.block}, tx: "${done.tx}"`}</code>. Then run{" "}
              <code className="break-all">
                npm run verify-deployment -- --desk {done.address} --desk-tx {done.tx}
              </code>{" "}
              and verify the source with the kit in referensi/explorer.
            </p>
          </div>
        ) : null}
      </div>
      <div className="panel panel-pad">
        <h2 className="display h-card">Before you deploy</h2>
        <ul className="mt-3 grid list-disc gap-2 pl-5 text-[14px] text-[var(--muted)]">
          <li>The desk never holds a balance at rest and has no payable function or receive(). It moves an owner&apos;s USDG only inside the execution of a ticket that owner approved, under the owner&apos;s own allowance.</li>
          <li>It has unit, fuzz, invariant and Robinhood Chain fork tests and a written self-review, but no outside security review yet. Start with small amounts.</li>
          <li>Measured deploy gas: {DEPLOY_GAS}, paid in {CHAIN.nativeSymbol}.</li>
          <li>Deploy on {CHAIN.name} mainnet (chain {CHAIN.id}). Robinhood Chain Testnet (46630) has no SwapRouter02, so the constructor would refuse it.</li>
        </ul>
      </div>
    </div>
  );
}
