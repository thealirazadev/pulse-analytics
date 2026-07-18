// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteForm } from "@/components/sites/SiteForm";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn() }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  refresh.mockClear();
});

describe("SiteForm", () => {
  it("shows a validation message when fields are empty", async () => {
    const user = userEvent.setup();
    render(<SiteForm />);
    await user.click(screen.getByRole("button", { name: /add site/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/enter a domain/i);
  });

  it("surfaces a conflict from the server", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 409 }),
    );
    const user = userEvent.setup();
    render(<SiteForm />);
    await user.type(screen.getByLabelText(/domain/i), "example.com");
    await user.type(screen.getByLabelText(/name/i), "Example");
    await user.click(screen.getByRole("button", { name: /add site/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /already registered/i,
    );
  });

  it("clears and refreshes on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "pk_abcd1234" }), { status: 201 }),
    );
    const user = userEvent.setup();
    render(<SiteForm />);
    const domain = screen.getByLabelText(/domain/i) as HTMLInputElement;
    await user.type(domain, "example.com");
    await user.type(screen.getByLabelText(/name/i), "Example");
    await user.click(screen.getByRole("button", { name: /add site/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(domain.value).toBe("");
  });
});
