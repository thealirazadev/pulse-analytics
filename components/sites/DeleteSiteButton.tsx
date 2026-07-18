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

  async function confirm() {
    setBusy(true);
    try {
      await fetch(`/api/sites/${siteId}`, { method: "DELETE" });
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
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
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
