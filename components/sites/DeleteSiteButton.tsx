"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface DeleteSiteButtonProps {
  siteId: string;
  siteName: string;
}

export function DeleteSiteButton({ siteId, siteName }: DeleteSiteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setError(null);
    setOpen(true);
  }

  function closeDialog() {
    setError(null);
    setOpen(false);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}`, { method: "DELETE" });
      if (!res.ok) {
        // Keep the dialog open so the site is not lost from view as if gone.
        setError("Could not delete the site. Please try again.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        onClick={openDialog}
        aria-label={`Delete ${siteName}`}
      >
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        title="Delete site"
        description={`Delete "${siteName}" and all of its analytics data? This cannot be undone.`}
        confirmLabel="Delete site"
        loading={busy}
        error={error}
        onConfirm={confirm}
        onCancel={closeDialog}
      />
    </>
  );
}
