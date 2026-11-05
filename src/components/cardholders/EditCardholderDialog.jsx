import React, { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Field from "@/components/forms/Field";
import ResponsiveSelect from "@/components/forms/ResponsiveSelect";
import CountrySelect from "@/components/forms/CountrySelect";

const ID_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "id_card", label: "National ID card" },
  { value: "resident_permit", label: "Residence permit" },
];

function fromHolder(h) {
  const [prefix = "", ...rest] = String(h?.phone || "").split(" ");
  return {
    firstName: h?.first_name || "", lastName: h?.last_name || "", dateOfBirth: h?.date_of_birth || "",
    nationalityCountryCode: h?.nationality || "", email: h?.email || "",
    mobilePrefix: prefix.replace(/[^\d]/g, ""), mobile: rest.join("").replace(/\D/g, ""),
    residentialAddress: h?.address_line || "", residentialCity: h?.city || "", residentialState: h?.state || "",
    residentialPostalCode: h?.postal_code || "", residentialCountryCode: h?.country || "",
    certType: h?.cert_type || "", certId: "", certCountryCode: h?.cert_country || "",
  };
}

// Correct a client's details at PhotonPay (editCardholder), e.g. after PhotonPay
// asks for a modification. Only fields that were changed are sent.
export default function EditCardholderDialog({ holder, onOpenChange, onSaved }) {
  const [form, setForm] = useState(fromHolder(holder));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setForm(fromHolder(holder)); setError(""); }, [holder]);

  const original = fromHolder(holder);
  const set = (key, transform) => (e) => setForm((c) => ({ ...c, [key]: transform ? transform(e.target.value) : e.target.value }));
  const pick = (key) => (value) => setForm((c) => ({ ...c, [key]: value }));

  const save = async (e) => {
    e.preventDefault();
    const changed = {};
    for (const key of Object.keys(form)) {
      if (String(form[key] || "").trim() !== String(original[key] || "").trim() && String(form[key] || "").trim() !== "") changed[key] = form[key];
    }
    if (changed.mobile || changed.mobilePrefix) {
      changed.mobile = form.mobile;
      changed.mobilePrefix = form.mobilePrefix ? "+" + form.mobilePrefix.replace(/[^\d]/g, "") : "";
    }
    if (!Object.keys(changed).length) { setError("Nothing was changed."); return; }
    setBusy(true);
    setError("");
    try {
      const response = await base44.functions.invoke("photonpayCards", { action: "edit_holder", payload: { cardholderRecordId: holder.id, ...changed } });
      if (response.data?.error) throw new Error(response.data.error);
      onSaved?.(response.data);
      onOpenChange(false);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(holder)} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl gap-0 overflow-hidden rounded-[24px] p-0">
        <div className="border-b border-border px-5 py-4 sm:px-6 sm:py-5">
          <DialogHeader>
            <DialogDescription className="label-eyebrow">PhotonPay cardholder · {holder?.photon_cardholder_id}</DialogDescription>
            <DialogTitle className="font-display text-2xl">Edit {holder?.full_name}</DialogTitle>
          </DialogHeader>
          <p className="mt-2 text-sm text-muted-foreground">Corrections are sent to PhotonPay, which may review the client again. Only changed fields are sent.{holder?.review_reason ? ` PhotonPay's note: ${holder.review_reason}` : ""}</p>
        </div>
        <form onSubmit={save}>
          <div className="max-h-[60vh] space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
            <section className="grid gap-4 sm:grid-cols-2">
              <Field label="First name"><Input value={form.firstName} onChange={set("firstName")} maxLength={40} /></Field>
              <Field label="Last name"><Input value={form.lastName} onChange={set("lastName")} maxLength={40} /></Field>
              <Field label="Date of birth"><Input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} /></Field>
              <Field label="Nationality"><CountrySelect value={form.nationalityCountryCode} onValueChange={pick("nationalityCountryCode")} placeholder="Select nationality" /></Field>
              <Field label="Email" className="sm:col-span-2"><Input type="email" value={form.email} onChange={set("email")} maxLength={40} /></Field>
              <Field label="Country calling code" hint="Digits only, e.g. 971.">
                <Input inputMode="numeric" value={form.mobilePrefix} onChange={set("mobilePrefix", (v) => v.replace(/\D/g, "").slice(0, 4))} />
              </Field>
              <Field label="Mobile number"><Input inputMode="numeric" value={form.mobile} onChange={set("mobile", (v) => v.replace(/\D/g, "").slice(0, 11))} /></Field>
            </section>
            <section className="grid gap-4 sm:grid-cols-2">
              <Field label="Street address" className="sm:col-span-2"><Input value={form.residentialAddress} onChange={set("residentialAddress")} maxLength={100} /></Field>
              <Field label="City"><Input value={form.residentialCity} onChange={set("residentialCity")} maxLength={50} /></Field>
              <Field label="State or province"><Input value={form.residentialState} onChange={set("residentialState")} maxLength={50} /></Field>
              <Field label="Postal code"><Input value={form.residentialPostalCode} onChange={set("residentialPostalCode")} maxLength={10} /></Field>
              <Field label="Billing country"><CountrySelect value={form.residentialCountryCode} onValueChange={pick("residentialCountryCode")} /></Field>
            </section>
            <section className="grid gap-4 sm:grid-cols-2">
              <Field label="ID type"><ResponsiveSelect value={form.certType} onValueChange={pick("certType")} options={ID_TYPES} placeholder="ID type" /></Field>
              <Field label="ID issuing country"><CountrySelect value={form.certCountryCode} onValueChange={pick("certCountryCode")} /></Field>
              <Field label="New ID number" className="sm:col-span-2" hint={`Leave blank to keep the current one${holder?.cert_id ? ` (ends ${String(holder.cert_id).slice(-4)})` : ""}.`}>
                <Input value={form.certId} onChange={set("certId")} maxLength={64} autoComplete="off" />
              </Field>
            </section>
            {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5 sm:px-6 sm:py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save to PhotonPay</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
