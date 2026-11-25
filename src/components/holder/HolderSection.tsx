"use client";

import { useCallback, useEffect, useState } from "react";
import { BRAND, explorerToken } from "@/config/brand";
import { QUOTA } from "@/config/quota";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { StatusBadge } from "@/components/site/PageHead";
import { useHolder } from "@/components/holder/useHolder";
import type { HostedDesk, HostedState, HostedStrategy } from "@/lib/holder/hosted";
import type { Strategy } from "@/lib/desk/strategy";

/*
 * Holder panel (connect -> sign one message -> tier read on chain) and, on the desk, the hosted desks and saved strategies with
 * their quota. Everything is checked again on the server; this only shows what the server answered.
 */

type Usage = { desks: number; assets: number; strategies: number };
type Hosted = HostedState & { usage: Usage; tier: "free" | "holder"; quota: (typeof QUOTA)["free"]; storage: "shared" | "memory" };

const fmt = (raw: string | null) => (raw === null ? "Not known" : (Number(BigInt(raw) / 10n ** 12n) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 4 }));
const newId = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function HolderSection({ desk }: { desk?: { strategy: Strategy; text: string; queue: unknown; onLoad: (s: Strategy, text: string) => void } }) {
  const h = useHolder();
  const { open } = useWalletModal();
  const [data, setData] = useState<Hosted | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState("");

  const run = useCallback(
    async (op: Record<string, unknown>, done?: string) => {
      const r = await h.hosted(op);
      if (r.ok) {
        setData(r.body as Hosted);
        setMsg(done ?? null);
      } else setMsg(r.body?.error ?? "Refused.");
      return r.ok;
    },
    [h],
  );

  useEffect(() => {
    // Loads this wallet's hosted desks once a session exists; state is set after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (desk && h.session) run({ op: "list" });
  }, [h.session, desk ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = h.tier;
  return (
    <section className="panel panel-pad" data-testid="holder-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-[22px] leading-[28px]">{desk ? "Hosted desks" : "Your tier"}</h2>
        <StatusBadge status="Prototype" />
      </div>
      <p className="mt-2 text-[14px] text-[var(--muted)]">
        {desk
          ? "Save this desk (strategy + practice queue) and strategies on the server, so they open on any device after you sign in. Free for every wallet; holders of 0.1 % of the supply get more room."
          : `Holder tier = at least 0.1 % of the ${BRAND.symbol} supply in your wallet, read on chain at each request. Signing costs no gas and moves nothing.`}
      </p>
      {!h.address ? (
        <button type="button" className="btn btn-sm btn-white mt-4" onClick={open} data-testid="holder-connect">
          Connect wallet
        </button>
      ) : !h.session ? (
        <button type="button" className="btn btn-sm btn-neon mt-4" disabled={h.busy} onClick={h.sign} data-testid="holder-sign">
          {h.busy ? "Sign in the wallet…" : "Sign in (one message, no gas)"}
        </button>
      ) : (
        <div className="mt-4 grid gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[14px]" data-testid="holder-tier" data-tier={t?.tier ?? ""}>
            Tier:{" "}
            {t ? (
              <span className={`chip dot ${t.tier === "holder" ? "ok" : "wait"}`}>{t.tier === "holder" ? "Holder" : "Free"}</span>
            ) : (
              <span className="chip">reading…</span>
            )}
            {t && !t.live ? <span className="chip">Holder tier unlocks at launch</span> : null}
            <button type="button" className="btn btn-sm btn-line !min-h-[30px]" onClick={() => h.refresh()}>
              Check again
            </button>
            <button type="button" className="btn btn-sm btn-line !min-h-[30px]" onClick={h.signOut}>
              Sign out
            </button>
          </div>
          {t && t.live ? (
            <dl className="kv" data-testid="holder-numbers">
              <dt>Your balance</dt>
              <dd className="num">{fmt(t.balance)} {BRAND.symbol}</dd>
              <dt>Holder threshold (0.1 %)</dt>
              <dd className="num">{fmt(t.threshold)} {BRAND.symbol}</dd>
              <dt>Your share</dt>
              <dd className="num">{t.shareBps !== null ? `${(t.shareBps / 100).toFixed(2)} %` : "Not known"}</dd>
              <dt>Checked</dt>
              <dd className="num">
                {new Date(t.checkedAt).toISOString().slice(11, 19)} UTC, block {t.block?.toLocaleString("en-US") ?? "?"} ·{" "}
                {t.token ? (
                  <a className="elink" href={explorerToken(t.token)} target="_blank" rel="noreferrer">
                    token
                  </a>
                ) : null}
              </dd>
            </dl>
          ) : null}
          {t?.error ? <p className="note warn">{t.error}</p> : null}
          {t ? (
            <p className="text-[13px] text-[var(--muted)]">
              Your quota: {t.quota.desks} hosted desks, {t.quota.assets} assets, {t.quota.strategies} saved strategies. Free tier: {QUOTA.free.desks} / {QUOTA.free.assets} / {QUOTA.free.strategies}; holder: {QUOTA.holder.desks} / {QUOTA.holder.assets} / {QUOTA.holder.strategies}.
            </p>
          ) : null}
        </div>
      )}
      {h.error ? <p className="rq-alert mt-3">{h.error}</p> : null}

      {desk && h.session ? (
        <div className="mt-5 grid gap-3 border-t border-[var(--line)] pt-4" data-testid="hosted">
          {data?.storage === "memory" ? <p className="note warn">Not configured: saved data may be lost on restart. Export a copy below.</p> : null}
          <div className="flex flex-wrap items-end gap-2">
            <label className="field min-w-[200px] flex-1">
              <span>Name</span>
              <input className="inp" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={desk.strategy.asset ? `${desk.strategy.asset} desk` : "My desk"} data-testid="hosted-name" />
            </label>
            <button
              type="button"
              className="btn btn-sm btn-neon"
              disabled={!desk.strategy.asset}
              data-testid="hosted-save-desk"
              onClick={() => run({ op: "save-desk", desk: { id: newId("desk"), name: name || `${desk.strategy.asset} desk`, asset: desk.strategy.asset, strategy: desk.strategy, queue: desk.queue } }, "Desk saved.")}
            >
              Save as hosted desk
            </button>
            <button type="button" className="btn btn-sm btn-line" data-testid="hosted-save-strategy" onClick={() => run({ op: "save-strategy", strategy: { id: newId("strat"), name: name || "Strategy", text: desk.text, strategy: desk.strategy } }, "Strategy saved.")}>
              Save strategy
            </button>
          </div>
          {msg ? (
            <p className={`text-[13px] ${/limit|Refused|Invalid/.test(msg) ? "text-[var(--bad)]" : "text-[var(--neon)]"}`} role="status" data-testid="hosted-msg">
              {msg}
            </p>
          ) : null}
          {data ? (
            <>
              <p className="text-[13px] text-[var(--muted)]" data-testid="hosted-usage">
                Used: {data.usage.desks} / {data.quota.desks} desks · {data.usage.assets} / {data.quota.assets} assets · {data.usage.strategies} / {data.quota.strategies} strategies ({data.tier} tier)
              </p>
              <ul className="grid gap-2">
                {data.desks.map((d: HostedDesk) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[var(--line)] px-3 py-2 text-[13px]">
                    <span>
                      {d.name} <span className="chip">{d.asset}</span>
                    </span>
                    <span className="flex gap-1.5">
                      <button type="button" className="btn btn-sm btn-line !min-h-[30px]" onClick={() => desk.onLoad(d.strategy as Strategy, "")}>
                        Open
                      </button>
                      <button type="button" className="btn btn-sm btn-line !min-h-[30px]" onClick={() => run({ op: "delete-desk", id: d.id }, "Deleted.")}>
                        Delete
                      </button>
                    </span>
                  </li>
                ))}
                {data.strategies.map((s: HostedStrategy) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[var(--line)] px-3 py-2 text-[13px]">
                    <span className="min-w-0">
                      {s.name} <span className="text-[var(--muted)]">“{s.text.slice(0, 60)}”</span>
                    </span>
                    <span className="flex gap-1.5">
                      <button type="button" className="btn btn-sm btn-line !min-h-[30px]" onClick={() => desk.onLoad(s.strategy as Strategy, s.text)}>
                        Use
                      </button>
                      <button type="button" className="btn btn-sm btn-line !min-h-[30px]" onClick={() => run({ op: "delete-strategy", id: s.id }, "Deleted.")}>
                        Delete
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-line"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify({ desks: data.desks, strategies: data.strategies }, null, 2)], { type: "application/json" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = "oddro-hosted.json";
                    a.click();
                  }}
                >
                  Export JSON
                </button>
                <label className="btn btn-sm btn-line cursor-pointer">
                  Import JSON
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        run({ op: "import", state: JSON.parse(await f.text()) }, "Imported.");
                      } catch {
                        setMsg("Invalid import file.");
                      }
                    }}
                  />
                </label>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
