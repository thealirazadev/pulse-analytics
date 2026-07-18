import { desc } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/ui/EmptyState";
import { getServerSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { site } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function DashboardIndex() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const sites = await getDb()
    .select({ id: site.publicId })
    .from(site)
    .orderBy(desc(site.createdAt))
    .limit(1);

  if (sites[0]) {
    redirect(`/dashboard/${sites[0].id}?range=7d`);
  }

  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-[720px] px-4 py-16 sm:px-6">
        <h1 className="sr-only">Dashboard</h1>
        <EmptyState
          title="No sites yet"
          hint="Add your first site to start collecting analytics."
          action={
            <Link
              href="/sites"
              className="inline-flex h-10 items-center rounded-md bg-accent px-4 font-medium text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Add your first site
            </Link>
          }
        />
      </main>
    </>
  );
}
