import { providerForTool } from "@/lib/toolProviders";
import type { Feed } from "@/lib/feedHealth";

const theta: Feed = {
  id: "provider:thetadata",
  label: "ThetaData",
  kind: "data_api",
  family: "TD",
  state: "stale",
  checked_at: null,
  age_s: null,
  detail: "key present · not probed",
  toolport: ["madx_data_status"],
  tag: "REAL-TICKS",
};

describe("providerForTool", () => {
  it("resolves exact Tool Port names and MCP-prefixed names", () => {
    expect(providerForTool("madx_data_status", {}, [theta])).toMatchObject({
      id: theta.id,
      label: "ThetaData",
      family: "TD",
    });
    expect(providerForTool("mcp_theta_madx_data_status", {}, [theta])?.id).toBe(theta.id);
  });

  it("maps market data source families", () => {
    expect(providerForTool("get_market_data", { source: "yfinance" })).toMatchObject({
      label: "Yahoo Finance",
      family: "YF",
    });
  });

  it("maps trading connector arguments", () => {
    expect(providerForTool("trading_place_order", { connector: "alpaca_paper" })).toMatchObject({
      label: "Alpaca",
      family: "AL",
    });
  });

  it("does not badge shell or file tools", () => {
    expect(providerForTool("bash", {})).toBeNull();
    expect(providerForTool("read_file", {})).toBeNull();
  });
});
