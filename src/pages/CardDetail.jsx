import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Eye, KeyRound, Loader2, Lock, Plus, Snowflake, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import CardVisual from "@/components/cards/CardVisual";
import CardAdminTools from "@/components/cards/CardAdminTools";
import AddCreditDialog from "@/components/cards/AddCreditDialog";
import { cardTypeLabel } from "@/lib/cardTypes";
import { purposeLabel } from "@/lib/cardPurposes";
import StatusPill from "@/components/StatusPill";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-[13px]">{value || "—"}</span>
    </div>
  );
}

export default function CardDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [ownerEmail, setOwnerEmail] = useState("");
  const [card, setCard] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [addingCredit, setAddingCredit] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const requestVersion = useRef(0);

  const loadTransactions = async (version = requestVersion.current) => {
    const page = await base44.entities.CardTransaction.filter({ card_id: id }, { sort: "-occurred_at", limit: 25 });
    if (version === requestVersion.current) setTransactions(page.items || []);
  };

  useEffect(() => {
    let active = true;
    const version = ++requestVersion.current;
    setLoading(true);
    setCard(null);
    setTransactions([]);
    setNotice("");
    setBusy("");
    setMissing(false);
    setRevealed(null);
    (async () => {
      try {
        const record = await base44.entities.Card.get(id).catch((error) => {
          if ([403, 404].includes(error.status)) return null;
          throw error;
        });
        if (!active) return;
        if (!record || (record.form_factor && record.form_factor !== "virtual_card")) {
          setMissing(true);
          return;
        }
        setCard(record);
        setOwnerEmail(record.owner_email || "");
        await loadTransactions(version);
      } catch {
        if (active) setMissing(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      requestVersion.current++;
    };
  }, [id]);

  // A linked card's balance, status and CVV state come from PhotonPay each time
  // the page opens; the stored values are only the last known ones.
  const [cvvBlocked, setCvvBlocked] = useState(false);
  // An administrator revealing another account's card details must give a reason;
  // the view is recorded in the card's activity, visible to the client.
  const [reasonOpen, setReasonOpen] = useState(false);
  const [viewReason, setViewReason] = useState("");
  const linkedId = card?.photon_card_id ? card.id : "";
  useEffect(() => {
    if (!linkedId) return;
    const version = requestVersion.current;
    base44.functions.invoke("photonpayCards", { action: "refresh", payload: { recordId: linkedId } })
      .then((response) => {
        if (version !== requestVersion.current || response.data?.error) return;
        const { balance, status, transaction_limit_type: limitType, cvv_blocked: blocked } = response.data || {};
        setCvvBlocked(Boolean(blocked));
        setCard((current) => current && ({
          ...current,
          ...(balance != null ? { balance } : {}),
          ...(status ? { status } : {}),
          ...(limitType ? { transaction_limit_type: limitType } : {}),
        }));
      })
      .catch(() => {});
  }, [linkedId]);

  // Cards applied for with openCardHalo start as pending with only a request
  // ID. On opening one, ask PhotonPay whether it has been created yet.
  const awaitingProvider = Boolean(card && card.request_id && !card.photon_card_id && card.status === "pending");
  useEffect(() => {
    if (!awaitingProvider) return;
    const version = requestVersion.current;
    base44.functions.invoke("photonpayCards", { action: "resolve", payload: { recordId: card.id } })
      .then(async (response) => {
        if (version !== requestVersion.current || response.data?.error) return;
        const { state, status, last4, masked_number: maskedNumber } = response.data || {};
        if (state === "issued") {
          const record = await base44.entities.Card.get(card.id).catch(() => null);
          if (version !== requestVersion.current) return;
          setCard((current) => record || { ...current, status, last4, masked_number: maskedNumber });
          await loadTransactions(version);
          setNotice("Your card is ready to use.");
        } else if (state === "failed") {
          setCard((current) => ({ ...current, status: "cancelled" }));
          await loadTransactions(version);
          setNotice("This card application was declined.");
        } else if (state === "pending") {
          setNotice("This card is still being created. It will appear here automatically when it is ready.");
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingProvider, card?.id]);

  useEffect(() => {
    if (!revealed) return;
    if (document.hidden) { setRevealed(null); return; }
    const hide = () => setRevealed(null);
    const onVisibilityChange = () => { if (document.hidden) hide(); };
    const timer = setTimeout(hide, 30000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [revealed]);

  useEffect(() => {
    if (!missing) return;
    const meta = document.createElement("meta");
    meta.name = "prerender-status-code";
    meta.content = "404";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [missing]);

  const runControl = async (action, nextStatus, eventLabel) => {
    if (admin && !card.photon_card_id) {
      setNotice("This card record is not linked to a live PhotonPay card yet.");
      return;
    }
    const version = requestVersion.current;
    const previousStatus = card.status;
    setBusy(action);
    setNotice("");
    // Show the new state immediately; the provider response reconciles it, an error reverts it.
    setCard((current) => ({ ...current, status: nextStatus }));
    try {
      const response = await base44.functions.invoke("photonpayCards", {
        action,
        payload: { recordId: card.id },
      });
      if (response.data?.error) throw new Error(response.data.error);
      if (version !== requestVersion.current) return;
      setCard((current) => ({ ...current, status: response.data.status || nextStatus }));
      await loadTransactions(version);
      if (version === requestVersion.current) setNotice(`${eventLabel} · ${admin ? "confirmed by PhotonPay" : "confirmed"}`);
    } catch (error) {
      if (version === requestVersion.current) {
        setCard((current) => ({ ...current, status: previousStatus }));
        setNotice(error?.response?.data?.error || error.message);
      }
    } finally {
      if (version === requestVersion.current) setBusy("");
    }
  };

  const revealCard = async (reason) => {
    if (revealed) {
      setRevealed(null);
      return;
    }
    if (admin && !card.photon_card_id) {
      setNotice("Live card data is unavailable until this card is linked to PhotonPay.");
      return;
    }
    const ownsCard = Boolean(card.owner_email) && card.owner_email.toLowerCase() === String(user?.email || "").toLowerCase();
    if (admin && !ownsCard && typeof reason !== "string") {
      setViewReason("");
      setReasonOpen(true);
      return;
    }
    const version = requestVersion.current;
    setBusy("reveal");
    setNotice("");
    try {
      const response = await base44.functions.invoke("photonpayCards", {
        action: "detail",
        payload: { recordId: card.id, ...(typeof reason === "string" ? { reason } : {}) },
      });
      if (response.data?.error) throw new Error(response.data.error);
      if (version === requestVersion.current) setRevealed(response.data.card || {});
      if (typeof reason === "string") await loadTransactions(version);
    } catch (error) {
      if (version === requestVersion.current) setNotice(error?.response?.data?.error || error.message);
    } finally {
      if (version === requestVersion.current) setBusy("");
    }
  };

  // PhotonPay blocks a card's CVV after too many wrong entries at checkout.
  const unblockCvv = async () => {
    const version = requestVersion.current;
    setBusy("unblock");
    setNotice("");
    try {
      const response = await base44.functions.invoke("photonpayCards", { action: "unblock_cvv", payload: { recordId: card.id } });
      if (response.data?.error) throw new Error(response.data.error);
      if (version !== requestVersion.current) return;
      setCvvBlocked(false);
      setNotice("CVV unblocked. The card can be used for online payments again.");
      await loadTransactions(version);
    } catch (error) {
      if (version === requestVersion.current) setNotice(error?.response?.data?.error || error.message);
    } finally {
      if (version === requestVersion.current) setBusy("");
    }
  };

  const saveAccess = async () => {
    if (!admin) return;
    const version = requestVersion.current;
    setBusy("assign");
    setNotice("");
    try {
      const response = await base44.functions.invoke("photonpayCards", { action: "assign", payload: { recordId: card.id, ownerEmail } });
      if (response.data?.error) throw new Error(response.data.error);
      if (version !== requestVersion.current) return;
      setCard((current) => ({ ...current, owner_email: response.data.owner_email }));
      setOwnerEmail(response.data.owner_email || "");
      setNotice(response.data.owner_email ? "User access updated for this card and its activity." : "User access removed. This card is now visible to admins only.");
    } catch (error) {
      if (version === requestVersion.current) setNotice(error?.response?.data?.error || "We couldn't update card access. Please try again.");
    } finally { if (version === requestVersion.current) setBusy(""); }
  };

  if (loading) {
    return <div className="h-80 animate-pulse rounded-md border border-border bg-secondary/50" />;
  }

  if (missing || !card) {
    return (
      <div className="surface px-6 py-16 text-center">
        <p className="font-display text-2xl">Card not found</p>
        <p className="mt-1 text-[13px] text-muted-foreground">This card is unavailable or is not assigned to your account.</p>
        <Link to="/cards" className="mt-5 inline-block text-sm font-medium underline">
          Back to cards
        </Link>
      </div>
    );
  }

  const frozen = card.status === "frozen";
  // Automatically issued cards stay locked for the client until funded.
  const awaitingFunds = Boolean(card.auto_issued && !card.funded_at);
  const cancelled = card.status === "cancelled";

  return (
    <div className="space-y-8">
      <div>
        <Link to="/cards" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Cards
        </Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-[30px] leading-tight tracking-tight sm:text-[36px]">{card.nickname}</h1>
            <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-foreground">
              <StatusPill status={card.status} />
              <span className="num">•••• {card.last4}</span>
              <span>{card.currency}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Clients add credit to their own Regular card from their account balance. */}
            {!admin && card.card_type === "recharge" && !cancelled && (
              <Button size="sm" className="h-11 sm:h-10" onClick={() => setAddingCredit(true)} disabled={Boolean(busy) || card.status !== "active"} title={frozen ? "Unfreeze the card to add credit" : undefined}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add credit
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-11 sm:h-10" onClick={() => revealCard()} disabled={Boolean(busy) || cancelled || (awaitingFunds && !admin)}>
              {busy === "reveal" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
              {revealed ? "Hide details" : "Show details"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 sm:h-10"
              onClick={() => runControl(frozen ? "unfreeze" : "freeze", frozen ? "active" : "frozen", frozen ? "Card unfrozen" : "Card frozen")}
              disabled={Boolean(busy) || cancelled}
            >
              {busy === "freeze" || busy === "unfreeze" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : frozen ? (
                <Lock className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Snowflake className="mr-1.5 h-3.5 w-3.5" />
              )}
              {frozen ? "Unfreeze card" : "Freeze card"}
            </Button>
            {card.photon_card_id && cvvBlocked && (
              <Button variant="outline" size="sm" className="h-11 sm:h-10" onClick={unblockCvv} disabled={Boolean(busy) || cancelled} title="Use this if online payments fail because the CVV was entered wrongly too many times">
                {busy === "unblock" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <KeyRound className="mr-1.5 h-3.5 w-3.5" />}
                Unblock CVV
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={Boolean(busy) || cancelled} className="h-11 text-destructive sm:h-10">
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Cancel card
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this card permanently?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently close the card. You will need a replacement card to make new payments.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep card</AlertDialogCancel>
                  <AlertDialogAction onClick={() => runControl("cancel", "cancelled", "Card cancelled")}>
                    Cancel card
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <AlertDialog open={reasonOpen} onOpenChange={setReasonOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>View this client's card details?</AlertDialogTitle>
            <AlertDialogDescription>
              Full card details belong to the cardholder. Say why you need them. Your name and reason are recorded in this card's activity, where the client can see them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={viewReason} onChange={(e) => setViewReason(e.target.value)} maxLength={300} placeholder="e.g. Client asked for help with a declined payment" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={viewReason.trim().length < 10} onClick={() => { setReasonOpen(false); revealCard(viewReason.trim()); }}>
              Record and view
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {awaitingFunds && (
        <div role="note" className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          {admin
            ? "Locked until funded: the client cannot see this card's number, CVV or expiry until its first top-up. Use Top up below once the client has paid."
            : "Your card is ready. Its number, CVV and expiry unlock as soon as your account is funded. Contact your administrator to fund it."}
        </div>
      )}

      {notice && (
        <div role="status" className="rounded-2xl border border-border bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">{notice}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="relative min-w-0 space-y-4">
          {(busy === "freeze" || busy === "unfreeze" || busy === "cancel") && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[22px] bg-background/50 backdrop-blur-[1px]">
              <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Updating card…
              </span>
            </div>
          )}
          <CardVisual card={card} revealedNumber={revealed?.card_no} revealedCvv={revealed?.cvv} revealedExpiry={revealed?.expiry} />
          <div className="surface grid grid-cols-3 divide-x divide-border px-1 py-4 text-center">
            <div>
              <div className="label-eyebrow">Balance</div>
              <div className="num mt-2 text-sm font-semibold sm:text-base">{formatMoney(card.balance, card.currency)}</div>
            </div>
            <div>
              <div className="label-eyebrow">This month</div>
              <div className="num mt-2 text-sm font-semibold sm:text-base">{formatMoney(card.monthly_spend, card.currency)}</div>
            </div>
            <div>
              <div className="label-eyebrow">Daily limit</div>
              <div className="num mt-2 text-sm font-semibold sm:text-base">
                {card.max_on_daily ? formatMoney(card.max_on_daily, card.currency) : "None"}
              </div>
            </div>
          </div>
          {revealed && !revealed.cvv && (
            <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
              The CVV could not be loaded from the card issuer right now. Hide and show the details again in a moment.
            </p>
          )}
          {revealed?.expiry && (
            <p className="text-xs text-muted-foreground">
              Card expires {revealed.expiry}. Tap the number, CVV or expiry on the card to copy it. Details hide automatically after 30 seconds.
            </p>
          )}
        </div>

        <div className="surface px-5 py-4">
          <h2 className="mb-1 font-display text-lg">About this card</h2>
          <Row label="Cardholder" value={card.cardholder_name} />
          <Row label="Network" value={card.scheme} />
          <Row label="Type" value={cardTypeLabel(card.card_type)} />
          {card.purpose && <Row label="Used for" value={purposeLabel(card.purpose, card.purpose_detail)} />}
          <Row label="Card format" value="Virtual" />
          <Row label="Monthly limit" value={card.max_on_monthly ? formatMoney(card.max_on_monthly, card.currency) : "None"} />
          <Row label="Per transaction" value={card.max_on_percent ? formatMoney(card.max_on_percent, card.currency) : "None"} />
          <Row label="Issued" value={formatDate(card.created_date)} />
          {admin && <><Row label="PhotonPay card" value={card.photon_card_id} /><Row label="Request ID" value={card.request_id} /></>}
        </div>
      </div>

      {!admin && (
        <AddCreditDialog
          open={addingCredit}
          onOpenChange={setAddingCredit}
          card={card}
          onDone={(data) => {
            setCard((current) => ({ ...current, ...(data?.balance != null ? { balance: data.balance } : {}), ...(data?.unlocked ? { funded_at: new Date().toISOString() } : {}) }));
            loadTransactions(requestVersion.current);
          }}
        />
      )}

      {admin && (
        <CardAdminTools
          card={card}
          transactions={transactions}
          onUpdated={(fields) => setCard((current) => ({ ...current, ...fields }))}
          onActivity={() => loadTransactions(requestVersion.current)}
        />
      )}

      {admin && <section className="surface p-5 sm:p-6">
        <h2 className="font-display text-lg">User access</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Assign this card and its activity to a user's Z8 account email. Leave it blank to keep the card visible to admins only.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="max-w-md flex-1 space-y-2"><Label htmlFor="card-owner-email">Account email</Label><Input id="card-owner-email" type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} placeholder="user@example.com" /></div>
          <Button onClick={saveAccess} disabled={Boolean(busy)}>{busy === "assign" && <Loader2 className="h-4 w-4 animate-spin" />} Save access</Button>
        </div>
      </section>}

      <section className="surface">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-display text-lg">Card activity</h2>
        </div>
        {transactions.length ? (
          <ul className="divide-y divide-border">
            {transactions.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="truncate text-[13px]">{item.merchant || item.event || "Card event"}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {item.note || formatDateTime(item.occurred_at)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="num text-[13px]">{item.amount ? formatMoney(item.amount, item.currency) : "—"}</div>
                  <div className="mt-1 flex justify-end">
                    <StatusPill status={item.status} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">No activity on this card yet.</div>
        )}
      </section>
    </div>
  );
}