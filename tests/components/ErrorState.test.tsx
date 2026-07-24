// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "@/components/ui/ErrorState";

describe("ErrorState", () => {
  it("announces the failure via role=alert", () => {
    render(<ErrorState onRetry={() => {}} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load this panel/i);
  });

  it("shows a custom message when given one", () => {
    render(<ErrorState onRetry={() => {}} message="Stats are unavailable." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Stats are unavailable.");
  });

  it("calls onRetry when the retry button is pressed", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
