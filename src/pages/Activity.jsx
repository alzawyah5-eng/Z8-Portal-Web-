import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ReceiptText, RefreshCw, Search, X } from "lucide-react";
import { z8 } from "@/api/z8Client";
import { useAuth } from "@/lib/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import StatusPill from "@/components/StatusPill";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const FILTERS = [
  { value: "all", label: "All activity" },
  { value: "spend", label: "Payments" },
  { value: "refund", label: "Refunds" },
  { value: "event", label: "Card updates" },
];

export default function Activity() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [items, setItems] = useState([]);
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const requestVersion = useRef(0);

  const fetchPage = useCallback(async (nextCursor, version) => {
    // User transaction reads are scoped to the authenticated account by the
    // backend. owner_email is protected and must not be sent as a public filter.
    const query = {};
    if (kind !== "all") query.kind = kind;
    if (search.trim()) query.merchant = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") };
    if (nextCursor) setLoadingMore(true);
    setError("");
    try {
      const page = await z8.entities.CardTransaction.filter(query, {
        sort: "-occurred_at", limit: 30, ...(nextCursor ? { cursor: nextCursor } : {}),
      });
      if (version !== requestVersion.current) return;
      setItems((current) => nextCursor ? [...current, ...(page.items || [])] : page.items || []);
      setCursor(page.next_cursor || null);
      setHasMore(Boolean(page.has_more));
    } catch {
      if (version === requestVersion.current) setError("We couldn't load your activity. Please try again.");
    } finally {
      if (version === requestVersion.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [kind, search]);

  useEffect(() => {
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadingMore(false);
    setItems([]);
    setError("");
    const timer = setTimeout(() => fetchPage(null, version), 220);
    return () => { clearTimeout(timer); requestVersion.current++; };
  }, [fetchPage, retry]);

  const filtered = kind !== "all" || Boolean(search.trim());

  return (
    <div className="space-y-6 overflow-x-hidden">
      <header className="page-header">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{admin ? "All card activity" : "Your payments"}</p>
        <h1 className="font-display">Activity, at a glance</h1>
        <p className="mt-2 text-muted-foreground">{admin ? "Follow payments, refunds, and card updates across your workspace." : "A clear view of payments, refunds, and updates on your cards."}</p>
      </header>

      <div className="filter-bar">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter activity">
          {FILTERS.map((filter) => (
            <button key={filter.value} type="button" onClick={() => setKind(filter.value)} aria-pressed={kind === filter.value}
              className={cn("filter-tab", kind === filter.value ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {filter.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search activity by merchant" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a merchant…" className="pl-10" />
        </div>
      </div>

      {error && <div role="alert" className="surface flex flex-wrap items-center justify-between gap-4 p-5"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}><RefreshCw className="h-4 w-4" /> Try again</Button></div>}

      {loading ? <div role="status" aria-label="Loading activity" className="h-64 animate-pulse rounded-[22px] bg-muted" /> : items.length ? (
        <div className="surface overflow-hidden">
          <div className="hidden grid-cols-[1.6fr_1fr_1fr_0.8fr_0.6fr] gap-4 border-b border-border bg-muted/40 px-5 py-4 sm:grid">
            {["Description", "Card", "Date", "Amount", "Status"].map((head) => <span key={head} className="text-xs font-medium text-muted-foreground">{head}</span>)}
          </div>
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="grid min-h-11 gap-2 px-5 py-4 sm:grid-cols-[1.6fr_1fr_1fr_0.8fr_0.6fr] sm:items-center sm:gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.merchant || item.event || "Card update"}</p>
                  <p className="mt-1 text-xs text-muted-foreground sm:hidden">{item.card_nickname || "Card"} · {formatDateTime(item.occurred_at)}</p>
                  {item.note && <p className="mt-1 hidden truncate text-xs text-muted-foreground sm:block">{item.note}</p>}
                </div>
                <div className="hidden min-w-0 sm:block"><p className="truncate text-sm">{item.card_nickname || "Card"}</p>{item.card_last4 && <p className="num mt-1 text-xs text-muted-foreground">•••• {item.card_last4}</p>}</div>
                <p className="hidden text-xs text-muted-foreground sm:block">{formatDateTime(item.occurred_at)}</p>
                <div className="flex items-center justify-between gap-3 sm:contents">
                  <p className="num text-sm font-medium sm:text-right">{item.amount ? formatMoney(item.amount, item.currency) : "—"}</p>
                  <div className="sm:text-right"><StatusPill status={item.status} /></div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : !error && (
        <div className="surface px-6 py-14 text-center">
          <span className="empty-icon">{filtered ? <Search className="h-6 w-6" /> : <ReceiptText className="h-6 w-6" />}</span>
          <h2 className="font-display text-xl">{filtered ? "Nothing matches just yet" : "Your activity starts here"}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{filtered ? "Try another merchant or clear your filters." : "Payments, refunds, and card updates will appear as you use your cards."}</p>
          {filtered && <Button variant="outline" className="mt-5" onClick={() => { setSearch(""); setKind("all"); }}><X className="h-4 w-4" /> Clear filters</Button>}
        </div>
      )}

      {!loading && hasMore && !error && <div className="flex justify-center"><Button variant="outline" disabled={loadingMore} onClick={() => fetchPage(cursor, requestVersion.current)}>{loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}{loadingMore ? "Loading…" : "Show more activity"}</Button></div>}
    </div>
  );
}
