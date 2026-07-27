// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoalsList } from "@/components/dashboard/GoalsList";

describe("GoalsList", () => {
  it("renders goals with completions, target, and conversion rate as a percentage", () => {
    render(
      <GoalsList
        rows={[
          {
            id: 1,
            name: "Thank you",
            kind: "path",
            match: "/thank-you",
            completions: 3100,
            conversionRate: 0.256,
          },
          {
            id: 2,
            name: "Signups",
            kind: "event",
            match: "signup",
            completions: 40,
            conversionRate: 0,
          },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Thank you");
    expect(items[0]).toHaveTextContent("/thank-you");
    expect(items[0]).toHaveTextContent("3,100");
    expect(items[0]).toHaveTextContent("25.6%");
    expect(items[1]).toHaveTextContent("0%");
  });

  it("renders a rate above 100% for a repeatable goal", () => {
    render(
      <GoalsList
        rows={[
          {
            id: 1,
            name: "Thank you",
            kind: "path",
            match: "/thank-you",
            completions: 3,
            conversionRate: 1.5,
          },
        ]}
      />,
    );
    expect(screen.getByRole("listitem")).toHaveTextContent("150%");
  });

  it("keeps the full target in a title attribute for truncation", () => {
    render(
      <GoalsList
        rows={[
          {
            id: 1,
            name: "Checkout complete",
            kind: "path",
            match: "/checkout/complete/really-long-path",
            completions: 1,
            conversionRate: 0.5,
          },
        ]}
      />,
    );
    expect(
      screen.getByTitle("/checkout/complete/really-long-path"),
    ).toBeInTheDocument();
  });
});
