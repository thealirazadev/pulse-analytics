import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-[650]">Dashboard</h1>
      <p className="mt-2 text-fg-muted">Signed in as {session.sub}.</p>
      <div className="mt-6">
        <LogoutButton />
      </div>
    </main>
  );
}
