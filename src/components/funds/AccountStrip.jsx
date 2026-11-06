import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Clock, CreditCard, Loader2, Plus, ShieldCheck, XCircle } from "lucide-react";
import { z8 } from "@/api/z8Client";
import { Button } from "@/components/ui/button";
import AddFundsDialog from "@/components/funds/AddFundsDialog";
import RequestCardDialog from "@/components/cards/RequestCardDialog";
import { usd } from "@/lib/funds";
import { tierInfo } from "@/lib/tiers";

// One slim bar above the client's cards: their available balance and the two
// things they can do with it. Details live in dialogs and on Your account.
export default function AccountStrip({ account, onChanged }) {
  const { loading, wallet, state, latest, application, verified, min, reload } = account;
  const [funding, setFunding] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => { await reload(); onChanged?.(); };

  const cancelRequest = async () => {
    if (!latest?.id) return;
    setCancelling(true); setError("");
    try {
      const response = await z8.functions.invoke("photonpayCards", { action: "cancel_card_request", payload: { requestId: latest.id } });
      if (response.data?.error) throw new Error(response.data.error);
      await refresh();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "The request could not be cancelled.");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="h-[88px] animate-pulse rounded-[22px] bg-muted" aria-label="Loading your account" />;
  if (!state) return null;

  if (!verified) {
    const inReview = ["submitted", "approved"].includes(application?.status);
    return (
      <section className="surface flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {inReview ? <Clock className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /> : <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
          <p className="text-sm"><span className="font-semibold">{inReview ? "Your verification is in review." : "Verify your identity to get a card."}</span> <span className="text-muted-foreground">{inReview ? "We'll let you add funds and request a card once it's approved." : "It takes about five minutes."}</span></p>
        </div>
        {!inReview && <Button asChild size="sm" className="self-start sm:self-center"><Link to="/verification">{application?.status === "rejected" ? "Review my details" : "Verify now"}</Link></Button>}
      </section>
    );
  }

  const available = Number(wallet?.available ?? state.available) || 0;
  const held = Number(wallet?.held) || 0;
  const waiting = state.waiting_approval && latest?.status === "pending";
  const creating = /being created/i.test(state.reason || "");
  const canAsk = !waiting && !creating && (state.can_request || state.needs_funds);
  const tier = tierInfo(state.tier);
  const nextTier = state.next_tier;
  const pendingDeposits = (wallet?.entries || []).filter((entry) => entry.kind === "deposit" && entry.status === "pending").length;

  const notes = [];
  if (waiting) notes.push({ icon: Clock, text: <>Card request for <span className="num font-semibold text-foreground">{usd(latest.amount)}</span> is waiting for approval.</>, action: <button type="button" data-compact onClick={cancelRequest} disabled={cancelling} className="font-medium text-primary hover:underline disabled:opacity-60">{cancelling ? <Loader2 className="inline h-3 w-3 animate-spin" aria-hidden="true" /> : "Cancel"}</button> });
  else if (creating) notes.push({ icon: Clock, text: "Your card is being created. It appears below as soon as it's ready." });
  else if (latest?.status === "rejected") notes.push({ icon: XCircle, tone: "text-destructive", text: <>Your last card request wasn't approved{latest.review_note ? `: ${latest.review_note}` : "."}</> });
  if (pendingDeposits) notes.push({ icon: Clock, text: `${pendingDeposits} deposit${pendingDeposits === 1 ? "" : "s"} waiting for us to confirm.` });
  if (!state.tier && nextTier) notes.push({ icon: Plus, text: <>Deposit <span className="num font-semibold text-foreground">{usd(nextTier.remaining)}</span> more to unlock your first card, <span className="font-semibold text-foreground">{nextTier.name}</span>.</> });
  else if (state.needs_funds && !waiting && !creating) notes.push({ icon: Plus, text: <>Add at least <span className="num font-semibold text-foreground">{usd(Math.max(0, min - available))}</span> to request a card.</> });
  else if (state.tier && nextTier) notes.push({ icon: CreditCard, text: <>Deposit <span className="num font-semibold text-foreground">{usd(nextTier.remaining)}</span> more to unlock the <span className="font-semibold text-foreground">{nextTier.name}</span> card.</> });

  return (
    <section className="surface overflow-hidden" aria-label="Your account">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/account" className="group flex min-w-0 items-center gap-3 rounded-xl">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
              Available balance
              {tier && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: tier.gradient }}>{tier.name} tier</span>}
            </div>
            <div className="num text-2xl font-semibold tracking-tight">{usd(available)}</div>
            {held > 0 && <div className="text-xs text-muted-foreground">{usd(held)} set aside for your card request</div>}
          </div>
          <span className="ml-1 flex items-center text-xs font-medium text-primary">Your account <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
        </Link>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button type="button" variant="outline" onClick={() => setFunding(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Add funds</Button>
          {canAsk && <Button type="button" onClick={() => setRequesting(true)}><CreditCard className="h-4 w-4" aria-hidden="true" /> Request a card</Button>}
        </div>
      </div>

      {(notes.length > 0 || error) && (
        <ul className="space-y-1.5 border-t border-border bg-muted/30 px-5 py-3 text-xs text-muted-foreground">
          {notes.map(({ icon: Icon, text, action, tone }, index) => (
            <li key={index} className="flex items-start gap-2">
              <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone || "text-primary"}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">{text}</span>
              {action}
            </li>
          ))}
          {error && <li role="alert" className="text-destructive">{error}</li>}
        </ul>
      )}

      <AddFundsDialog open={funding} onOpenChange={setFunding} instructions={wallet?.funding_instructions || ""} min={min} onReported={refresh} />
      <RequestCardDialog
        open={requesting}
        onOpenChange={setRequesting}
        available={available}
        min={min}
        standing={state}
        onRequested={refresh}
        onAddFunds={() => setFunding(true)}
      />
    </section>
  );
}
