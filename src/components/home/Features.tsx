/* The reference's 3 x 2 grid: a title, two lines of muted text and a small layered card that animates. Sample figures only. */

function Cell({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="fcell" data-reveal="">
      <h3>{title}</h3>
      <p>{text}</p>
      <div className="fmock">{children}</div>
    </div>
  );
}

function Rows({ rows, right }: { rows: string[][]; right?: (v: string, i: number) => React.ReactNode }) {
  return (
    <>
      {rows.map(([k, v], i) => (
        <div key={k} className={`row ${i === 0 ? "border-t-0" : ""}`}>
          <span>{k}</span>
          {right ? right(v, i) : <span className="num text-[var(--muted)]">{v}</span>}
        </div>
      ))}
    </>
  );
}

export function Features() {
  return (
    <div className="fgrid" data-testid="features">
      <Cell title="Your strategy, in your words" text="A fixed reader, not an AI model, picks out the asset, the order size, the schedule and the budget.">
        <div className="card">
          <p className="text-[var(--muted)]">Strategy</p>
          <p className="mt-1.5 leading-[17px]">
            Buy $50 of NVDA every Monday, at most $200 a month<span className="caret">▍</span>
          </p>
          <div className="row mt-2 flex-wrap justify-start">
            <span className="chip ok">NVDA</span>
            <span className="chip ok">$50 / order</span>
            <span className="chip ok">weekly · Mon</span>
          </div>
        </div>
      </Cell>
      <Cell title="It asks instead of guessing" text="Two assets, no budget, a price condition: the reader stops and asks a question you answer with one click.">
        <div className="card relative">
          <p className="text-[var(--warn)]">Question</p>
          <p className="mt-1.5 leading-[17px]">A desk buys one asset. You named NVDA and TSLA. Which one?</p>
          <div className="row mt-2 justify-start">
            <span className="press chip">NVDA</span>
            <span className="chip">TSLA</span>
          </div>
          <svg className="cursor absolute left-[34px] top-[86px]" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 1l11 6-5 1.5L6 14z" fill="#fff" stroke="#000" strokeWidth="1" />
          </svg>
        </div>
      </Cell>
      <Cell title="Seven rules you can read" text="Each rule carries the value the contract enforces: asset, schedule, per order, budget, price protection, ticket life, approval.">
        <div className="card">
          <Rows rows={[["R1 Asset", "NVDA only"], ["R3 Per order", "≤ 50 USDG"], ["R4 Budget", "≤ 200 / 30 d"], ["R7 Approval", "every ticket"]]} />
        </div>
      </Cell>
      <Cell title="Asset identity, read from chain" text="A ticker proves nothing. The token must be on the vetted list, carry the stock-token proxy code and beacon, and have supply.">
        <div className="card">
          <Rows
            rows={[["Vetted list", ""], ["Proxy code hash", ""], ["Beacon slot", ""], ["Minted supply", ""]]}
            right={(_, i) => (
              <span className="chip dot ok blip" style={{ animationDelay: `${i * 0.3}s` }}>
                checked
              </span>
            )}
          />
        </div>
      </Cell>
      <Cell title="Cost before you sign" text="Gas from the live gas price, the pool's fee tier, and the live quote against the Chainlink price. Unknown stays Not known.">
        <div className="card">
          <Rows rows={[["Gas (approve)", "86,036 units"], ["Pool fee", "0.05%"], ["Quote vs feed", "−0.06%"]]} />
          <p className="mt-2 text-[10.5px] text-[var(--faint)]">Sample figures</p>
        </div>
      </Cell>
      <Cell title="An approval queue, by hand" text="Passing tickets wait. You approve or reject each one on chain, bound to the hash of the exact ticket on the card.">
        <div className="card">
          <Rows
            rows={[["#14 NVDA 50", "wait"], ["#11 NVDA 50", "ok"], ["#13 NVDA 75", "hold"]]}
            right={(s) => <span className={`chip dot ${s}`}>{s === "wait" ? "Waiting" : s === "ok" ? "Approved" : "Refused"}</span>}
          />
        </div>
      </Cell>
    </div>
  );
}
