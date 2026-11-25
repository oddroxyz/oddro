import Link from "next/link";
import { PageHead } from "@/components/site/PageHead";

export default function NotFound() {
  return (
    <>
      <PageHead eyebrow="404" title="This ticket does not exist.">
        <p>The page is not here. The desk is.</p>
      </PageHead>
      <div className="wrap flex flex-wrap justify-center gap-3 pb-24">
        <Link href="/desk" className="btn btn-white">
          Open the desk
        </Link>
        <Link href="/" className="btn btn-line">
          Home
        </Link>
      </div>
    </>
  );
}
