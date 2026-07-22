// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CustomEventsList } from "@/components/dashboard/CustomEventsList";

describe("CustomEventsList", () => {
  it("renders events in the given order with formatted counts", () => {
    render(
      <CustomEventsList
        rows={[
          { name: "signup", count: 3100 },
          { name: "purchase", count: 2400 },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("signup");
    expect(items[0]).toHaveTextContent("3,100");
    expect(items[1]).toHaveTextContent("purchase");
  });

  it("keeps the full name in a title attribute for truncation", () => {
    render(
      <CustomEventsList rows={[{ name: "very-long-event-name", count: 1 }]} />,
    );
    expect(screen.getByTitle("very-long-event-name")).toBeInTheDocument();
  });
});
