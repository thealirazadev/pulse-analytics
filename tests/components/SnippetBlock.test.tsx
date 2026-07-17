// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SnippetBlock } from "@/components/sites/SnippetBlock";

describe("SnippetBlock", () => {
  it("copies the snippet and announces the copy", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const snippet =
      '<script async src="https://pulse.example.com/p.js" data-site="pk_abcd1234"></script>';
    render(<SnippetBlock snippet={snippet} />);

    await user.click(screen.getByRole("button", { name: /^copy$/i }));

    expect(writeText).toHaveBeenCalledWith(snippet);
    expect(
      await screen.findByRole("button", { name: /copied/i }),
    ).toBeInTheDocument();
  });

  it("renders the snippet as text, not markup", () => {
    const snippet = '<script async src="/p.js" data-site="pk_abcd1234"></script>';
    render(<SnippetBlock snippet={snippet} />);
    expect(screen.getByText(snippet)).toBeInTheDocument();
  });
});
