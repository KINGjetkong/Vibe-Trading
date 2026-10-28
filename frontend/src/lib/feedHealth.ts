import { createContext, useEffect, useState } from "react";

const TOOLPORT_URL = import.meta.env.VITE_MADX_TOOLPORT_URL ?? "http://127.0.0.1:7790";
export const FEED_HEALTH_URL = `${TOOLPORT_URL.replace(/\/+$/, "")}/api/v1/feed_health`;
export const FEED_HEALTH_POLL_MS = 30_000;

export type FeedState = "online" | "stale" | "down" | "unchecked";
export type FeedKind = "service" | "data_api" | "broker" | "websocket";

export interface Feed {
  id: string;
  label: string;
  kind: FeedKind;
  family: string;
  state: FeedState;
  checked_at: string | null;
  age_s: number | null;
  detail: string;
  toolport: string[];
  tag: string;
}

export function displayFeedState(feed: Feed): FeedState {
  return feed.state === "online" && (feed.age_s == null || feed.age_s > 300)
    ? "stale"
    : feed.state;
}

export interface FeedHealthPayload {
  ok: boolean;
  ts_utc: string;
  ts_et: string;
  counts: Record<FeedState, number>;
  websockets: { connected: number; configured: number };
  feeds: Feed[];
  rule: string;
}

export interface FeedHealthContextValue {
  data: FeedHealthPayload | null;
  error: boolean;
}

export const FeedHealthContext = createContext<FeedHealthContextValue>({
  data: null,
  error: true,
});

export function useFeedHealth(enabled = true): FeedHealthContextValue {
  const [data, setData] = useState<FeedHealthPayload | null>(null);
  const [error, setError] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let timer: number | undefined;
    let controller: AbortController | undefined;

    const stop = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      controller?.abort();
      controller = undefined;
    };

    const poll = async () => {
      if (disposed || document.hidden) return;
      setData(null);
      setError(true);
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch(FEED_HEALTH_URL, { signal: request.signal });
        if (!response.ok) throw new Error("Feed health request failed");
        const payload = await response.json() as FeedHealthPayload;
        if (!payload || payload.ok !== true || !Array.isArray(payload.feeds)) {
          throw new Error("Feed health response was invalid");
        }
        if (!disposed && !request.signal.aborted) {
          setData(payload);
          setError(false);
        }
      } catch {
        if (!disposed && !request.signal.aborted) {
          setData(null);
          setError(true);
        }
      } finally {
        if (controller === request) controller = undefined;
        if (!disposed && !document.hidden && !request.signal.aborted) {
          timer = window.setTimeout(() => void poll(), FEED_HEALTH_POLL_MS);
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else {
        stop();
        void poll();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (!document.hidden) void poll();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stop();
    };
  }, [enabled]);

  return { data, error };
}
