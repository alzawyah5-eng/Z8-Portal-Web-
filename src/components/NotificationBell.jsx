import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, BadgeCheck, Bell, CheckCheck, CreditCard, Loader2, Receipt, Wallet } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

const POLL_MS = 60_000;
const KIND_ICONS = { verification: BadgeCheck, funds: Wallet, card_request: CreditCard, card: CreditCard, payment: Receipt };

const toDate = (value) => new Date(/Z|[+-]\d\d:?\d\d$/.test(value || "") ? value : `${value}Z`);

function timeAgo(value) {
  const seconds = Math.max(0, (Date.now() - toDate(value).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} d ago`;
  return toDate(value).toLocaleDateString([], { day: "numeric", month: "short" });
}

// The client's bell: unread count, the latest notifications, mark as read.
export default function NotificationBell({ email }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const wrap = useRef(null);

  const load = useCallback(async () => {
    if (!email) return;
    try {
      const page = await base44.entities.Notification.filter({ owner_email: String(email).toLowerCase() }, { sort: "-created_date", limit: 30 });
      setItems(Array.isArray(page) ? page : page?.items || []);
    } catch {
      /* keep what we have; the next poll retries */
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    const onFocus = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onFocus); window.removeEventListener("focus", onFocus); };
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (wrap.current && !wrap.current.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const unread = items.filter((item) => !item.read).length;

  const markRead = async (ids) => {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => (ids.includes(item.id) ? { ...item, read: true, read_at: now } : item)));
    await Promise.all(ids.map((id) => base44.entities.Notification.update(id, { read: true, read_at: now }).catch(() => null)));
  };

  const openItem = async (item) => {
    setOpen(false);
    if (!item.read) markRead([item.id]);
    if (item.link) navigate(item.link);
  };

  const markAll = async () => {
    setMarking(true);
    await markRead(items.filter((item) => !item.read).map((item) => item.id));
    setMarking(false);
  };

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((value) => !value); if (!open) load(); }}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card text-foreground transition-colors hover:bg-secondary md:h-10 md:w-10"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+84px)] z-50 flex max-h-[min(70dvh,560px)] flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-2xl md:absolute md:inset-x-auto md:right-0 md:top-12 md:w-[380px]"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-display text-base">Notifications</h2>
            {unread > 0 && (
              <button type="button" data-compact onClick={markAll} disabled={marking} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-primary hover:bg-secondary disabled:opacity-60">
                {marking ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />} Mark all as read
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && !items.length ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</div>
            ) : !items.length ? (
              <div className="px-6 py-12 text-center">
                <Bell className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium">No notifications yet</p>
                <p className="mt-1 text-xs text-muted-foreground">We'll let you know about your verification, deposits and cards here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => {
                  const Icon = item.tone === "warning" ? AlertTriangle : KIND_ICONS[item.kind] || Bell;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        data-compact
                        onClick={() => openItem(item)}
                        className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50", !item.read && "bg-primary/[0.04]")}
                      >
                        <span className={cn(
                          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                          item.tone === "warning" ? "bg-amber-500/10 text-amber-700" : item.tone === "success" ? "bg-emerald-500/10 text-emerald-700" : "bg-primary/10 text-primary",
                        )}>
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className={cn("text-sm leading-snug", item.read ? "font-medium text-foreground/85" : "font-semibold")}>{item.title}</span>
                            {!item.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                          </span>
                          {item.body && <span className="mt-0.5 block break-words text-xs leading-relaxed text-muted-foreground">{item.body}</span>}
                          <span className="mt-1 block text-[11px] text-muted-foreground/80">{timeAgo(item.created_date)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
