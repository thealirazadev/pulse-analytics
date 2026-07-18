import { desc } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { BreakdownPanel } from "@/components/dashboard/BreakdownPanel";
import { ChartPanel } from "@/components/dashboard/ChartPanel";
import { RangePicker } from "@/components/dashboard/RangePicker";
import { SitePicker } from "@/components/dashboard/SitePicker";
import { StatTilesPanel } from "@/components/dashboard/StatTilesPanel";
import { getServerSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { site } from "@/lib/db/schema";
import { parseRange, type RangeKey } from "@/lib/stats/ranges";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ range?: string }>;
};

export default async function SiteDashboard({ params, searchParams }: PageProps) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const { siteId } = await params;
  const { range: rangeParam } = await searchParams;

  const sites = await getDb()
    .select({ id: site.publicId, name: site.name, domain: site.domain })
    .from(site)
    .orderBy(desc(site.createdAt));

  const current = sites.find((s) => s.id === siteId);
  if (!current) notFound();

  const range: RangeKey = parseRange(rangeParam ?? "7d")?.key ?? "7d";

  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
        <h1 className="sr-only">Analytics for {current.name}</h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SitePicker sites={sites} current={siteId} range={range} />
          <RangePicker siteId={siteId} current={range} />
        </div>
        <div className="mt-6 flex flex-col gap-6">
          <StatTilesPanel siteId={siteId} range={range} />
          <ChartPanel siteId={siteId} range={range} />
          <div className="grid gap-4 md:grid-cols-2">
            <BreakdownPanel
              siteId={siteId}
              range={range}
              dimension="page"
              title="Top pages"
            />
            <BreakdownPanel
              siteId={siteId}
              range={range}
              dimension="referrer"
              title="Top referrers"
            />
            <BreakdownPanel
              siteId={siteId}
              range={range}
              dimension="country"
              title="Countries"
            />
            <BreakdownPanel
              siteId={siteId}
              range={range}
              dimension="device"
              title="Devices"
            />
          </div>
        </div>
      </main>
    </>
  );
}
