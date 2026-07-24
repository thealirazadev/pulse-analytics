// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChartPanel } from "@/components/dashboard/ChartPanel";

// The uPlot chart needs a canvas and ResizeObserver; stub it out. The piece
// under test is the accessible data-table alternative, which lives in
// ChartPanel itself alongside the chart.
vi.mock("@/components/dashboard/TimeseriesChart", () => ({
  TimeseriesChart: () => <div data-testid="chart" />,
}));

afterEach(() => vi.unstubAllGlobals());

function stubTimeseries(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    }),
  );
}

describe("ChartPanel accessible data table", () => {
  it("exposes the chart data as a labeled table of daily buckets", async () => {
    stubTimeseries({
      interval: "day",
      points: [
        { bucket: "2026-07-17", pageviews: 12, visitors: 8 },
        { bucket: "2026-07-18", pageviews: 30, visitors: 20 },
      ],
    });
    const user = userEvent.setup();
    render(<ChartPanel siteId="pk_abcd1234" range="7d" />);

    // The panel is a region named by its heading.
    expect(
      screen.getByRole("region", { name: /pageviews and visitors/i }),
    ).toBeInTheDocument();

    // Reveal the table alternative.
    await user.click(await screen.findByText(/view data as a table/i));

    const table = screen.getByRole("table");
    expect(table).toHaveAccessibleName(/per day/i);
    expect(screen.getByRole("columnheader", { name: "Day" })).toBeInTheDocument();

    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3); // header + two data rows
    expect(rows[2]).toHaveTextContent("2026-07-18");
    expect(rows[2]).toHaveTextContent("30");
    expect(rows[2]).toHaveTextContent("20");
  });

  it("labels the bucket column Hour for the today range", async () => {
    stubTimeseries({
      interval: "hour",
      points: [
        { bucket: "2026-07-18T09:00:00.000Z", pageviews: 5, visitors: 3 },
      ],
    });
    const user = userEvent.setup();
    render(<ChartPanel siteId="pk_abcd1234" range="today" />);

    await user.click(await screen.findByText(/view data as a table/i));
    expect(
      screen.getByRole("columnheader", { name: "Hour" }),
    ).toBeInTheDocument();
  });
});
