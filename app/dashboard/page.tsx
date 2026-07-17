import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getServerSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  return (
    <>
      <Header />
      <main className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-[650]">Dashboard</h1>
        <p className="mt-2 text-fg-muted">Signed in as {session.sub}.</p>
      </main>
    </>
  );
}
