/* Title band for inner pages: the reference's small tag over a wide display headline and a light lede, centred under the header. */
export function PageHead({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden pb-14 pt-20 text-center max-[640px]:pt-12">
      <div className="wrap">
        <p className="tag" data-reveal="">
          {eyebrow}
        </p>
        <h1 className="display h-sec mx-auto mt-6 max-w-[980px]" data-reveal="" style={{ "--delay": "80ms" } as React.CSSProperties}>
          {title}
        </h1>
        {children ? (
          <div className="lede mx-auto mt-5 max-w-[680px]" data-reveal="" style={{ "--delay": "160ms" } as React.CSSProperties}>
            {children}
          </div>
        ) : null}
        {actions ? <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}

export function StatusBadge({ status }: { status: "Prototype" | "Concept" }) {
  return (
    <span className={`badge ${status === "Prototype" ? "proto" : "concept"}`}>
      <i aria-hidden="true" />
      {status}
    </span>
  );
}
export function SampleBadge({ label = "Sample data" }: { label?: string }) {
  return <span className="badge sample">{label}</span>;
}
export function LiveBadge({ label = "Live from chain" }: { label?: string }) {
  return (
    <span className="badge live">
      <i aria-hidden="true" />
      {label}
    </span>
  );
}
