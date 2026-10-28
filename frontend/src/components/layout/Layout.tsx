import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useSearchParams } from "react-router";
import { Check, ChevronDown, Languages, Moon, Sun, Plus, Trash2, Pencil, MessageSquare, ChevronsLeft, ChevronsRight, Loader2, X, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDarkMode } from "@/hooks/useDarkMode";
import { api, type SessionItem } from "@/lib/api";
import { safeGet, safeSet } from "@/lib/storage";
import { useAgentStore } from "@/stores/agent";
import { ConnectionBanner } from "@/components/layout/ConnectionBanner";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import i18n from "@/i18n";
import { toast } from "sonner";
import { SidebarNavigation } from "./SidebarNavigation";
import { PageHelp } from "./PageHelp";
import { FeedHealthContext, useFeedHealth } from "@/lib/feedHealth";
import { FeedHealthPill } from "@/components/chat/FeedHealthPill";

// APP_VERSION is sourced from i18n locale files (app.version key) to keep a
// single source of truth across the footer and every localised README.

export function Layout() {
  const { t } = useTranslation();

  const { pathname } = useLocation();
  const isAgentPage = pathname === "/" || pathname.startsWith("/agent");
  const [searchParams] = useSearchParams();
  const { dark, toggle } = useDarkMode();
  const feedHealth = useFeedHealth(isAgentPage);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const sessionsLoadGeneration = useRef(0);
  const pendingSessionActions = useRef(new Set<string>());
  const sseStatus = useAgentStore(s => s.sseStatus);
  const sseRetryAttempt = useAgentStore(s => s.sseRetryAttempt);
  const [collapsed, setCollapsed] = useState(() => safeGet("qa-sidebar") === "collapsed");
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const sessionsPanelRef = useRef<HTMLDivElement>(null);
  const sessionsTriggerRef = useRef<HTMLButtonElement>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

  const activeSessionId = searchParams.get("session");
  const streamingSessionId = useAgentStore(s => s.streamingSessionId);
  const pageTitle = sessions.find((session) => session.session_id === activeSessionId)?.title || t("layout.agent");

  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => mobileDrawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable()?.[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileDrawerOpen(false);
        mobileMenuButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(focusable() ?? []);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileDrawerOpen]);

  useEffect(() => {
    if (!sessionsOpen) return;
    const dismiss = (event: MouseEvent) => {
      if (!sessionsPanelRef.current?.contains(event.target as Node)
        && !sessionsTriggerRef.current?.contains(event.target as Node)) setSessionsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSessionsOpen(false);
        sessionsTriggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, [sessionsOpen]);

  useEffect(() => {
    safeSet("qa-sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  useEffect(() => {
    const syncSidebarPreference = (event: StorageEvent) => {
      if (event.key !== null && event.key !== "qa-sidebar") return;
      setCollapsed(safeGet("qa-sidebar") === "collapsed");
    };
    window.addEventListener("storage", syncSidebarPreference);
    return () => window.removeEventListener("storage", syncSidebarPreference);
  }, []);

  const loadSessions = useCallback(() => {
    const generation = ++sessionsLoadGeneration.current;
    setSessionsLoading(true);
    api.listSessions()
      .then((list) => {
        if (generation !== sessionsLoadGeneration.current) return;
        setSessions(Array.isArray(list) ? list : []);
        setSessionsError(null);
      })
      .catch((error: unknown) => {
        if (generation === sessionsLoadGeneration.current) {
          setSessionsError(error instanceof Error ? error.message : i18n.t("settings.unknownError"));
        }
      })
      .finally(() => {
        if (generation === sessionsLoadGeneration.current) setSessionsLoading(false);
      });
  }, []);

  // Load sessions on mount. Also refresh when navigating TO /agent or when
  // the active session changes (covers new session creation from Agent).
  useEffect(() => {
    loadSessions();
    return () => { sessionsLoadGeneration.current += 1; };
  }, [isAgentPage, activeSessionId, loadSessions]);

  // Re-list after out-of-band title changes (e.g. LLM auto-titling on the
  // first completed exchange).
  useEffect(() => {
    const refresh = () => loadSessions();
    window.addEventListener("vibe:sessions-refresh", refresh);
    return () => window.removeEventListener("vibe:sessions-refresh", refresh);
  }, [loadSessions]);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const deleteSession = async (sid: string) => {
    if (pendingSessionActions.current.has(sid)) return;
    pendingSessionActions.current.add(sid);
    try {
      await api.deleteSession(sid);
      setSessions((prev) => prev.filter((s) => s.session_id !== sid));
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("settings.unknownError"));
    } finally {
      pendingSessionActions.current.delete(sid);
    }
  };

  const renameSession = async (sid: string) => {
    if (!renameValue.trim()) { setRenameTarget(null); return; }
    if (pendingSessionActions.current.has(sid)) return;
    pendingSessionActions.current.add(sid);
    const title = renameValue.trim();
    try {
      await api.renameSession(sid, title);
      setSessions((prev) => prev.map((s) => s.session_id === sid ? { ...s, title } : s));
      setRenameTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("settings.unknownError"));
    } finally {
      pendingSessionActions.current.delete(sid);
    }
  };

  return (
    <FeedHealthContext.Provider value={feedHealth}>
    <div className="flex h-screen max-md:h-[100dvh] bg-background rtl:flex-row-reverse">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {t('layout.skipToMain', { defaultValue: 'Skip to main content' })}
      </a>
      {/* Sidebar */}
      <aside
        aria-label={t('layout.sidebar', { defaultValue: 'Vibe-Trading sidebar' })}
        className={cn(
          "madx-duo-sidebar max-md:hidden border-e border-border/60 bg-card flex flex-col shrink-0 transition-all duration-200 overflow-visible",
          collapsed ? "w-12" : "w-64"
        )}
      >
        {/* Brand */}
        <div className={cn("border-b border-border/60", collapsed ? "p-2 flex justify-center" : "p-4 max-md:p-2 max-md:flex max-md:justify-center")}>
          <Link
            to="/"
            aria-label="MadTrader · MADX SIGMA6"
            className={cn("flex items-center", collapsed ? "justify-center" : "gap-2 max-md:justify-center")}
          >
            <span className="madx-brand-identity">
              <img className="h-6 w-6 shrink-0" src="http://127.0.0.1:7790/_madx/madx-mark.svg?v=gemini-20261028" alt="" />
              <svg className="madx-brand-sparkle" viewBox="0 0 24 20" aria-hidden="true">
                <defs>
                  <linearGradient id="madx-header-spectrum" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#4285f4" />
                    <stop offset="25%" stopColor="#9b72cb" />
                    <stop offset="45%" stopColor="#d96570" />
                    <stop offset="65%" stopColor="#f4b400" />
                    <stop offset="82%" stopColor="#0f9d58" />
                    <stop offset="100%" stopColor="#4285f4" />
                  </linearGradient>
                </defs>
                <path d="M12 1.5c1.2 5.8 2.7 7.3 8.5 8.5-5.8 1.2-7.3 2.7-8.5 8.5-1.2-5.8-2.7-7.3-8.5-8.5 5.8-1.2 7.3-2.7 8.5-8.5Z" fill="url(#madx-header-spectrum)" />
              </svg>
            </span>
            {!collapsed && (
              <span className="text-[15px] font-semibold tracking-tight max-md:hidden">MadTrader · <span className="madx-wordmark">MADX</span> SIGMA6</span>
            )}
          </Link>
        </div>

        {/* Nav */}
        <SidebarNavigation collapsed={collapsed} />

        <button
          ref={sessionsTriggerRef}
          type="button"
          aria-label={t("layout.sessions")}
          aria-expanded={sessionsOpen}
          aria-controls="sidebar-sessions"
          title={t("layout.sessions")}
          onClick={() => setSessionsOpen((open) => !open)}
          className={cn("mx-1 mt-2 flex items-center justify-center rounded-md border-t p-2 text-muted-foreground hover:bg-muted", !collapsed && "md:hidden")}
        >
          <MessageSquare className="h-4 w-4" />
        </button>

        {/* Compact layouts keep history and new-chat actions in a disclosure. */}
        {(!collapsed || sessionsOpen) && (
          <div
            ref={sessionsPanelRef}
            id="sidebar-sessions"
            aria-label={t("layout.sessions")}
            className={cn("overflow-auto flex flex-col border-border/60", sessionsOpen
              ? "fixed inset-y-0 start-12 z-40 w-[min(18rem,calc(100vw-3rem))] border-e bg-card shadow-xl"
              : "flex-1 border-t mt-2 max-md:hidden")}
          >
            <div className="flex items-center justify-between px-4 py-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                {t('layout.sessions')}
              </span>
              <Link
                to="/agent"
                onClick={() => setSessionsOpen(false)}
                aria-label={t('layout.newChat')}
                className="flex items-center gap-1 p-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title={t('layout.newChat')}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              {sessionsOpen && <button type="button" aria-label={t("layout.collapse")} onClick={() => { setSessionsOpen(false); sessionsTriggerRef.current?.focus(); }} className="rounded p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>}
            </div>

            {sessionsOpen && sessionsError && (
              <div className="mx-3 mb-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
                <p>{t("layout.sessionsLoadFailed")} {sessionsError}</p>
                <button type="button" onClick={loadSessions} disabled={sessionsLoading} className="mt-2 rounded border px-2 py-1 disabled:opacity-50">{t("connection.retry")}</button>
              </div>
            )}

            <div className="px-2 pb-2 space-y-0.5 overflow-auto flex-1">
              {sessionsLoading ? (
                <div className="space-y-1.5 px-2 py-1">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-7 rounded-md bg-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : !sessionsError && sessions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground/60">{t('layout.noSessions')}</p>
              ) : null}
              {sessions.map((s) => {
                const isActive = s.session_id === activeSessionId;
                const isDeleting = deleteTarget === s.session_id;
                const isRenaming = renameTarget === s.session_id;
                return (
                  <div key={s.session_id} className="group relative flex items-center">
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") renameSession(s.session_id); if (e.key === "Escape") setRenameTarget(null); }}
                        onBlur={() => renameSession(s.session_id)}
                        aria-label={`${t('layout.rename')}: ${s.title || s.session_id}`}
                        className="flex-1 min-w-0 ps-3 pe-2 py-1.5 rounded-md text-xs border border-primary bg-background outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    ) : (
                      <Link
                        to={`/agent?session=${s.session_id}`}
                        onClick={() => setSessionsOpen(false)}
                        className={cn(
                          "flex-1 min-w-0 ps-3 pe-14 py-1.5 rounded-md text-xs transition-colors truncate block border-s-2",
                          isActive
                            ? "border-s-primary bg-primary/10 text-primary font-medium"
                            : "border-s-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                        title={s.title || s.session_id}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          {streamingSessionId === s.session_id ? (
                            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
                          ) : (
                            // Transparent placeholder keeps titles aligned with
                            // spinner rows without a meaningless gray dot.
                            <span className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              isActive ? "bg-primary/70" : "bg-transparent"
                            )} />
                          )}
                          <span className="min-w-0 truncate">{s.title || s.session_id.slice(0, 16)}</span>
                        </span>
                      </Link>
                    )}
                    {!isRenaming && isDeleting ? (
                      <div className="absolute right-0.5 flex items-center gap-0.5">
                        <button onClick={() => deleteSession(s.session_id)} className="p-1.5 text-danger hover:bg-danger/10 rounded text-[10px] font-medium">{t('layout.confirm')}</button>
                        <button onClick={() => setDeleteTarget(null)} className="p-1.5 text-muted-foreground hover:bg-muted rounded text-[10px]">{t('layout.cancel')}</button>
                      </div>
                    ) : !isRenaming ? (
                      <div className="absolute right-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center gap-0.5 transition-opacity">
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRenameTarget(s.session_id); setRenameValue(s.title || ""); }}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded"
                          title={t('layout.rename')}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(s.session_id); }}
                          className="p-1.5 text-muted-foreground hover:text-danger rounded"
                          title={t('layout.delete')}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Spacer when collapsed */}
        {collapsed && <div className="flex-1" />}

        {/* Footer */}
        <div className={cn("mt-auto border-t border-border/60", collapsed ? "p-1 flex flex-col items-center gap-1" : "p-3 space-y-2 max-md:p-1 max-md:flex max-md:flex-col max-md:items-center max-md:gap-1 max-md:space-y-0")}>
          {collapsed ? (
            <>
              <button onClick={toggle} aria-label={dark ? t('layout.light') : t('layout.dark')} className="flex min-h-11 min-w-11 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground" title={dark ? t('layout.light') : t('layout.dark')}>
                {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => setCollapsed(false)} className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors" title={t('layout.expand')}>
                <ChevronsRight className="h-3.5 w-3.5" />
              </button>
              <LanguageSwitcher compact />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between max-md:flex-col">
                <button
                  onClick={toggle}
                  aria-label={dark ? t('layout.light') : t('layout.dark')}
                  className="flex min-h-11 min-w-11 items-center gap-1.5 rounded p-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  <span className="max-md:hidden">{dark ? t('layout.light') : t('layout.dark')}</span>
                </button>
                <div className="flex items-center gap-1 max-md:hidden">
                  <button
                    onClick={() => setCollapsed(true)}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                    title={t('layout.collapse')}
                  >
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1 max-md:items-center">
                <LanguageSwitcher />
                {/* About is marketing, not a work surface — it lives here by
                    the version stamp instead of in the primary nav. */}
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 max-md:hidden">
                  <span>{t('app.version')}</span>
                  <span aria-hidden="true">·</span>
                  <Link to="/about" className="transition-colors hover:text-foreground">
                    {t('layout.about')}
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="relative flex-1 flex flex-col overflow-hidden">
        <header className="madx-phone-appbar md:hidden z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-end border-b border-border/60 bg-background/95 px-2 pb-1.5 pt-[env(safe-area-inset-top)] backdrop-blur">
          <button
            ref={mobileMenuButtonRef}
            type="button"
            aria-label={t("navigation.menu")}
            aria-expanded={mobileDrawerOpen}
            aria-controls="madx-phone-drawer"
            onClick={() => setMobileDrawerOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="min-w-0 flex-1 truncate px-2 text-center text-sm font-medium text-foreground">{pageTitle}</span>
          <Link
            to="/agent"
            aria-label={t("layout.newChat")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </Link>
        </header>
        {sessionsError ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs">
            <span className="font-medium">{t("layout.sessionsLoadFailed")}</span>
            <span className="text-muted-foreground">{sessionsError}</span>
            <button type="button" onClick={loadSessions} disabled={sessionsLoading} className="ms-auto rounded-md border px-2 py-1 disabled:opacity-50">
              {sessionsLoading ? t("settings.loading") : t("connection.retry")}
            </button>
            <Link to="/settings" className="text-primary underline">{t("layout.settings")}</Link>
          </div>
        ) : <ConnectionBanner status={sseStatus} retryAttempt={sseRetryAttempt} />}
        <main id="main" className="flex-1 min-h-0 overflow-auto">
          <PageHelp />
          <Outlet />
        </main>
      </div>
      {mobileDrawerOpen && (
        <div className="madx-phone-scrim fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            aria-label={t("navigation.close")}
            className="absolute inset-0 h-full w-full bg-black/40"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <aside
            ref={mobileDrawerRef}
            id="madx-phone-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t("layout.sidebar")}
            className="madx-phone-drawer absolute inset-y-0 start-0 flex w-[min(20rem,calc(100vw-2rem))] flex-col border-e border-border bg-card pt-[env(safe-area-inset-top)] shadow-xl"
          >
            <div className="flex min-h-14 items-center justify-between border-b border-border/60 px-4">
              <span className="font-medium text-foreground">{t("layout.sidebar")}</span>
              <button type="button" aria-label={t("navigation.close")} onClick={() => setMobileDrawerOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="border-b border-border/60 px-4 py-3"><FeedHealthPill /></div>
            <SidebarNavigation collapsed={false} drawer onNavigate={() => setMobileDrawerOpen(false)} />
          </aside>
        </div>
      )}
    </div>
    </FeedHealthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Language switcher — dropdown listing every language registered in
// src/i18n/index.ts. Persists the choice via i18next's localStorage detector
// and emits the `languageChanged` event handled in the i18n module to flip
// <html dir/lang> for RTL languages.
//
// Positioning: the menu uses `position: fixed` and is placed at
// `(triggerLeft, triggerTop - gap)`. This bypasses every ancestor's
// `overflow: hidden/auto/scroll`, stacking contexts, and CSS direction
// rules, so the dropdown is *always* fully visible regardless of where
// the trigger sits in the layout or which language is active. We measure
// the trigger with getBoundingClientRect() and update on resize/scroll.
// ---------------------------------------------------------------------------
function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{ left: number; bottom: number; minWidth: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent | TouchEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest?.("[data-lang-menu]")
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("touchstart", onClick, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("touchstart", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Recompute the menu's fixed coordinates whenever it opens, or whenever
  // the viewport changes (resize / scroll / language switch). The menu is
  // anchored to the trigger's *left edge* and sits *above* the trigger.
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      // Anchor: align the menu's right edge with the trigger's right edge,
      // then clamp to the viewport so the menu never overflows the screen.
      const menuWidth = 160; // px — approx longest label "العربية" + padding
      const gap = 4; // mb-1
      const desiredLeft = r.right - menuWidth;
      const maxLeft = window.innerWidth - menuWidth - 8;
      const minLeft = 8;
      const left = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
      setMenuStyle({
        left,
        // distance from viewport bottom: viewport height − trigger top + gap
        bottom: window.innerHeight - r.top + gap,
        minWidth: menuWidth,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // i18n.language (singular) is the primary active language. We try an exact
  // match first against SUPPORTED_LANGUAGES. If that fails (e.g. a regional
  // variant like "ja-JP"), we fall back to i18n.languages (plural) which
  // includes both the detected and resolved codes. NOTE: i18n.languages
  // always contains the fallback language ("en"), so it must NOT be the
  // primary match — otherwise "en" being first in SUPPORTED_LANGUAGES
  // would always win and the switcher would never show any other language.
  const current =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ??
    SUPPORTED_LANGUAGES.find((l) => i18n.languages?.includes(l.code)) ??
    SUPPORTED_LANGUAGES[0];

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("layout.language")}
        className="flex items-center gap-1 p-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors max-md:justify-center"
      >
        <Languages className="h-3.5 w-3.5 shrink-0" />
        {!compact && <span className="whitespace-nowrap max-md:hidden">{current.label}</span>}
        {!compact && <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform max-md:hidden", open && "rotate-180")} />}
      </button>
      {open && menuStyle && (
        <ul
          data-lang-menu
          aria-label="Select language"
          style={{
            position: "fixed",
            left: menuStyle.left,
            bottom: menuStyle.bottom,
            minWidth: menuStyle.minWidth,
            zIndex: 60,
          }}
          className="rounded-md border border-border/60 bg-popover shadow-lg ring-1 ring-black/5"
        >
          {SUPPORTED_LANGUAGES.map((lang) => {
            const active = lang.code === current.code;
            return (
              <li key={lang.code}>
                <button
                  type="button"
                  onClick={() => {
                    i18n.changeLanguage(lang.code).catch(console.error);
                    setOpen(false);
                  }}
                  aria-current={active || undefined}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted hover:text-foreground transition-colors",
                    active && "text-foreground",
                  )}
                >
                  <span className="flex-1 text-start whitespace-nowrap">{lang.label}</span>
                  {active && <Check className="h-3 w-3 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
