import React, { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Loader2, Lock, Wallet } from "lucide-react";
import { z8 } from "@/api/z8Client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Field from "@/components/forms/Field";
import { cn } from "@/lib/utils";
import { usd } from "@/lib/funds";
import { CARD_PURPOSES } from "@/lib/cardPurposes";
import { tierInfo } from "@/lib/tiers";

// Request a Regular card, paid from the client's account balance. Without
// enough balance the window explains it and points to Add funds instead.
export default function RequestCardDialog({ open, onOpenChange, available = 0, min = 20, standing = null, onRequested, onAddFunds }) {
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [purposeDetail, setPurposeDetail] = useState("");
  const [tier, setTier] = useState("");
  const ladder = standing?.ladder || [];
  const eligible = standing?.eligible_tiers || [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => { if (open) { setAmount(""); setPurpose(""); setPurposeDetail(""); setTier(standing?.tier || ""); setError(""); setDone(null); } }, [open, standing?.tier]);

  const enough = available >= min && Boolean(standing?.tier ?? true);
  const presets = [min, 50, 100, 250].filter((value, index, list) => value >= min && value <= available && list.indexOf(value) === index);
  if (enough && !presets.includes(available)) presets.push(available);

  const submit = async (event) => {
    event.preventDefault();
    const value = Number(amount);
    if (!purpose) { setError("Choose what you'll use the card for."); return; }
    if (purpose === "other" && purposeDetail.trim().length < 3) { setError("Tell us what you'll use the card for."); return; }
    if (!Number.isFinite(value) || value < min) { setError(`Enter at least ${usd(min)}.`); return; }
    if (value > available) { setError(`Your available balance is ${usd(available)}.`); return; }
    setBusy(true); setError("");
    try {
      const response = await z8.functions.invoke("photonpayCards", { action: "request_card", payload: { amount: value, purpose, purposeDetail: purpose === "other" ? purposeDetail.trim() : "", ...(tier ? { tier } : {}) } });
      if (response.data?.error) throw new Error(response.data.error);
      setDone(value);
      onRequested?.();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Your card request could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-[24px]">
        {done !== null ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
            <DialogTitle className="mt-3 font-display text-xl">Request sent</DialogTitle>
            <DialogDescription className="mx-auto mt-2 max-w-sm text-sm leading-relaxed">
              We've set aside <span className="num font-semibold text-foreground">{usd(done)}</span> from your balance. Once we approve, your card is created with it and you can use it straight away.
            </DialogDescription>
            <Button className="mt-6" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : !enough ? (
          <div className="py-2">
            <DialogHeader className="text-left">
              <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/10 text-amber-700"><Wallet className="h-5 w-5" aria-hidden="true" /></span>
              <DialogTitle className="font-display text-xl">Add funds first</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                {standing && !standing.tier && ladder[0]
                  ? <>Your first card, <span className="font-semibold text-foreground">{ladder[0].name}</span>, is available once you've deposited <span className="num font-semibold text-foreground">{usd(ladder[0].from)}</span> in total. You've deposited <span className="num font-semibold text-foreground">{usd(standing.deposited)}</span> so far.</>
                  : <>A new card starts with at least <span className="num font-semibold text-foreground">{usd(min)}</span>, paid from your account. Your available balance is <span className="num font-semibold text-foreground">{usd(available)}</span>.</>}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Not now</Button>
              <Button type="button" onClick={() => { onOpenChange(false); onAddFunds?.(); }}><Wallet className="h-4 w-4" aria-hidden="true" /> Add funds</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-xl">Request a card</DialogTitle>
              <DialogDescription>A virtual USD card. Choose how much to put on it; it comes from your balance.</DialogDescription>
            </DialogHeader>
            <div className="mt-5 space-y-4">
              {ladder.length > 0 && (
                <fieldset>
                  <legend className="mb-2 text-[13px] font-medium">Card</legend>
                  <div className={cn("grid gap-2", ladder.length === 1 ? "grid-cols-1 sm:w-1/3" : ladder.length === 2 ? "grid-cols-2" : "grid-cols-3")} role="radiogroup" aria-label="Card tier">
                    {ladder.map((step) => {
                      const info = tierInfo(step.id);
                      const allowed = eligible.includes(step.id);
                      const selected = tier === step.id;
                      return (
                        <button
                          key={step.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-disabled={!allowed}
                          data-compact
                          disabled={!allowed}
                          onClick={() => { setTier(step.id); setError(""); }}
                          title={allowed ? undefined : `Deposit ${usd(Math.max(0, step.from - (standing?.deposited || 0)))} more to unlock`}
                          className={cn("relative flex flex-col items-start gap-1.5 rounded-2xl border p-2 text-left transition-colors", selected ? "border-primary ring-1 ring-primary" : "border-border", allowed ? "hover:border-primary/40" : "cursor-not-allowed opacity-60")}
                        >
                          <span className="block aspect-[1.586/1] w-full rounded-lg shadow-inner" style={{ background: info?.gradient }} aria-hidden="true" />
                          <span className="flex w-full items-center justify-between gap-1 text-xs font-semibold">
                            {step.name}
                            {!allowed && <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />}
                          </span>
                          <span className="text-[10px] leading-tight text-muted-foreground">{allowed ? `From ${usd(step.from)} deposited` : `${usd(Math.max(0, step.from - (standing?.deposited || 0)))} to go`}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              <fieldset>
                <legend className="mb-2 text-[13px] font-medium">What will you use this card for?</legend>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Card purpose">
                  {CARD_PURPOSES.map(({ value, label, hint, icon: Icon }) => {
                    const selected = purpose === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        data-compact
                        onClick={() => { setPurpose(value); setError(""); }}
                        className={cn("flex min-h-[64px] items-start gap-2 rounded-2xl border p-3 text-left transition-colors", selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40")}
                      >
                        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium leading-tight">{label}</span>
                          <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {purpose === "other" && (
                  <Input className="mt-2" autoFocus maxLength={60} value={purposeDetail} onChange={(e) => setPurposeDetail(e.target.value)} placeholder="e.g. Supplier payments" aria-label="What you'll use the card for" />
                )}
              </fieldset>
              <div className="flex items-center justify-between rounded-2xl bg-muted/50 px-4 py-3 text-sm">
                <span className="text-muted-foreground">Available</span>
                <span className="num font-semibold">{usd(available)}</span>
              </div>
              <Field label="Amount to put on the card (USD)">
                <Input type="number" inputMode="decimal" min={min} max={available} step="0.01" required value={amount} placeholder={min.toFixed(2)} onChange={(e) => setAmount(e.target.value)} className="num text-lg" />
              </Field>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
                {presets.map((value) => (
                  <button
                    key={value}
                    type="button"
                    data-compact
                    onClick={() => setAmount(String(value))}
                    className={cn("min-h-9 rounded-full border px-3 text-xs font-medium transition-colors", Number(amount) === value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40")}
                  >
                    {value === available && value !== min ? `All · ${usd(value)}` : usd(value)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Minimum {usd(min)}. We review each request; the card's number and CVV are available as soon as it's created.</p>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />} Send request</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
