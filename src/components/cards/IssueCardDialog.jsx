import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import CardSpecFields from "@/components/cards/CardSpecFields";
import CardholderFields from "@/components/cards/CardholderFields";

const EMPTY = {
  nickname: "", card_type: "share", card_currency: "USD",
  // Entered by the admin: it must be where their device is now, matching the
  // IP PhotonPay sees. The browser language is not a location, so no default.
  gps_country: "", recharge_amount: "", max_on_daily: "",
  max_on_monthly: "", max_on_percent: "", holder_id: "", email: "",
};

function mapStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["normal", "active", "enabled"].includes(value)) return "active";
  if (["frozen", "freeze", "locked", "blocked"].includes(value)) return "frozen";
  if (["cancelled", "canceled", "destroyed", "closed"].includes(value)) return "cancelled";
  return "pending";
}

export default function IssueCardDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [cardholders, setCardholders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!open || !admin) return;
    let active = true;
    setStep(0);
    setError("");
    setAccepted(false);
    base44.entities.Cardholder.list({ sort: "-created_date", limit: 100 })
      .then(page => { if (active) setCardholders(Array.isArray(page) ? page : page.items || []); })
      .catch(() => { if (active) setCardholders([]); });
    return () => { active = false; };
  }, [open, admin]);

  const pickHolder = (holderId) => {
    const holder = cardholders.find(item => item.id === holderId);
    if (holder) setForm(current => ({ ...current, holder_id: holder.id, email: holder.email || "" }));
  };

  const submit = async () => {
    if (!admin || accepted) return;
    const selected = cardholders.find(item => item.id === form.holder_id);
    if (!selected?.photon_cardholder_id) { setError("Choose a client synced from PhotonPay first."); return; }
    setBusy(true);
    setError("");
    let providerReference = "";
    try {
      const response = await base44.functions.invoke("photonpayCards", { action: "issue", payload: {
        cardholderRecordId: selected.id, ownerEmail: form.email,
        cardCurrency: "USD", cardType: form.card_type,
        cardFormFactor: "virtual_card", gpsCountry: form.gps_country,
        rechargeAmount: form.card_type === "recharge" ? form.recharge_amount : undefined,
        nickname: form.nickname,
        maxOnDaily: form.max_on_daily, maxOnMonthly: form.max_on_monthly,
        maxOnPercent: form.max_on_percent,
      } });
      if (response.data?.error) throw new Error(response.data.error);
      providerReference = response.data?.request_id || "";
      setAccepted(true);
      const apiCard = response.data?.card || {};
      const holderName = selected.full_name;
      const ownerEmail = response.data.owner_email;
      const status = mapStatus(apiCard.status);
      const record = await base44.entities.Card.create({
        nickname: form.nickname || holderName, owner_email: ownerEmail,
        masked_number: apiCard.masked_number || "", last4: apiCard.last4 || "",
        currency: "USD", card_type: form.card_type,
        form_factor: "virtual_card", status, balance: apiCard.balance || 0,
        max_on_daily: Number(form.max_on_daily) || undefined,
        max_on_monthly: Number(form.max_on_monthly) || undefined,
        max_on_percent: Number(form.max_on_percent) || undefined,
        cardholder_name: holderName, cardholder_id: selected.id,
        photon_card_id: apiCard.photon_card_id || "",
        photon_cardholder_id: response.data.photon_cardholder_id,
        request_id: providerReference,
      });
      await base44.entities.CardTransaction.create({
        kind: "event", owner_email: ownerEmail,
        event: status === "active" ? "Card issued" : "Card requested",
        card_id: record.id, card_last4: record.last4, card_nickname: record.nickname,
        amount: 0, currency: record.currency,
        status: status === "active" ? "completed" : "pending",
        occurred_at: new Date().toISOString(),
        note: "Virtual card requested for " + holderName,
      });
      setForm(EMPTY);
      onOpenChange(false);
      navigate("/cards/" + record.id);
    } catch (err) {
      setError(providerReference
        ? "PhotonPay accepted the request, but Z8 could not finish saving it. Check PhotonPay before issuing again. Reference: " + providerReference
        : err?.response?.data?.error || err.message || "The card request could not complete.");
    } finally { setBusy(false); }
  };

  if (!admin) return null;
  const selected = cardholders.find(holder => holder.id === form.holder_id);
  return (
    <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl gap-0 overflow-hidden rounded-[24px] p-0">
        <div className="border-b border-border px-5 py-4 sm:px-6 sm:py-5">
          <DialogHeader>
            <DialogDescription className="label-eyebrow">Virtual card · Step {step + 1} of 2</DialogDescription>
            <DialogTitle className="font-display text-2xl">{step === 0 ? "Set up a virtual card" : "Choose your client"}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 flex gap-2" aria-hidden="true"><span className="h-1.5 flex-1 rounded-full bg-primary" /><span className={step === 1 ? "h-1.5 flex-1 rounded-full bg-primary" : "h-1.5 flex-1 rounded-full bg-muted"} /></div>
        </div>
        <div className="max-h-[58vh] overflow-y-auto px-5 py-5 sm:max-h-[60vh] sm:px-6 sm:py-6">
          {step === 0 ? <CardSpecFields value={form} onChange={setForm} /> : <CardholderFields value={form} onChange={setForm} cardholders={cardholders} onPickHolder={pickHolder} />}
          {error && <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3.5 sm:px-6 sm:py-4">
          <Button type="button" variant="ghost" onClick={() => step === 0 ? onOpenChange(false) : setStep(0)} disabled={busy || accepted}>
            {step === 0 ? "Cancel" : <><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back</>}
          </Button>
          {step === 0 ? <Button type="button" onClick={() => setStep(1)} disabled={!form.nickname.trim() || !/^[A-Z]{2}$/.test(form.gps_country || "") || (form.card_type === "recharge" && !(Number(form.recharge_amount) > 0))}>Continue <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
          : <Button type="button" onClick={submit} disabled={busy || accepted || !selected?.photon_cardholder_id || !form.email.trim()}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{busy ? "Checking and issuing…" : "Check approval & issue"}
          </Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}