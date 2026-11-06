import React, { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Plus, Wallet } from "lucide-react";
import { z8 } from "@/api/z8Client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Field from "@/components/forms/Field";
import AddFundsDialog from "@/components/funds/AddFundsDialog";
import { cn } from "@/lib/utils";
import { usd } from "@/lib/funds";

const call = async (action, payload) => {
  const response = await z8.functions.invoke("photonpayCards", { action, payload });
  if (response.data?.error) throw Object.assign(new Error(response.data.error), { data: response.data });
  return response.data;
};
const errorOf = (err) => ({ text: err?.response?.data?.error || err?.message || "That did not go through. Please try again.", needsFunds: Boolean(err?.response?.data?.needs_funds || err?.data?.needs_funds) });

// A client moves money from their Z8 account onto one of their cards. PhotonPay
// quotes first (fee and what arrives), then the client confirms.
export default function AddCreditDialog({ open, onOpenChange, card, onDone }) {
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [funding, setFunding] = useState(false);

  const loadWallet = () => call("my_wallet", {}).then(setWallet).catch(() => setWallet({ available: 0 }));

  useEffect(() => {
    if (!open) return;
    setAmount(""); setQuote(null); setError(null); setDone(null); setWallet(null);
    loadWallet();
  }, [open]);

  const available = Number(wallet?.available) || 0;
  const presets = [10, 25, 50, 100].filter((value) => value <= available);
  if (available > 0 && !presets.includes(available)) presets.push(available);

  const getQuote = async (event) => {
    event.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) { setError({ text: "Enter how much credit to add." }); return; }
    if (value > available) { setError({ text: `Your available balance is ${usd(available)}.`, needsFunds: true }); return; }
    setBusy("quote"); setError(null);
    try {
      const data = await call("top_up_quote", { recordId: card.id, amount: value });
      setQuote({ ...data, amount: value, received: Date.now() });
    } catch (err) {
      setError(errorOf(err));
    } finally {
      setBusy("");
    }
  };

  const confirm = async () => {
    setBusy("confirm"); setError(null);
    try {
      const data = await call("top_up_confirm", { recordId: card.id, requestId: quote.request_id });
      setDone({ arrived: data.arrival_amount ?? quote.arrival_amount ?? quote.amount, balance: data.balance });
      onDone?.(data);
    } catch (err) {
      setError(errorOf(err));
      setQuote(null);
    } finally {
      setBusy("");
    }
  };

  const expired = quote?.valid_seconds && Date.now() - quote.received > Number(quote.valid_seconds) * 1000;
  const fee = quote ? Math.max(0, Number(quote.fee ?? (Number(quote.recharge_amount ?? quote.amount) - Number(quote.arrival_amount ?? quote.amount))) || 0) : 0;

  return (
    <>
      <Dialog open={open && !funding} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-[24px]">
          {done ? (
            <div className="py-4 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
              <DialogTitle className="mt-3 font-display text-xl">Credit added</DialogTitle>
              <DialogDescription className="mx-auto mt-2 max-w-sm text-sm leading-relaxed">
                <span className="num font-semibold text-foreground">{usd(done.arrived)}</span> is now on {card.nickname || "your card"}
                {done.balance != null ? <> · card balance <span className="num font-semibold text-foreground">{usd(done.balance)}</span></> : null}.
              </DialogDescription>
              <Button className="mt-6" onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          ) : quote ? (
            <div>
              <DialogHeader className="text-left">
                <DialogTitle className="font-display text-xl">Confirm credit</DialogTitle>
                <DialogDescription>{card.nickname || "Your card"}{card.last4 ? ` · •••• ${card.last4}` : ""}</DialogDescription>
              </DialogHeader>
              <dl className="mt-5 divide-y divide-border rounded-2xl border border-border text-sm">
                <div className="flex items-center justify-between px-4 py-3"><dt className="text-muted-foreground">From your balance</dt><dd className="num font-semibold">{usd(quote.recharge_amount ?? quote.amount)}</dd></div>
                <div className="flex items-center justify-between px-4 py-3"><dt className="text-muted-foreground">Fee</dt><dd className="num">{usd(fee)}</dd></div>
                <div className="flex items-center justify-between bg-muted/40 px-4 py-3"><dt className="font-medium">Arrives on the card</dt><dd className="num text-base font-semibold text-emerald-700 dark:text-emerald-400">{usd(quote.arrival_amount ?? quote.amount)}</dd></div>
              </dl>
              {expired && <p role="status" className="mt-3 text-sm text-amber-700">This quote has expired. Go back and get a new one.</p>}
              {error && <p role="alert" className="mt-3 text-sm text-destructive">{error.text}</p>}
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={() => { setQuote(null); setError(null); }} disabled={busy === "confirm"}><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Change amount</Button>
                <Button type="button" onClick={confirm} disabled={busy === "confirm" || expired}>
                  {busy === "confirm" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Add {usd(quote.arrival_amount ?? quote.amount)}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={getQuote}>
              <DialogHeader className="text-left">
                <DialogTitle className="font-display text-xl">Add credit</DialogTitle>
                <DialogDescription>Move money from your account onto {card.nickname || "this card"}{card.last4 ? ` (•••• ${card.last4})` : ""}.</DialogDescription>
              </DialogHeader>
              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between rounded-2xl bg-muted/50 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Available in your account</span>
                  {wallet ? <span className="num font-semibold">{usd(available)}</span> : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" />}
                </div>
                {wallet && available <= 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm dark:bg-amber-500/5">
                    <p className="flex items-center gap-2 font-medium"><Wallet className="h-4 w-4 text-amber-700" aria-hidden="true" /> Your account has no funds yet</p>
                    <p className="mt-1 text-muted-foreground">Add funds to your account first, then come back to add credit to this card.</p>
                  </div>
                ) : (
                  <>
                    <Field label="Amount (USD)">
                      <Input type="number" inputMode="decimal" min="1" max={available || undefined} step="0.01" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className="num text-lg" />
                    </Field>
                    {presets.length > 0 && (
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
                        {presets.map((value) => (
                          <button key={value} type="button" data-compact onClick={() => setAmount(String(value))}
                            className={cn("min-h-9 rounded-full border px-3 text-xs font-medium transition-colors", Number(amount) === value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40")}>
                            {value === available && ![10, 25, 50, 100].includes(value) ? `All · ${usd(value)}` : usd(value)}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">You'll see the fee and the exact amount that arrives before confirming.</p>
                  </>
                )}
                {error && (
                  <p role="alert" className="text-sm text-destructive">{error.text}</p>
                )}
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                {(wallet && available <= 0) || error?.needsFunds ? (
                  <Button type="button" onClick={() => setFunding(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Add funds</Button>
                ) : (
                  <Button type="submit" disabled={busy === "quote" || !wallet}>{busy === "quote" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Continue</Button>
                )}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AddFundsDialog
        open={funding}
        onOpenChange={(value) => { setFunding(value); if (!value) loadWallet(); }}
        instructions={wallet?.funding_instructions || ""}
        min={Number(wallet?.min_amount) || 20}
      />
    </>
  );
}
