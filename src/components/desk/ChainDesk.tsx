"use client";

import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData, maxUint256 } from "viem";
import { ADDRESSES, SUPPORTED, type Supported } from "@/config/assets";
import { CHAIN, explorerAddress, explorerTx, isAddress, shortAddress } from "@/config/brand";
import { CONTRACTS, deskLive } from "@/config/contracts";
import { USDG } from "@/config/dex";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { useAssets } from "@/components/home/LiveFacts";
import { DESK_ABI, ERC20_WRITE_ABI } from "@/lib/abi";
import { BIT_WORDS, bitNames } from "@/lib/desk/bits";
import { toDesk, type Strategy } from "@/lib/desk/strategy";
import { explain, read, simulate, waitForReceipt } from "@/lib/client";
import type { Activity, TicketView } from "@/lib/server/activity";
import { failedTxAlert, type Alert } from "@/lib/alerts";
import { LOCAL_ALERTS } from "@/components/holder/AlertBell";
import { useLocalStore } from "@/components/wallet/useLocalStore";

/*
 * The on-chain desk. Owner: open a desk from the strategy, allow USDG, then approve (bound to the ticket hash), reject or
 * execute each ticket. Agent: propose the scheduled ticket after the contract's own checkTicket says it would pass. Every write
 * is simulated first; refusals are explained from the reason bits. Without a deployed desk contract this panel says so and the
 * desk stays in practice mode.
 */

const DAY = 86_400;
const nowSec = () => Math.floor(Date.now() / 1000);
const desk = () => CONTRACTS.desk as `0x${string}`;
const usd = (raw: string) => (Number(raw) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });
const names = (bits: bigint) => bitNames(bits).map((n) => BIT_WORDS[n].label).join(", ");

