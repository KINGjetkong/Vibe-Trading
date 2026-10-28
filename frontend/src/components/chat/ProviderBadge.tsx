import { displayFeedState, type Feed } from "@/lib/feedHealth";
import type { ToolProvider } from "@/lib/toolProviders";

interface Props {
  provider: ToolProvider;
  feed?: Feed;
}

function checkedAge(ageSeconds: number | null | undefined): string {
  if (ageSeconds == null) return "not checked";
  if (ageSeconds < 60) return `${Math.floor(ageSeconds)}s ago`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m ago`;
  return `${Math.floor(ageSeconds / 3600)}h ago`;
}

const STATE_DOT: Record<Feed["state"], string> = {
  online: "bg-success",
  stale: "bg-amber-500",
  down: "bg-danger",
  unchecked: "bg-muted-foreground/40",
};

export function ProviderBadge({ provider, feed }: Props) {
  const state = feed ? displayFeedState(feed) : null;
  const stateLabel = state ?? "unknown";
  const label = `${provider.label} · ${stateLabel} · checked ${checkedAge(feed?.age_s)}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`relative inline-flex h-4 w-4 shrink-0 align-middle items-center justify-center rounded-md text-[8px] font-bold leading-none text-white ring-1 ring-white/90 shadow-sm ${provider.color}`}
    >
      {provider.family.slice(0, 2).toUpperCase()}
      {feed && (
        <span
          aria-hidden="true"
          className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-card ${STATE_DOT[state ?? "unchecked"]}`}
        />
      )}
    </span>
  );
}
