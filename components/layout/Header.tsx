import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

/**
 * App header: brand link, primary nav, and the logout action. The theme toggle
 * is added in the theming phase.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-[650] text-fg">
            pulse
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/dashboard"
              className="text-fg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Dashboard
            </Link>
            <Link
              href="/sites"
              className="text-fg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Sites
            </Link>
          </nav>
        </div>
        <LogoutButton />
      </div>
    </header>
  );
}
