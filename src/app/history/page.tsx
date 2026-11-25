import { ClientOnly } from "@/components/desk/ClientOnly";
import { HistoryApp } from "@/components/history/HistoryApp";
import { PageHead } from "@/components/site/PageHead";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbLd, pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/history",
  title: "History: every ticket and decision",
  description: "The decision history of an Oddro desk: tickets proposed, approved, rejected, cancelled, expired and executed, read from the desk contract's events on Robinhood Chain, plus the practice log of this browser.",
});

export default function HistoryPage() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "History", path: "/history" }])} />
      <PageHead eyebrow="History · read from chain" title="Every ticket, every decision.">
        <p>On-chain decisions come from the desk contract&apos;s events, each with its transaction. Refused proposals leave no event; the desk keeps those in your browser&apos;s practice log.</p>
      </PageHead>
      <div className="wrap pb-24">
        <ClientOnly fallback={<p className="panel panel-pad text-[14px] text-[var(--muted)]">Loading…</p>}>
          <HistoryApp />
        </ClientOnly>
      </div>
    </>
  );
}
