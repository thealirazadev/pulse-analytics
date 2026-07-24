import { Button } from "./Button";

interface ErrorStateProps {
  onRetry: () => void;
  message?: string;
}

export function ErrorState({
  onRetry,
  message = "Couldn't load this panel. Try again.",
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      {/* role=alert so a panel that fails to load is announced, not a silent
          visual swap from the loading skeleton. */}
      <p role="alert" className="text-sm text-fg-muted">
        {message}
      </p>
      <Button variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
