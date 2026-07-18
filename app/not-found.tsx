import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main"
      className="grid min-h-screen place-items-center px-6 text-center"
    >
      <div>
        <p className="text-sm font-medium text-fg-muted">404</p>
        <h1 className="mt-2 text-2xl font-[650]">Page not found</h1>
        <p className="mt-2 text-fg-muted">
          That page doesn&apos;t exist or was moved.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center rounded-md bg-accent px-4 font-medium text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
