"use client";

import { useEffect, useState } from "react";
import { VerifiedBadge } from "./VerifiedBadge";

interface VerifyStatusProps {
  siteId: string;
  initiallyVerified: boolean;
}

/** Polls the site until its first pageview flips it to verified. */
export function VerifyStatus({ siteId, initiallyVerified }: VerifyStatusProps) {
  const [verified, setVerified] = useState(initiallyVerified);

  useEffect(() => {
    if (verified) return;
    let active = true;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { verifiedAt: string | null };
        if (active && data.verifiedAt) {
          setVerified(true);
        }
      } catch {
        // transient; try again on the next tick
      }
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [siteId, verified]);

  return (
    <div aria-live="polite">
      <VerifiedBadge verified={verified} pulsing={!verified} />
    </div>
  );
}
