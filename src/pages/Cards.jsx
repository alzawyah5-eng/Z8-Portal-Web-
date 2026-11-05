import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, Plus, Search, RefreshCw, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CardTile from "@/components/cards/CardTile";
import IssueCardDialog from "@/components/cards/IssueCardDialog";
import CardRequestsQueue from "@/components/cards/CardRequestsQueue";
import AccountStrip from "@/components/funds/AccountStrip";
import useClientAccount from "@/components/funds/useClientAccount";
import { usd } from "@/lib/funds";
import { cn } from "@/lib/utils";

const FILTERS = ["all", "active", "frozen", "pending", "cancelled"];

// A client without cards yet: the three steps to their first one.
function FirstCardSteps({ account }) {
  const { verified, wallet, min, state, latest } = account;
  const first = state?.ladder?.[0];
  const start = first?.from || 250;
  const funded = Boolean(state?.tier) && (Number(wallet?.available) || 0) + (Number(wallet?.held) || 0) >= min;
  const requested = Boolean(state?.waiting_approval || latest?.status === "pending" || /being created/i.test(state?.reason || ""));
  const steps = [
    { title: "Verify your identity", text: "About five minutes, with your passport or ID.", done: verified },
    { title: "Add funds to your account", text: `By bank transfer or cash. Your first card (${first?.name || "Emerald"}) needs ${usd(start)} deposited in total.`, done: verified && funded },
    { title: "Request your card", text: "Choose how much to put on it. We approve it and it's ready to use.", done: requested },
  ];
  const current = steps.findIndex((step) => !step.done);
  return (
    <div className="surface px-6 py-10">
      <div className="mx-auto max-w-md">
        <span className="empty-icon mx-0"><CreditCard className="h-6 w-6" strokeWidth={1.5} /></span>
        <h2 className="font-display text-xl">Your first card in three steps</h2>
        <ol className="mt-6 space-y-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", step.done ? "border-emerald-600 bg-emerald-600 text-white" : index === current ? "border-primary text-primary" : "border-border text-muted-foreground")}>
                {step.done ? "✓" : index + 1}
              </span>
              <div>
                <p className={cn("text-sm font-semibold", !step.done && index !== current && "text-muted-foreground")}>{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        {current >= 0 && <p className="mt-6 text-xs text-muted-foreground">{current === 0 ? "Start with “Verify now” above." : current === 1 ? "Tap “Add funds” above." : "Tap “Request a card” above."}</p>}
      </div>
    </div>
  );
}

export default function Cards() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [params, setParams] = useSearchParams();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [total, setTotal] = useState(0);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  // Client account: balance, verification and card request, for the account bar.
  const account = useClientAccount({ enabled: !admin });

  useEffect(() => {
    if (admin && params.get("new") === "1") setIssuing(true);
  }, [admin, params]);

  const onIssueChange = (open) => {
    setIssuing(open && admin);
    if (!open && params.has("new")) {
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next, { replace: true });
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      const query = { form_factor: "virtual_card" };
      if (status !== "all") query.status = status;
      if (search.trim()) query.nickname = { $regex: search.trim() };
      try {
        const [page, count] = await Promise.all([
          base44.entities.Card.filter(query, { sort: "-created_date", limit: 24 }),
          base44.entities.Card.count(query),
        ]);
        if (!active) return;
        setCards(page.items || []);
        setTotal(count);
      } catch {
        if (active) setError("We couldn't load your cards. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, status, retry]);

  const filtered = Boolean(search.trim()) || status !== "all";
  return (
    <div className="space-y-6">
      <header className="page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{admin ? "Card workspace" : "Your wallet"}</p>
          <h1 className="font-display">{admin ? "All your cards" : "Your cards"}</h1>
          <p className="mt-2 text-muted-foreground">{admin ? "Create, organise, and manage cards with a little more ease." : "Check balances, view details, and stay in control."}</p>
        </div>
        {admin && <Button onClick={() => onIssueChange(true)} className="self-start sm:self-center"><Plus className="h-4 w-4" /> Create a card</Button>}
      </header>

      {admin && <CardRequestsQueue onChanged={() => setTimeout(() => setRetry((value) => value + 1), 1500)} />}
      {!admin && <AccountStrip account={account} onChanged={() => setTimeout(() => setRetry((value) => value + 1), 1500)} />}

      <div className="filter-bar">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by card status">
          {FILTERS.map((filter) => <button key={filter} type="button" onClick={() => setStatus(filter)} aria-pressed={status === filter} className={cn("filter-tab", status === filter ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{filter === "all" ? "All cards" : filter}</button>)}
        </div>
        <div className="relative shrink-0 sm:w-52 xl:w-64">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search cards by name" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a card…" className="pl-10" />
        </div>
      </div>

      {error ? <div role="alert" className="surface px-6 py-12 text-center"><p className="text-sm text-destructive">{error}</p><Button variant="outline" className="mt-5" onClick={() => setRetry((value) => value + 1)}><RefreshCw className="h-4 w-4" /> Try again</Button></div> : loading ? (
        <div role="status" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading cards">{[0, 1, 2].map((key) => <div key={key} className="h-[310px] animate-pulse rounded-[22px] bg-muted" />)}</div>
      ) : cards.length ? (
        <><p className="text-xs text-muted-foreground">{total} card{total === 1 ? "" : "s"}{filtered ? " in this view" : " in your workspace"}</p><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{cards.map((card) => <CardTile key={card.id} card={card} />)}</div></>
      ) : !admin && !filtered ? (
        <FirstCardSteps account={account} />
      ) : (
        <div className="surface px-6 py-14 text-center">
          <span className="empty-icon">{filtered ? <Search className="h-6 w-6" /> : <CreditCard className="h-6 w-6" strokeWidth={1.5} />}</span>
          <h2 className="font-display text-xl">{filtered ? "No cards found this time" : admin ? "Let's make your first card" : "Your cards will be here soon"}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{filtered ? "Try another name or clear your filters to see all cards." : admin ? "Choose a card, add a cardholder, and set the limits that work for them." : "Once your identity is verified, request your card above."}</p>
          {filtered ? <Button variant="outline" className="mt-6" onClick={() => { setSearch(""); setStatus("all"); }}><X className="h-4 w-4" /> Clear filters</Button> : admin ? <Button className="mt-6" onClick={() => onIssueChange(true)}><Plus className="h-4 w-4" /> Create your first card</Button> : <p className="mt-5 break-all text-xs font-medium text-primary">{user?.email}</p>}
        </div>
      )}
      {admin && <IssueCardDialog open={issuing} onOpenChange={onIssueChange} />}
    </div>
  );
}