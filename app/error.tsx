"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to the browser console only; no technical detail is shown to the user.
    console.error(error);
  }, [error]);

  return (
    <main
      id="main"
      className="grid min-h-screen place-items-center px-6 text-center"
    >
      <div className="flex flex-col items-center">
        <h1 className="text-2xl font-[650]">Something went wrong</h1>
        <p className="mt-2 text-fg-muted">
          An unexpected error occurred. Please try again.
        </p>
        <div className="mt-6">
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </main>
  );
}
