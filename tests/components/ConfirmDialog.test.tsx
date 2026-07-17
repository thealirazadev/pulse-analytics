// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

function setup(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Delete site"
      description="This cannot be undone."
      confirmLabel="Delete site"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("renders a modal dialog with the cancel button focused", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: /^cancel$/i })).toHaveFocus();
  });

  it("cancels on Escape", async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("confirms when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: /delete site/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when closed", () => {
    setup({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
