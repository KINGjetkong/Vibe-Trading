import type { Feed } from "@/lib/feedHealth";

export interface ToolProvider {
  id: string;
  label: string;
  family: string;
  color: string;
}

const FAMILY_COLORS: Record<string, string> = {
  TD: "bg-cyan-700",
  FA: "bg-indigo-700",
  UW: "bg-violet-700",
  TR: "bg-sky-700",
  AL: "bg-slate-800",
  AM: "bg-slate-700",
  PG: "bg-blue-700",
  QC: "bg-emerald-700",
  TT: "bg-orange-700",
  IB: "bg-rose-700",
  YF: "bg-purple-700",
  OK: "bg-neutral-700",
  TS: "bg-teal-700",
  AK: "bg-amber-700",
  MD: "bg-slate-600",
  WEB: "bg-blue-600",
  BT: "bg-emerald-800",
  AG: "bg-violet-800",
  BR: "bg-slate-600",
  TP: "bg-slate-700",
  TJ: "bg-amber-800",
  ES: "bg-lime-800",
  MT: "bg-indigo-800",
  AI: "bg-cyan-800",
  PP: "bg-slate-600",
};

const SOURCE_PROVIDERS: Record<string, { family: string; label: string }> = {
  yfinance: { family: "YF", label: "Yahoo Finance" },
  yahoo: { family: "YF", label: "Yahoo Finance" },
  okx: { family: "OK", label: "OKX" },
  tushare: { family: "TS", label: "Tushare" },
  akshare: { family: "AK", label: "AKShare" },
  polygon: { family: "PG", label: "Polygon" },
  tradier: { family: "TR", label: "Tradier" },
  alpaca: { family: "AL", label: "Alpaca" },
  auto: { family: "MD", label: "Market Data" },
};

const BROKER_PROVIDERS: Record<string, { family: string; label: string }> = {
  alpaca: { family: "AL", label: "Alpaca" },
  tradier: { family: "TR", label: "Tradier" },
  ibkr: { family: "IB", label: "Interactive Brokers" },
  tastytrade: { family: "TT", label: "tastytrade" },
  quantconnect: { family: "QC", label: "QuantConnect" },
};

const NO_BADGE_TOOLS = new Set([
  "bash",
  "read_file",
  "write_file",
  "edit_file",
]);

export function familyColor(family: string): string {
  return FAMILY_COLORS[family.toUpperCase()] ?? "bg-muted-foreground";
}

export function providerForFeed(feed: Feed): ToolProvider {
  return {
    id: feed.id,
    label: feed.label,
    family: feed.family,
    color: familyColor(feed.family),
  };
}

function providerForFamily(
  family: string,
  label: string,
  feeds?: Feed[],
): ToolProvider {
  const feed = feeds?.find((item) => item.family.toUpperCase() === family);
  if (feed) return providerForFeed(feed);
  return {
    id: family.toLowerCase(),
    label,
    family,
    color: familyColor(family),
  };
}

function feedForTool(tool: string, feeds: Feed[]): Feed | undefined {
  return feeds.find((feed) => feed.toolport.includes(tool));
}

export function providerForTool(
  tool: string,
  args: Record<string, string>,
  feeds: Feed[] = [],
): ToolProvider | null {
  const normalizedTool = tool.replace(/^mcp_[^_]+_/, "");
  if (NO_BADGE_TOOLS.has(tool) || NO_BADGE_TOOLS.has(normalizedTool)) return null;

  const exactFeed = feedForTool(tool, feeds) ?? feedForTool(normalizedTool, feeds);
  if (exactFeed) return providerForFeed(exactFeed);

  if (tool === "get_market_data" || normalizedTool === "get_market_data") {
    const source = (args.source || "auto").trim().toLowerCase().replace(/[\s-]+/g, "");
    const provider = SOURCE_PROVIDERS[source] ?? SOURCE_PROVIDERS.auto;
    return providerForFamily(provider.family, provider.label, feeds);
  }

  if (tool.startsWith("trading_") || normalizedTool.startsWith("trading_")) {
    const connector = (args.connection || args.connector || args.broker || "").trim().toLowerCase();
    const match = Object.entries(BROKER_PROVIDERS).find(([name]) => connector.includes(name));
    const provider = match?.[1] ?? { family: "BR", label: "Broker" };
    return providerForFamily(provider.family, provider.label, feeds);
  }

  if (["web_search", "read_url"].includes(tool) || ["web_search", "read_url"].includes(normalizedTool)) {
    return providerForFamily("WEB", "Web", feeds);
  }
  if (tool === "backtest" || tool.startsWith("backtest_") || normalizedTool === "backtest") {
    return providerForFamily("BT", "Backtest engine", feeds);
  }
  if (
    ["run_swarm", "spawn_subagent"].includes(tool)
    || ["run_swarm", "spawn_subagent"].includes(normalizedTool)
  ) {
    return providerForFamily("AG", "Agent swarm", feeds);
  }
  return null;
}

export function providerForInlineCodeToken(token: string, feeds: Feed[] = []): ToolProvider | null {
  const normalized = token.toLocaleLowerCase();
  if (!normalized) return null;
  const matchingFeed = feeds.find((feed) =>
    [feed.id, feed.label, ...feed.toolport].some((name) => name.trim().toLocaleLowerCase() === normalized),
  );
  if (matchingFeed) return providerForFeed(matchingFeed);
  return providerForTool(normalized, {}, feeds);
}
