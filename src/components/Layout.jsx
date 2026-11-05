import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, BadgeCheck, Bot, ChevronLeft, ChevronRight, CreditCard, LayoutGrid, LifeBuoy, Loader2, LogOut, Plus, ReceiptText, Settings2, Sparkles, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { initials } from "@/lib/format";
import { requestScrollRestore, tabFor } from "@/lib/tabStack";
import { useTabStack } from "@/lib/TabStackContext";
import usePullToRefresh, { PULL_THRESHOLD } from "@/hooks/usePullToRefresh";
import Brand from "@/components/Brand";
import VerifyPrompt from "@/components/VerifyPrompt";
import NotificationBell from "@/components/NotificationBell";
import PageTransition from "@/components/PageTransition";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", root: "/", label: "Overview", short: "Home", icon: LayoutGrid, end: true },
  { to: "/cards", root: "/cards", label: "Cards", short: "Cards", icon: CreditCard },
  { to: "/assistant", root: "/assistant", label: "Card assistant", short: "Assistant", icon: Bot },
  { to: "/cardholders", root: "/cardholders", label: "Cardholders", short: "People", icon: Users },
  // Administrators only: client deposits and balances.
  { to: "/admin/funds", root: "/admin/funds", label: "Client funds", short: "Funds", icon: Wallet },
  { to: "/activity", root: "/activity", label: "Activity", short: "Activity", icon: ReceiptText },
  { to: "/admin/connections", root: "/admin/connections", label: "Connection & API", short: "Settings", icon: Settings2 },
  { to: "/admin/support", root: "/admin/support", label: "Technical support", short: "Support", icon: LifeBuoy, desktopOnly: true },
];

// Screens that are a tab's home, where the header shows the brand instead of a back button.
const ROOT_PATHS = ["/", "/admin", "/cards", "/assistant", "/cardholders", "/activity", "/admin/funds", "/admin/connections", "/admin/support", "/settings"];

