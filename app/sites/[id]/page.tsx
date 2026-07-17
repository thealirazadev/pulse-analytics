import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { SnippetBlock } from "@/components/sites/SnippetBlock";
import { VerifyStatus } from "@/components/sites/VerifyStatus";
import { getServerSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { site } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function SiteDetailPage({ params }: PageProps) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const rows = await getDb()
    .select()
    .from(site)
    .where(eq(site.publicId, id))
    .limit(1);
  const found = rows[0];
  if (!found) notFound();

  const snippet = `<script async src="${getEnv().APP_URL}/p.js" data-site="${found.publicId}"></script>`;

  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-[720px] px-4 py-10 sm:px-6">
        <Link
          href="/sites"
          className="text-sm text-accent hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Back to sites
        </Link>
        <h1 className="mt-3 text-2xl font-[650]">{found.name}</h1>
        <p className="text-fg-muted">{found.domain}</p>
        <div className="mt-4">
          <VerifyStatus
            siteId={found.publicId}
            initiallyVerified={found.verifiedAt !== null}
          />
        </div>

        <section className="mt-8">
          <h2 className="text-base font-[600]">Install</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Add this snippet to the &lt;head&gt; of every page on {found.domain}.
            The status above flips to verified on the first pageview.
          </p>
          <div className="mt-3">
            <SnippetBlock snippet={snippet} />
          </div>
        </section>
      </main>
    </>
  );
}
