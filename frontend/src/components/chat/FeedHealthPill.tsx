import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  FeedHealthContext,
  displayFeedState,
  type Feed,
  type FeedKind,
  type FeedState,
} from "@/lib/feedHealth";
import {
  providerForFeed,
} from "@/lib/toolProviders";
import { ProviderBadge } from "@/components/chat/ProviderBadge";

const STATE_DOT: Record<FeedState, string> = {
  online: "bg-success",
  stale: "bg-amber-500",
  down: "bg-danger",
  unchecked: "bg-muted-foreground/40",
};

const FEED_KINDS: FeedKind[] = ["service", "data_api", "broker", "websocket"];
const KIND_KEYS: Record<FeedKind, string> = {
  service: "services",
  data_api: "dataApis",
  broker: "brokers",
  websocket: "websockets",
};

function FeedRow({ feed }: { feed: Feed }) {
  const { t } = useTranslation();
  const provider = providerForFeed(feed);
  const age = feed.age_s == null
    ? t("agent.feedHealth.notChecked")
    : feed.age_s < 60
      ? t("agent.feedHealth.secondsAgo" as never, { count: Math.floor(feed.age_s) })
      : feed.age_s < 3600
        ? t("agent.feedHealth.minutesAgo" as never, { count: Math.floor(feed.age_s / 60) })
        : t("agent.feedHealth.hoursAgo" as never, { count: Math.floor(feed.age_s / 3600) });
  const state = displayFeedState(feed);
  return (
    <li className="flex min-w-0 items-start gap-2 py-1.5">
      <ProviderBadge provider={provider} feed={feed} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="min-w-0 font-medium text-foreground">{feed.label}</span>
          <span className="text-muted-foreground">{t(`agent.feedHealth.states.${state}` as never)}</span>
          <span className="text-muted-foreground">{age}</span>
        </div>
        {feed.detail && <p className="break-words text-muted-foreground">{feed.detail}</p>}
      </div>
    </li>
  );
}

export function FeedHealthPill() {
  const { t } = useTranslation();
  const { data, error } = useContext(FeedHealthContext);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const health = !error && data?.ok === true ? data : null;
  const counts = { online: 0, stale: 0, down: 0, unchecked: 0 };
  health?.feeds.forEach((feed) => { counts[displayFeedState(feed)] += 1; });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node
        && !rootRef.current?.contains(event.target)
        && !panelRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const buttonLabel = health
    ? t("agent.feedHealth.summary" as never, {
      online: counts.online,
      stale: counts.stale,
      down: counts.down,
      connected: health.websockets.connected,
      configured: health.websockets.configured,
    })
    : t("agent.feedHealth.unknown");

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        aria-label={buttonLabel}
        aria-expanded={Boolean(health && open)}
        aria-haspopup="dialog"
        onClick={() => {
          if (!health) return;
          const rect = rootRef.current?.getBoundingClientRect();
          if (rect) setAnchor({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
          setOpen((value) => !value);
        }}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border/70 bg-muted/35 px-3 text-[10px] text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {health === null ? (
          <>
            <span className="h-2 w-2 rounded-full bg-muted-foreground/40" aria-hidden="true" />
            <span>{t("agent.feedHealth.unknown")}</span>
          </>
        ) : (
          <>
            {(["online", "stale", "down"] as const).map((state) => (
              <span key={state} className="inline-flex items-center gap-1 tabular-nums">
                <span className={`h-2 w-2 rounded-full ${STATE_DOT[state]}`} aria-hidden="true" />
                {counts[state]}
              </span>
            ))}
            <span className="text-muted-foreground">
              {t("agent.feedHealth.websockets", {
                connected: health.websockets.connected,
                configured: health.websockets.configured,
              })}
            </span>
          </>
        )}
      </button>

      {health && open && createPortal(
        <section
          ref={panelRef}
          role="dialog"
          style={anchor ? { top: anchor.top, right: anchor.right } : undefined}
          aria-label={t("agent.feedHealth.title")}
          className="fixed z-[100] max-h-[min(70vh,34rem)] w-[min(26rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-border bg-card p-3 text-xs text-foreground shadow-xl max-sm:!left-2 max-sm:!right-2 max-sm:w-auto"
        >
          <div className="space-y-3">
            {FEED_KINDS.map((kind) => {
              const feeds = health.feeds.filter((feed) => feed.kind === kind);
              if (!feeds.length) return null;
              return (
                <div key={kind}>
                  <h3 className="mb-1 font-semibold text-foreground">
                    {t(`agent.feedHealth.kinds.${KIND_KEYS[kind]}` as never)}
                  </h3>
                  <ul className="divide-y divide-border/50">
                    {feeds.map((feed) => <FeedRow key={feed.id} feed={feed} />)}
                  </ul>
                </div>
              );
            })}
          </div>
          <footer className="mt-3 border-t border-border pt-2 text-muted-foreground">
            <p>{health.rule}</p>
            <p className="mt-1">{t("agent.feedHealth.asOf", { time: health.ts_et })}</p>
          </footer>
        </section>,
        document.body,
      )}
    </div>
  );
}
