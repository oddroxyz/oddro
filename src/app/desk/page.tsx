import { ClientOnly } from "@/components/desk/ClientOnly";
import { DeskApp } from "@/components/desk/DeskApp";
import { PageHead } from "@/components/site/PageHead";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbLd, pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/desk",
  title: "Desk: write a strategy, review every order",
  description: "Write one periodic-buy strategy for one Robinhood Chain stock token, check the rules and the asset's on-chain proof, run four scenarios into review cards, and approve or reject each ticket by hand.",
});

export default function DeskPage() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Desk", path: "/desk" }])} />
      <PageHead eyebrow="Desk · practice mode needs no wallet" title="Write it. Check it. Approve it by hand.">
        <p>Five steps on one page. Prices, gas, pools and asset proofs are read live from Robinhood Chain; the practice desk and its tickets are sample data and say so.</p>
      </PageHead>
      <div className="wrap pb-24">
        <ClientOnly fallback={<p className="panel panel-pad text-[14px] text-[var(--muted)]">Loading the desk…</p>}>
          <DeskApp />
        </ClientOnly>
      </div>
    </>
  );
}