function MobileNav({ items }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { topFor, resetTab } = useTabStack();
  const activeRoot = tabFor(pathname);
  const tabs = items.filter((item) => !item.desktopOnly);

  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-40 rounded-t-[22px] border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_-16px_rgba(50,30,50,0.25)] backdrop-blur md:hidden">
      <div className="grid px-2 py-2" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(({ icon: Icon, ...item }) => {
          const active = item.root === activeRoot;
          // Coming back to a tab returns to the screen it was left on.
          const remembered = active ? null : topFor(item.root);
          const target = active ? item.to : remembered || item.to;
          return (
            <Link
              key={item.root}
              to={target}
              replace
              aria-current={active ? "page" : undefined}
              onClick={(event) => {
                if (active) {
                  // Re-tapping the current tab pops it back to its root.
                  event.preventDefault();
                  resetTab(item.root, item.to);
                  if (pathname !== item.to) navigate(item.to, { replace: true });
                  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
                  return;
                }
                if (target !== item.to) requestScrollRestore(target);
              }}
              className={cn("flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-2xl text-[11px] font-medium transition-colors", active ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted")}
            >
              <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
              {item.short}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pull, refreshing } = usePullToRefresh(() => queryClient.invalidateQueries());
  const { depthFor } = useTabStack();
  const admin = user?.role === "admin";
  const items = (admin
    ? NAV
    : NAV.filter((item) => !["/cardholders", "/admin/funds", "/admin/connections", "/admin/support"].includes(item.to))).map((item) => item.to === "/" && admin ? { ...item, to: "/admin" } : item);
  const current = items.find((item) => item.end ? pathname === item.to : pathname.startsWith(item.to))
    || (pathname.startsWith("/verification") ? { label: "Identity verification" } : pathname.startsWith("/account") ? { label: "Your account" } : null);
  const name = user?.full_name || "Your account";

  // Mobile header shows a native-style back control on any screen below a tab root.
  const activeRoot = tabFor(pathname);
  const tabHome = items.find((item) => item.root === activeRoot)?.to || "/";
  const showBack = !ROOT_PATHS.includes(pathname);
  const goBack = () => {
    if (depthFor(activeRoot) > 1) navigate(-1);
    else navigate(tabHome, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-card focus:px-5 focus:py-3">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-border bg-card md:flex">
        <Link to="/" aria-label="Z8 Cards home" className="mx-6 mb-10 mt-8 w-fit"><Brand /></Link>
        <p className="mb-3 px-7 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{admin ? "Admin workspace" : "Your workspace"}</p>
        <nav aria-label="Main navigation" className="space-y-1.5 px-4">
          {items.map(({ icon: Icon, ...item }) => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => cn("flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-medium transition-colors", isActive ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {({ isActive }) => <><Icon className="h-[19px] w-[19px]" strokeWidth={isActive ? 2 : 1.7} aria-hidden="true" /><span className="flex-1">{item.label}</span>{isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}</>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-4 pb-5 pt-8">
          <div className="rounded-[20px] bg-secondary p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-card text-primary"><Sparkles className="h-[18px] w-[18px]" aria-hidden="true" /></span>
            <p className="mt-3 text-sm font-semibold">{admin ? "Ready for your next card?" : "Your cards. Your control."}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{admin ? "Choose a card, add its holder, and you\u0027re on your way." : "Check balances, view payments, and manage your cards in one place."}</p>
            <Link to={admin ? "/cards?new=1" : "/cards"} className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-primary">{admin ? "Create a card" : "Open your cards"} <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
        <div className="border-t border-border px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-xs font-semibold text-accent-foreground">{initials(user?.full_name || user?.email) || "Z8"}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{name}</div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{user?.email || "Card workspace"}</div>
            </div>
            <button type="button" onClick={() => logout()} aria-label="Sign out" title="Sign out" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"><LogOut className="h-4 w-4" /></button>
          </div>
          {!admin && (
            <div className="mt-3 space-y-0.5">
              <Link to="/account" className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-primary">
                <Wallet className="h-4 w-4" aria-hidden="true" /> Your account
              </Link>
              <Link to="/verification" className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-primary">
                <BadgeCheck className="h-4 w-4" aria-hidden="true" /> Identity verification
              </Link>
            </div>
          )}
        </div>
      </aside>

      <div className="md:pl-[248px]">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+80px)] z-20 flex justify-center md:hidden"
          style={{
            opacity: pull > 0 ? 1 : 0,
            transition: pull > 0 ? "none" : "opacity 150ms ease-out",
            transform: `translateY(${Math.max(pull - 44, -24)}px)`,
          }}
        >
          <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm">
            <Loader2
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
              style={refreshing ? undefined : { transform: `rotate(${Math.min(pull, PULL_THRESHOLD) * 4}deg)` }}
            />
            {refreshing ? "Refreshing…" : pull >= PULL_THRESHOLD ? "Release to refresh" : "Pull to refresh"}
          </span>
        </div>
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div className="flex min-h-[76px] items-center justify-between gap-3 px-4 sm:px-7 lg:px-10">
            {showBack ? (
              <button
                type="button"
                onClick={goBack}
                aria-label="Back"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-foreground transition-colors active:bg-secondary md:hidden"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : (
              <Link to="/" aria-label="Z8 Cards home" className="md:hidden"><Brand compact /></Link>
            )}
            <div className="hidden items-center gap-2 text-[13px] md:flex">
              <span className="text-muted-foreground">{admin ? "Admin workspace" : "User workspace"}</span><ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" /><span className="font-medium">{current?.label || "Card details"}</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <span className={cn("rounded-full bg-secondary px-3 py-1.5 text-[11px] font-semibold text-primary", !admin && "hidden sm:inline-flex")}>{admin ? "Admin" : "Personal account"}</span>
              {admin && <Button asChild size="sm" className="h-11 rounded-xl sm:h-10"><Link to="/cards?new=1"><Plus className="h-4 w-4" aria-hidden="true" /> New card</Link></Button>}
              {!admin && user?.email && <NotificationBell email={user.email} />}
              <details className="relative md:hidden">
                <summary aria-label="Your account" className="flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-2xl bg-accent text-xs font-semibold text-accent-foreground [&::-webkit-details-marker]:hidden">{initials(user?.full_name || user?.email) || "Z8"}</summary>
                <div className="absolute right-0 mt-3 w-56 rounded-2xl border border-border bg-card p-4 shadow-xl">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{user?.email}</p>
                  {!admin && (
                    <>
                      <Link to="/account" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")} className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm hover:bg-secondary">
                        <Wallet className="h-4 w-4" aria-hidden="true" /> Your account
                      </Link>
                      <Link to="/verification" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm hover:bg-secondary">
                        <BadgeCheck className="h-4 w-4" aria-hidden="true" /> Identity verification
                      </Link>
                    </>
                  )}
                  <button type="button" onClick={() => logout()} className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm hover:bg-secondary"><LogOut className="h-4 w-4" aria-hidden="true" /> Sign out</button>
                </div>
              </details>
            </div>
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1400px] pb-28 pl-[max(env(safe-area-inset-left),1rem)] pr-[max(env(safe-area-inset-right),1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] [overscroll-behavior-y:none] sm:pl-7 sm:pr-7 md:pb-12 lg:pl-10 lg:pr-10 lg:pt-9"
        >
          <PageTransition />
        </main>
      </div>
      <MobileNav items={items} />
      <VerifyPrompt />
    </div>
  );
}