import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CheckCircle2, CreditCard, Loader2, Plus, ReceiptText, RefreshCw, Users, Wallet } from "lucide-react";
import { z8 } from "@/api/z8Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import CardTile from "@/components/cards/CardTile";
import StatusPill from "@/components/StatusPill";
import { formatMoney, formatNumber, formatDateTime, formatDate } from "@/lib/format";

function Stat({ icon: Icon, label, value, note, tone, loading }) {
  return (
    <div className="surface flex min-w-0 items-center gap-4 p-5">
      <span aria-hidden="true" className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl " + tone}><Icon className="h-5 w-5" strokeWidth={1.8} /></span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 truncate font-display text-2xl leading-tight">{loading ? "—" : value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
      </div>
    </div>
  );
}

async function usdTotals() {
  let balance = 0;
  let spend = 0;
  let cursor;
  for (let page = 0; page < 10; page += 1) {
    const result = await z8.entities.Card.filter({ currency: "USD", form_factor: "virtual_card" }, { limit: 200, cursor });
    (result.items || []).forEach((card) => {
      balance += card.balance || 0;
      spend += card.monthly_spend || 0;
    });
    if (!result.has_more) break;
    cursor = result.next_cursor;
  }
  return { balance, spend };
}

export default function Dashboard() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const firstName = user?.full_name?.trim().split(" ")[0];
  const [cards, setCards] = useState([]);
  const [activity, setActivity] = useState([]);
  const [stats, setStats] = useState({ cards: 0, active: 0, float: 0, spend: 0, pending: 0 });
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const [cardPage, txPage, cardCount, activeCount, pendingCount, usd] = await Promise.all([
          z8.entities.Card.filter({ form_factor: "virtual_card" }, { sort: "-created_date", limit: 3 }),
          z8.entities.CardTransaction.filter({}, { sort: "-occurred_at", limit: 6 }),
          z8.entities.Card.count({ form_factor: "virtual_card" }),
          z8.entities.Card.count({ status: "active", form_factor: "virtual_card" }),
          z8.entities.Card.count({ status: "pending", form_factor: "virtual_card" }),
          usdTotals(),
        ]);
        if (!active) return;
        setCards(cardPage.items || []);
        setActivity(txPage.items || []);
        setStats({
          cards: cardCount || 0,
          active: activeCount,
          float: usd.balance,
          spend: usd.spend,
          pending: pendingCount,
        });
      } catch {
        if (active) setError("We couldn't load your overview. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    if (admin) z8.functions.invoke("photonpayCards", { action: "status" })
      .then((response) => { if (active) setConnection(response.data); })
      .catch(() => { if (active) setConnection({ connected: false }); });
    return () => { active = false; };
  }, [retry, admin]);

  return (
    <div className="space-y-7">
      <header className="page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{formatDate(new Date(), { weekday: "long" })}</p>
          <h1 className="font-display">{firstName ? `Welcome back, ${firstName}.` : "Welcome to your card space."}</h1>
          <p className="mt-2 text-muted-foreground">Your cards, balances, and everyday activity. All together.</p>
        </div>
        {admin && <Button asChild className="self-start sm:self-center"><Link to="/cards?new=1"><Plus className="h-4 w-4" /> Create a card</Link></Button>}
      </header>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-3 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}><RefreshCw className="h-4 w-4" /> Try again</Button></div>}

      <section aria-label="Card overview" className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="ink-panel relative flex min-h-[268px] flex-col justify-between overflow-hidden rounded-[24px] p-6 text-white sm:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-80 w-80 rounded-full border-[40px] border-white/5" />
          <div className="relative flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm text-white/85"><Wallet className="h-[18px] w-[18px]" /> Total card balance</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">USD</span>
          </div>
          <div className="relative py-6">
            <p className="font-display text-[38px] leading-none tracking-tight sm:text-[46px]">{loading || error ? "—" : formatMoney(stats.float, "USD")}</p>
            <p className="mt-3 text-xs text-white/70">Available across your USD cards</p>
          </div>
          <Link to="/cards" className="relative flex min-h-11 items-center justify-between gap-3 border-t border-white/15 pt-4 text-[13px] font-medium text-white/90 sm:min-h-10">View and manage your cards <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15"><ArrowUpRight className="h-4 w-4" /></span></Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <Stat icon={CreditCard} label={admin ? "Cards issued" : "Your cards"} value={formatNumber(stats.cards)} note={`${stats.pending} pending activation`} tone="bg-secondary text-primary" loading={loading || Boolean(error)} />
          <Stat icon={CheckCircle2} label="Active cards" value={formatNumber(stats.active)} note="Ready to use" tone="bg-accent text-accent-foreground" loading={loading || Boolean(error)} />
          <Stat icon={ArrowUpRight} label="Spent this month" value={formatMoney(stats.spend, "USD")} note="USD card spending" tone="bg-blue-50 text-blue-700" loading={loading || Boolean(error)} />
        </div>
      </section>

      <section aria-label="Quick actions" className={admin ? "grid gap-3 sm:grid-cols-3" : "grid gap-3 sm:grid-cols-2"}>
        {(admin ? [
          { to: "/cards?new=1", title: "Create a card", note: "Set up in a few steps", icon: Plus },
          { to: "/cardholders", title: "Cardholders", note: "The people behind your cards", icon: Users },
          { to: "/activity", title: "View activity", note: "Keep track of every transaction", icon: ReceiptText },
        ] : [
          { to: "/cards", title: "Your cards", note: "Balances and controls in one place", icon: CreditCard },
          { to: "/activity", title: "Your activity", note: "Follow your payments and refunds", icon: ReceiptText },
        ]).map(({ to, title, note, icon: Icon }) => <Link key={to} to={to} className="surface group flex min-h-[72px] items-center gap-3.5 p-4 transition-colors hover:border-primary/25"><span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><Icon className="h-[18px] w-[18px]" /></span><div className="min-w-0 flex-1"><p className="text-[13px] font-semibold">{title}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{note}</p></div><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" /></Link>)}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="font-display text-xl">Your latest cards</h2><p className="mt-1 text-xs text-muted-foreground">A little overview of what's in your wallet.</p></div>
          <Link to="/cards" className="text-link shrink-0">View all <ArrowRight className="h-4 w-4" /></Link>
        </div>
        {loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading cards">{[0, 1, 2].map((key) => <div key={key} className="h-64 animate-pulse rounded-[22px] bg-muted" />)}</div> : error ? <div className="surface p-6 text-sm text-muted-foreground">Your cards will appear here once the overview loads.</div> : cards.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map((card) => <CardTile key={card.id} card={card} />)}</div>
        ) : (
          <div className="surface flex flex-col items-center gap-5 px-6 py-8 text-center sm:flex-row sm:text-left">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-secondary text-primary"><CreditCard className="h-7 w-7" strokeWidth={1.5} /></span>
            <div className="flex-1"><h3 className="font-display text-lg">{admin ? "Your first card starts here" : "Your cards will be here soon"}</h3><p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">{admin ? "Create a virtual card for an approved client and choose its limits. We\u0027ll guide you through it." : "Your administrator can assign a card to the email you use for this account."}</p></div>
            {admin && <Button asChild variant="outline"><Link to="/cards?new=1">Let's get started <ArrowRight className="h-4 w-4" /></Link></Button>}
          </div>
        )}
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="surface overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6"><h2 className="font-display text-lg">Recent activity</h2><Link to="/activity" className="text-link">View all <ArrowRight className="h-4 w-4" /></Link></div>
          {loading ? <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading activity</div> : activity.length ? (
            <ul className="divide-y divide-border">{activity.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6"><span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground sm:flex">{item.kind === "refund" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.merchant || item.event || "Card event"}</p><p className="mt-1 text-xs text-muted-foreground">{item.card_nickname || "Card"} · {formatDateTime(item.occurred_at)}</p></div><div className="shrink-0 text-right"><p className="num text-sm font-semibold">{item.amount ? formatMoney(item.amount, item.currency) : "—"}</p><div className="mt-1.5"><StatusPill status={item.status} /></div></div></li>)}</ul>
          ) : <div className="px-6 py-9 text-center"><span className="empty-icon"><ReceiptText className="h-6 w-6" /></span><h3 className="text-sm font-semibold">{error ? "Activity is unavailable" : "A fresh start"}</h3><p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">{error ? "Please try loading your overview again." : "Payments, refunds, and card updates will appear here as you go."}</p></div>}
        </div>

        {admin ? <div className="surface p-6">
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground"><CreditCard className="h-5 w-5" /></span>
          <h2 className="font-display text-lg">Card connection</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{connection === null ? "Checking your card connection…" : connection.connected ? "Your card provider is connected. Manage your cards from one place." : "Connect your card provider to start issuing and managing cards."}</p>
          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-muted/65 px-3.5 py-3 text-xs"><span className="font-medium">PhotonPay</span><span className={connection?.connected ? "font-medium text-emerald-700" : "text-muted-foreground"}>{connection === null ? "Checking…" : connection.connected ? "Connected" : "Setup needed"}</span></div>
          <Link to="/admin/connections" className="text-link mt-3">{connection?.connected ? "Connection details" : "Open connection settings"} <ArrowRight className="h-4 w-4" /></Link>
        </div> : <div className="surface p-6">
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground"><Wallet className="h-5 w-5" /></span>
          <h2 className="font-display text-lg">Made for your everyday</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Your assigned cards and payments are together here. Open a card to see its details and manage its controls.</p>
          <p className="mt-5 break-all rounded-xl bg-muted/65 px-3.5 py-3 text-xs text-muted-foreground">{user?.email}</p>
          <Link to="/cards" className="text-link mt-3">Open your cards <ArrowRight className="h-4 w-4" /></Link>
        </div>}
      </section>
    </div>
  );
}
