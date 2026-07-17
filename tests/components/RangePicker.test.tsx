// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RangePicker } from "@/components/dashboard/RangePicker";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => push.mockClear());

describe("RangePicker", () => {
  it("marks the current range as checked", () => {
    render(<RangePicker siteId="pk_abcd1234" current="7d" />);
    const checked = screen.getByRole("radio", { checked: true });
    expect(checked).toHaveTextContent(/last 7 days/i);
  });

  it("navigates on click", async () => {
    const user = userEvent.setup();
    render(<RangePicker siteId="pk_abcd1234" current="7d" />);
    await user.click(screen.getByRole("radio", { name: /today/i }));
    expect(push).toHaveBeenCalledWith("/dashboard/pk_abcd1234?range=today");
  });

  it("moves focus with arrow keys and selects with Enter", async () => {
    const user = userEvent.setup();
    render(<RangePicker siteId="pk_abcd1234" current="today" />);
    const today = screen.getByRole("radio", { name: /today/i });
    today.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /last 7 days/i })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/dashboard/pk_abcd1234?range=7d");
  });
});
