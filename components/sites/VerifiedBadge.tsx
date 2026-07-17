interface VerifiedBadgeProps {
  verified: boolean;
  /** Subtle pulse while actively polling; ignored under reduced motion. */
  pulsing?: boolean;
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13.5 4.5 6.5 11.5 3 8" />
    </svg>
  );
}

function WaitingIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3l2 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Status pill; always pairs an icon with text so meaning never rests on color. */
export function VerifiedBadge({ verified, pulsing = false }: VerifiedBadgeProps) {
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-success">
        <CheckIcon />
        Verified
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm text-fg-muted ${
        pulsing ? "animate-pulse" : ""
      }`}
    >
      <WaitingIcon />
      Waiting for first pageview
    </span>
  );
}