export function ChainDesk({ strategy }: { strategy: Strategy }) {
  const { address, onChain, sendTransaction, switchNetwork } = useWallet();
  const { open } = useWalletModal();
  const { data: board } = useAssets();
  const [act, setAct] = useState<Activity | null>(null);
  const [agentAct, setAgentAct] = useState<Activity | null>(null);
  const [agent, setAgent] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [allow, setAllow] = useState<bigint | null>(null);
  const [, setLocalAlerts] = useLocalStore<Alert[]>(LOCAL_ALERTS, []);

  const load = useCallback(
    async (fresh = false) => {
      if (!deskLive() || !address) return;
      const f = fresh ? "&fresh=1" : "";
      const [o, a] = await Promise.all([
        fetch(`/api/activity?owner=${address}${f}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/activity?agent=${address}${f}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      setAct(o);
      setAgentAct(a);
      try {
        setAllow(await read<bigint>({ to: USDG.address, abi: ERC20_WRITE_ABI, fn: "allowance", args: [address, CONTRACTS.desk] }));
      } catch {
        setAllow(null);
      }
    },
    [address],
  );
  useEffect(() => {
    // Reads chain state for the connected wallet; the setState calls happen after the fetches resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(true);
    // A proposal from the agent's own script lands without this page knowing: refresh while the tab is visible.
    const t = setInterval(() => document.visibilityState === "visible" && load(), 12_000);
    return () => clearInterval(t);
  }, [load]);

  if (!deskLive()) {
    return (
      <div className="note" data-testid="chain-desk-off">
        On-chain desk: the OddroOrderDesk contract is not deployed yet, so approvals here are practice. The contract, its tests and the
        on-chain screens are built; the owner deploys it from the local /deploy page, and then the same queue signs real approvals on {CHAIN.name}.
      </div>
    );
  }

  const send = async (label: string, to: string, data: string) => {
    if (!address) return open();
    if (!onChain) return switchNetwork();
    setBusy(label);
    setMsg(null);
    try {
      await simulate(address, to, data);
      const hash = await sendTransaction({ to, data });
      setLastTx(hash);
      setMsg(`${label}: sent, waiting for the block…`);
      const rc = await waitForReceipt(hash);
      setMsg(rc.ok ? `${label}: confirmed in block ${rc.blockNumber}.` : `${label}: the transaction reverted.`);
      if (!rc.ok) setLocalAlerts((l) => [failedTxAlert(label, hash, "The transaction reverted on chain; nothing changed.", Math.floor(Date.now() / 1000)), ...l].slice(0, 50));
      await load(true);
    } catch (e) {
      setMsg(`${label}: ${explain(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const p = toDesk(strategy);
  const asset = strategy.asset ? (board?.assets.find((a) => a.symbol === strategy.asset) ?? null) : null;

  const openDesk = () => {
    if (!p || !strategy.asset || !isAddress(agent)) return setMsg("Give the agent's address and finish the strategy first.");
    if (!asset?.pool) return setMsg("No proven pool for this asset right now; the desk needs its fee tier.");
    const data = encodeFunctionData({
      abi: DESK_ABI,
      functionName: "openDesk",
      args: [
        {
          agent,
          asset: asset.address,
          quote: USDG.address,
          fee: asset.pool.fee,
          maxPerTicket: p.maxPerTicket,
          periodCap: p.periodCap,
          periodLength: p.periodLength,
          minGap: p.minGap,
          maxTicketLife: p.maxTicketLife,
          expiry: BigInt(nowSec() + 90 * DAY),
          ruleHash: p.ruleHash,
        },
      ],
    });
    send("Open desk", CONTRACTS.desk, data);
  };

  const proposeAsAgent = async (deskId: number) => {
    const d = agentAct?.desks.find((x) => x.id === deskId);
    if (!d || !address) return;
    const sym = (SUPPORTED.find((s) => ADDRESSES[s as Supported] === d.asset) ?? "") as string;
    const amount = BigInt(d.maxPerTicket);
    const usdg = Number(amount) / 1e6;
    const q = sym ? await fetch(`/api/quote?asset=${sym}&usdg=${usdg}`).then((r) => r.json()).catch(() => null) : null;
    const out = q?.quote?.amountOut ? BigInt(q.quote.amountOut) : 0n;
    if (out === 0n) return setMsg("No live quote, so no minimum out can be set. Not proposing.");
    const minOut = (out * BigInt(10_000 - (strategy.slippageBps || 100))) / 10_000n;
    const input = { asset: d.asset, amountIn: amount, minOut, deadline: BigInt(nowSec() + Math.min(d.maxTicketLife, 86_400) - 60), ruleHash: d.ruleHash, ref: `0x${"77".repeat(32)}` as `0x${string}` };
    try {
      const bits = await read<bigint>({ to: CONTRACTS.desk, abi: DESK_ABI, fn: "checkTicket", args: [BigInt(deskId), address, input] });
      if (bits !== 0n) return setMsg(`The desk would refuse this ticket: ${names(bits)}.`);
    } catch (e) {
      return setMsg(explain(e));
    }
    send("Propose", CONTRACTS.desk, encodeFunctionData({ abi: DESK_ABI, functionName: "propose", args: [BigInt(deskId), input] }));
  };

  const ownerTickets = act?.tickets ?? [];
  return (
    <div className="rounded-[14px] border border-[var(--line-2)] p-4" data-testid="chain-desk">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-medium">On-chain desk</p>
        <a className="elink num text-[12px]" href={explorerAddress(CONTRACTS.desk)} target="_blank" rel="noreferrer">
          OddroOrderDesk {shortAddress(CONTRACTS.desk)}
        </a>
      </div>
      {!address ? (
        <button type="button" className="btn btn-sm btn-white mt-3" onClick={open} data-testid="chain-connect">
          Connect wallet
        </button>
      ) : (
        <div className="mt-3 grid gap-4">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="field">
              <span>Agent address (the key that proposes tickets)</span>
              <input className="inp num" value={agent} onChange={(e) => setAgent(e.target.value.trim())} placeholder="0x…" data-testid="agent-input" />
            </label>
            <button type="button" className="btn btn-sm btn-neon" disabled={!!busy || !p} onClick={openDesk} data-testid="open-desk">
              Open desk from this strategy
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-[var(--muted)]">
            USDG allowance to the desk: <span className="num text-[var(--ink)]">{allow === null ? "Not known" : allow > 10n ** 30n ? "unlimited" : usd(allow.toString())}</span>
            <button type="button" className="btn btn-sm btn-line" disabled={!!busy} onClick={() => send("Allow USDG", USDG.address as string, encodeFunctionData({ abi: ERC20_WRITE_ABI, functionName: "approve", args: [desk(), maxUint256] }))} data-testid="allow-usdg">
              Allow USDG
            </button>
            <button type="button" className="btn btn-sm btn-line" disabled={!!busy} onClick={() => send("Reset allowance", USDG.address, encodeFunctionData({ abi: ERC20_WRITE_ABI, functionName: "approve", args: [desk(), 0n] }))}>
              Reset to 0
            </button>
          </div>
          {act?.desks.length ? (
            <div className="grid gap-3" data-testid="owner-desks">
              {act.desks.map((d) => (
                <div key={d.id} className="rounded-[12px] border border-[var(--line)] p-3 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Desk #{d.id} · {SUPPORTED.find((s) => ADDRESSES[s as Supported] === d.asset) ?? shortAddress(d.asset)} · {usd(d.used)} of {usd(d.periodCap)} USDG this period
                      {d.paused ? <span className="chip dot hold ml-2">paused</span> : null}
                    </span>
                    <button type="button" className="btn btn-sm btn-line" disabled={!!busy} onClick={() => send(d.paused ? "Unpause" : "Pause", CONTRACTS.desk, encodeFunctionData({ abi: DESK_ABI, functionName: d.paused ? "unpause" : "pause", args: [BigInt(d.id)] }))}>
                      {d.paused ? "Unpause" : "Pause"}
                    </button>
                  </div>
                  <TicketRows tickets={ownerTickets.filter((t) => t.deskId === d.id)} busy={!!busy} onApprove={(t) => send(`Approve #${t.id}`, CONTRACTS.desk, encodeFunctionData({ abi: DESK_ABI, functionName: "approve", args: [BigInt(t.id), t.hash as `0x${string}`] }))} onReject={(t) => send(`Reject #${t.id}`, CONTRACTS.desk, encodeFunctionData({ abi: DESK_ABI, functionName: "reject", args: [BigInt(t.id), 1] }))} onExecute={(t) => send(`Execute #${t.id}`, CONTRACTS.desk, encodeFunctionData({ abi: DESK_ABI, functionName: "execute", args: [BigInt(t.id)] }))} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-[var(--muted)]">No desks owned by this wallet yet.</p>
          )}
          {agentAct?.desks.length ? (
            <div className="grid gap-2" data-testid="agent-desks">
              <p className="text-[13px]">You are the agent of:</p>
              {agentAct.desks.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-[var(--line)] p-3 text-[13px]">
                  <span>
                    Desk #{d.id} · {usd(d.maxPerTicket)} USDG per ticket
                  </span>
                  <button type="button" className="btn btn-sm btn-white" disabled={!!busy} onClick={() => proposeAsAgent(d.id)} data-testid={`propose-${d.id}`}>
                    Propose the scheduled ticket
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {msg ? (
        <p className="mt-3 text-[13px] text-[var(--muted)]" role="status" data-testid="chain-msg">
          {msg} {lastTx ? <a className="elink" href={explorerTx(lastTx)} target="_blank" rel="noreferrer">tx</a> : null}
        </p>
      ) : null}
      <p className="mt-3 text-[11.5px] text-[var(--faint)]">Agents can also propose from a script: examples/agent.mjs (same checks, its own key).</p>
    </div>
  );
}

function TicketRows({ tickets, busy, onApprove, onReject, onExecute }: { tickets: TicketView[]; busy: boolean; onApprove: (t: TicketView) => void; onReject: (t: TicketView) => void; onExecute: (t: TicketView) => void }) {
  if (!tickets.length) return <p className="mt-2 text-[var(--muted)]">No tickets yet.</p>;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="tbl" data-testid="chain-tickets">
        <thead>
          <tr>
            <th>#</th>
            <th>USDG</th>
            <th>Status</th>
            <th>Check now</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => {
            const bits = t.bits ? BigInt(t.bits) : 0n;
            return (
              <tr key={t.id} data-testid={`chain-ticket-${t.id}`}>
                <td className="num">{t.id}</td>
                <td className="num">{usd(t.amountIn)}</td>
                <td>{t.status}</td>
                <td>{t.bits === null ? "—" : bits === 0n ? <span className="chip dot ok">Proceed</span> : <span className="chip dot hold" title={names(bits)}>Hold: {names(bits)}</span>}</td>
                <td className="whitespace-nowrap">
                  {t.status === "Proposed" ? (
                    <span className="flex gap-1.5">
                      <button type="button" className="btn btn-sm btn-neon !min-h-[30px]" disabled={busy || bits !== 0n} onClick={() => onApprove(t)} data-testid={`chain-approve-${t.id}`}>
                        Approve
                      </button>
                      <button type="button" className="btn btn-sm btn-line !min-h-[30px]" disabled={busy} onClick={() => onReject(t)} data-testid={`chain-reject-${t.id}`}>
                        Reject
                      </button>
                    </span>
                  ) : t.status === "Approved" ? (
                    <button type="button" className="btn btn-sm btn-white !min-h-[30px]" disabled={busy || bits !== 0n} onClick={() => onExecute(t)} data-testid={`chain-execute-${t.id}`}>
                      Execute
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

