import { fireEvent, render, screen } from "@testing-library/react";
import { FeedHealthContext, type FeedHealthPayload } from "@/lib/feedHealth";
import { FeedHealthPill } from "../FeedHealthPill";

const payload: FeedHealthPayload = {
  ok: true,
  ts_utc: "2026-10-27T20:00:00Z",
  ts_et: "Oct 27, 04:00:00 PM ET",
  counts: { online: 2, stale: 1, down: 1, unchecked: 3 },
  websockets: { connected: 0, configured: 1 },
  feeds: [
    {
      id: "service:toolport",
      label: "Tool Port",
      kind: "service",
      family: "TP",
      state: "online",
      checked_at: "2026-10-27T20:00:00Z",
      age_s: 3,
      detail: "this server",
      toolport: [],
      tag: "LOG",
    },
    {
      id: "service:journal",
      label: "Trade Journal",
      kind: "service",
      family: "TJ",
      state: "online",
      checked_at: "2026-10-27T20:00:00Z",
      age_s: 10,
      detail: "HTTP 200",
      toolport: [],
      tag: "LOG",
    },
    {
      id: "provider:flashalpha",
      label: "FlashAlpha",
      kind: "data_api",
      family: "FA",
      state: "stale",
      checked_at: null,
      age_s: null,
      detail: "key present · not probed",
      toolport: [],
      tag: "REAL-TICKS",
    },
    {
      id: "broker:alpaca",
      label: "Alpaca",
      kind: "broker",
      family: "AL",
      state: "down",
      checked_at: "2026-10-27T20:00:00Z",
      age_s: 1,
      detail: "HTTP 401 Unauthorized",
      toolport: [],
      tag: "LOG",
    },
  ],
  rule: "green = recent check; yellow = stale; red = failed; grey = unchecked",
};

describe("FeedHealthPill", () => {
  it("shows feed counts and the grouped details popover", () => {
    render(
      <FeedHealthContext.Provider value={{ data: payload, error: false }}>
        <FeedHealthPill />
      </FeedHealthContext.Provider>,
    );

    const button = screen.getByRole("button", { name: /2 online.*1 stale.*1 down/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("WS 0/1");
    fireEvent.click(button);
    expect(screen.getByRole("dialog", { name: "Feed health" })).toBeInTheDocument();
    expect(screen.getByText("Tool Port")).toBeInTheDocument();
    expect(screen.getByText(/as of Oct 27/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a grey unknown state when the fetch failed", () => {
    render(
      <FeedHealthContext.Provider value={{ data: null, error: true }}>
        <FeedHealthPill />
      </FeedHealthContext.Provider>,
    );

    const button = screen.getByRole("button", { name: "Feeds unknown" });
    expect(button).toBeInTheDocument();
    expect(button.querySelector("span")).toHaveClass("bg-muted-foreground/40");
  });

  it("does not show green for an online feed checked over five minutes ago", () => {
    const oldCheck: FeedHealthPayload = {
      ...payload,
      counts: { online: 1, stale: 0, down: 0, unchecked: 0 },
      feeds: [{ ...payload.feeds[0], age_s: 301 }],
    };
    render(
      <FeedHealthContext.Provider value={{ data: oldCheck, error: false }}>
        <FeedHealthPill />
      </FeedHealthContext.Provider>,
    );
    expect(screen.getByRole("button", { name: /0 online.*1 stale.*0 down/i })).toBeInTheDocument();
  });
});
