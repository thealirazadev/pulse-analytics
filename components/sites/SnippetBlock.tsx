"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function SnippetBlock({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable; the snippet is selectable in the code block
    }
  }

  return (
    <div>
      <pre className="overflow-x-auto rounded-sm border border-border bg-surface-2 p-3 font-mono text-[13px] text-fg">
        <code>{snippet}</code>
      </pre>
      <div className="mt-3 flex items-center gap-3">
        <Button variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
        <span aria-live="polite" className="sr-only">
          {copied ? "Snippet copied to clipboard" : ""}
        </span>
      </div>
    </div>
  );
}
