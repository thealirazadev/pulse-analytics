// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeleteSiteButton } from "@/components/sites/DeleteSiteButton";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  refresh.mockClear();
  vi.unstubAllGlobals();
});

function open(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("button", { name: "Delete Northwind" }));
}

describe("DeleteSiteButton", () => {
  it("closes the dialog and refreshes after a successful delete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 204 }),
    );
    const user = userEvent.setup();
    render(<DeleteSiteButton siteId="pk_abcd1234" siteName="Northwind" />);

    await open(user);
    await user.click(screen.getByRole("button", { name: "Delete site" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("surfaces an error and keeps the dialog open when the delete fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const user = userEvent.setup();
    render(<DeleteSiteButton siteId="pk_abcd1234" siteName="Northwind" />);

    await open(user);
    await user.click(screen.getByRole("button", { name: "Delete site" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not delete the site/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("surfaces a network error when the request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const user = userEvent.setup();
    render(<DeleteSiteButton siteId="pk_abcd1234" siteName="Northwind" />);

    await open(user);
    await user.click(screen.getByRole("button", { name: "Delete site" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not reach the server/i);
    expect(refresh).not.toHaveBeenCalled();
  });
});
