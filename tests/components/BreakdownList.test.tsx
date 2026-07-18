// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BreakdownList } from "@/components/dashboard/BreakdownList";

describe("BreakdownList", () => {
  it("renders rows in the given order with formatted counts", () => {
    render(
      <BreakdownList
        rows={[
          { key: "/pricing", pageviews: 3100, visitors: 2010 },
          { key: "/", pageviews: 2400, visitors: 1800 },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("/pricing");
    expect(items[0]).toHaveTextContent("3,100");
    expect(items[1]).toHaveTextContent("/");
  });

  it("keeps the full key in a title attribute for truncation", () => {
    render(
      <BreakdownList
        rows={[{ key: "/a/very/long/path", pageviews: 1, visitors: 1 }]}
      />,
    );
    expect(screen.getByTitle("/a/very/long/path")).toBeInTheDocument();
  });
});
