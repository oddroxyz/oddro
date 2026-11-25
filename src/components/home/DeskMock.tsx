import { MarkGlyph } from "@/components/site/Mark";
import { ClockIcon, FlaskIcon, ListIcon, PenIcon, QueueIcon } from "@/components/site/Icons";

/*
 * The hero's product picture, built in HTML like the reference's dashboard mock: a sidebar, one review card and the approval
 * queue. Every figure in it is sample data and says so. Rows draw in with the reference's row reveal; the card rises.
 */
const ROWS = [
  { id: 14, asset: "NVDA", amt: "50.00", rule: "R2 weekly · Mon", v: "Proceed", s: "Waiting" },
  { id: 13, asset: "NVDA", amt: "75.00", rule: "R3 per order", v: "Hold", s: "Refused" },
  { id: 12, asset: "AAPL", amt: "50.00", rule: "R1 asset", v: "Hold", s: "Refused" },
  { id: 11, asset: "NVDA", amt: "50.00", rule: "R2 weekly · Mon", v: "Proceed", s: "Approved" },
  { id: 10, asset: "NVDA", amt: "50.00", rule: "R2 weekly · Mon", v: "Proceed", s: "Executed" },
  { id: 9, asset: "NVDA", amt: "50.00", rule: "R2 weekly · Mon", v: "Proceed", s: "Executed" },
];

export function DeskMock() {
  return (
    <div className="mock" aria-label="Sample of the Oddro desk: a review card and the approval queue (sample data)">
      <div className="mock-in">
        <aside className="mock-side">
          <div className="flex items-center gap-2 rounded-[8px] border border-[var(--line)] px-2 py-1.5">
            <MarkGlyph size={16} className="text-[var(--neon)]" />
            <span>Desk #1 · NVDA</span>
          </div>
          <p className="label mt-4 px-2">Desk</p>
          <div className="mt-1 grid gap-0.5">
            <span className="it"><PenIcon size={13} /> Strategy</span>
            <span className="it"><ListIcon size={13} /> Rules</span>
            <span className="it"><FlaskIcon size={13} /> Scenario run</span>
            <span className="it on"><QueueIcon size={13} /> Approval queue</span>
            <span className="it"><ClockIcon size={13} /> History</span>
          </div>
        </aside>
        <div className="mock-main">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
            <span className="text-[13px] text-[var(--muted)]">Approval queue</span>
            <span className="chip">Sample data</span>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
            <div className="rcard proceed soft" style={{ animationDelay: "0.9s" }}>
              <div className="rcard-head">
                <span className="text-[13px]">Ticket #14 · NVDA</span>
                <span className="verdict proceed">Proceed</span>
              </div>
              <dl>
                <dt>Rule fired</dt>
                <dd>R2 weekly buy, Monday</dd>
                <dt>Asset</dt>
                <dd>NVDA · proof <span className="text-[var(--neon)]">✓</span></dd>
                <dt>Amount</dt>
                <dd className="num">50.00 USDG</dd>
                <dt>Est. cost</dt>
                <dd className="num">fee 0.05% · gas ≈ 0.00003 ETH</dd>
                <dt>Budget left</dt>
                <dd className="num">
                  <span className="relative block h-1.5 overflow-hidden rounded-full bg-white/10">
                    <span className="bar-fill absolute inset-y-0 left-0 w-[58%] rounded-full bg-[var(--neon)]" style={{ animationDelay: "1.2s" }} />
                  </span>
                  <span className="mt-1 block text-[11px] text-[var(--muted)]">70 of 120 USDG this week</span>
                </dd>
              </dl>
              <div className="flex gap-2 p-3">
                <span className="btn btn-sm btn-neon flex-1">Approve</span>
                <span className="btn btn-sm btn-line flex-1">Reject</span>
              </div>
            </div>
            <div className="min-w-0 overflow-hidden rounded-[12px] border border-[var(--line)]">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Asset</th>
                    <th className="max-[520px]:hidden">Rule</th>
                    <th>USDG</th>
                    <th>Card</th>
                    <th className="max-[420px]:hidden">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r, i) => (
                    <tr key={r.id} className="row-in" style={{ animationDelay: `${0.9 + i * 0.12}s` }}>
                      <td className="num text-[var(--muted)]">{r.id}</td>
                      <td>{r.asset}</td>
                      <td className="max-[520px]:hidden text-[var(--muted)]">{r.rule}</td>
                      <td className="num">{r.amt}</td>
                      <td>
                        <span className={`chip dot ${r.v === "Proceed" ? "ok" : "hold"}`}>{r.v}</span>
                      </td>
                      <td className="max-[420px]:hidden text-[var(--muted)]">{r.s === "Waiting" ? <span className="chip dot wait">Waiting</span> : r.s}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
