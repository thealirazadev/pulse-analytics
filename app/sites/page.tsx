import { desc } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { DeleteSiteButton } from "@/components/sites/DeleteSiteButton";
import { SiteForm } from "@/components/sites/SiteForm";
import { VerifiedBadge } from "@/components/sites/VerifiedBadge";
import { getServerSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { site } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const rows = await getDb().select().from(site).orderBy(desc(site.createdAt));

  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-[720px] px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-[650]">Sites</h1>
        <p className="mt-1 text-fg-muted">
          Register a site to get its tracking snippet.
        </p>

        <div className="mt-6">
          <SiteForm />
        </div>

        {rows.length === 0 ? (
          <p className="mt-8 rounded-md border border-border bg-surface p-6 text-fg-muted">
            No sites yet. Add your first site above.
          </p>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {rows.map((s) => (
              <li
                key={s.publicId}
                className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface p-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/sites/${s.publicId}`}
                    className="font-medium text-fg hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {s.name}
                  </Link>
                  <p className="truncate text-sm text-fg-muted" title={s.domain}>
                    {s.domain}
                  </p>
                  <div className="mt-1">
                    <VerifiedBadge verified={s.verifiedAt !== null} />
                  </div>
                </div>
                <DeleteSiteButton siteId={s.publicId} siteName={s.name} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
