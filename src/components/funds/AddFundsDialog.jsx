import React, { useEffect, useState } from "react";
import { Check, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Field from "@/components/forms/Field";
import ResponsiveSelect from "@/components/forms/ResponsiveSelect";
import { DEPOSIT_METHODS, usd } from "@/lib/funds";
import ProofPicker from "@/components/funds/ProofPicker";
import { uploadProof } from "@/lib/proofFile";

const EMPTY = { amount: "", method: "bank_transfer", reference: "", note: "" };

// Two steps in one window: how to pay us, then "I've sent it" so we can confirm.
export default function AddFundsDialog({ open, onOpenChange, instructions, min = 20, onReported }) {
  const [form, setForm] = useState(EMPTY);
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (open) { setForm(EMPTY); setProof(null); setError(""); setSent(null); setCopied(false); } }, [open]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const copy = async () => {
    try { await navigator.clipboard.writeText(instructions); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      // The proof is stored first; the deposit then carries its token.
      const proofToken = proof ? await uploadProof(proof) : "";
      const response = await base44.functions.invoke("photonpayCards", {
        action: "report_deposit",
        payload: { ...form, amount: Number(form.amount), ...(proofToken ? { proofToken, proofName: proof.name } : {}) },
      });
      if (response.data?.error) throw new Error(response.data.error);
      setSent(Number(form.amount));
      onReported?.();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "That could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-[24px]">
        {sent !== null ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
            <DialogTitle className="mt-3 font-display text-xl">Thanks, we're on it</DialogTitle>
            <DialogDescription className="mx-auto mt-2 max-w-sm text-sm leading-relaxed">
              We'll add <span className="num font-semibold text-foreground">{usd(sent)}</span> to your balance as soon as it reaches us. You'll see it under Your account.
            </DialogDescription>
            <Button className="mt-6" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-xl">Add funds</DialogTitle>
              <DialogDescription>Your balance pays for new cards (at least {usd(min)} each) and top-ups.</DialogDescription>
            </DialogHeader>

            <div className="mt-2 space-y-5">
              <section aria-labelledby="pay-step">
                <p id="pay-step" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · Send us the money</p>
                {instructions ? (
                  <div className="relative rounded-2xl border border-border bg-muted/40 p-4 pr-12">
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{instructions}</p>
                    <button type="button" data-compact onClick={copy} aria-label="Copy payment details" className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-background hover:text-foreground">
                      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                ) : (
                  <p className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">Contact us for our payment details.</p>
                )}
              </section>

              <form onSubmit={submit} aria-labelledby="tell-step" className="space-y-4">
                <p id="tell-step" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Tell us you've sent it</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Amount (USD)">
                    <Input type="number" inputMode="decimal" min="1" step="0.01" required value={form.amount} onChange={set("amount")} className="num" />
                  </Field>
                  <Field label="Paid by">
                    <ResponsiveSelect value={form.method} onValueChange={(value) => setForm((current) => ({ ...current, method: value }))} options={DEPOSIT_METHODS} />
                  </Field>
                  <Field label="Reference (optional)" className="sm:col-span-2">
                    <Input value={form.reference} onChange={set("reference")} maxLength={120} placeholder="Transfer reference or receipt number" />
                  </Field>
                </div>
                <ProofPicker value={proof} onChange={setProof} />
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {busy && proof ? "Uploading proof…" : "I've sent it"}</Button>
                </div>
              </form>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
