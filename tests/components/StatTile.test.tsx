// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatTile } from "@/components/dashboard/StatTile";

describe("StatTile", () => {
  it("shows the value and caption", () => {
    render(<StatTile label="Pageviews" value="12,840" caption="per day" />);
    expect(screen.getByText("12,840")).toBeInTheDocument();
    expect(screen.getByText("per day")).toBeInTheDocument();
  });

  it("shows an em dash and no-data caption when value is null", () => {
    render(<StatTile label="Unique visitors" value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText(/no data in this range/i)).toBeInTheDocument();
  });
});
