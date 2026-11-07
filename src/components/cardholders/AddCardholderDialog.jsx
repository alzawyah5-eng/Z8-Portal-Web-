import React, { useEffect, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, FolderOpen, ImageUp, Loader2 } from "lucide-react";
import { z8 } from "@/api/z8Client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Field from "@/components/forms/Field";
import ResponsiveSelect from "@/components/forms/ResponsiveSelect";
import CountrySelect from "@/components/forms/CountrySelect";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dialFor } from "@/lib/countries";
import { prepareIdPhoto, readBase64 } from "@/lib/idPhoto";

// Fields follow PhotonPay's addCardholder requirements: name, date of birth and
// nationality; an email or a mobile; the full billing address; the ID document
// with its number, issuing country and photos (front, plus back unless passport).
const EMPTY = {
  firstName: "", lastName: "", dateOfBirth: "", nationalityCountryCode: "",
  email: "", mobileCountry: "", mobilePrefix: "", mobile: "",
  residentialAddress: "", residentialCity: "", residentialState: "", residentialPostalCode: "", residentialCountryCode: "",
  certType: "", certId: "", certCountryCode: "",
  deviceCountry: "",
};

const ID_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "id_card", label: "National ID card" },
  { value: "resident_permit", label: "Residence permit" },
];

// mode "admin": registers straight with PhotonPay.
// mode "self": a client applies for themselves; the application (with ID photos
// in private storage) waits in Z8 until an administrator approves it, and only
// then is it sent to PhotonPay. The email is the client's login email.
// Text fields of a client's unfinished verification, kept for this browser tab
// only. Phones often reload the page after the camera; this brings the typed
// details back. The ID number is never stored.
const DRAFT_KEY = "z8.verificationDraft";

function readDraft() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    return saved && typeof saved === "object" ? { ...EMPTY, ...saved, certId: "" } : null;
  } catch {
    return null;
  }
}

function writeDraft(form) {
  try {
    const { certId: _omit, ...rest } = form;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
  } catch { /* storage unavailable: nothing to keep */ }
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

// inline: render as a page section instead of a pop-up. Used on the client's
// Verification page, where a dialog is fragile on phones around the camera.
export default function AddCardholderDialog({ open, onOpenChange, onCreated, mode = "admin", accountEmail = "", inline = false }) {
  const self = mode === "self";
  const [form, setForm] = useState(() => (self && readDraft()) || EMPTY);

  useEffect(() => {
    if (self && open && Object.keys(EMPTY).some((key) => key !== "certType" && form[key])) writeDraft(form);
  }, [self, open, form]);
  const [front, setFront] = useState(null);
  const [back, setBack] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const set = (key, transform) => (e) => {
    const value = transform ? transform(e.target.value) : e.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };
  // For pickers, which hand over the value rather than an event.
  const pick = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const needsBack = form.certType !== "passport";

  const reset = () => { setForm(EMPTY); setFront(null); setBack(null); setError(""); setResult(null); };

  const pickPhoto = (setter) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy("Preparing photo…");
    try {
      // Keep the File itself: no decoding, no giant base64 string in state.
      setter(await prepareIdPhoto(file));
    } catch (err) {
      setter(null);
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const upload = async (photo, side) => {
    const response = await z8.functions.invoke("photonpayCards", {
      action: "upload_id_image",
      payload: { dataBase64: await readBase64(photo), fileName: photo.name, mimeType: photo.type },
    });
    if (response.data?.error) throw new Error(`${side}: ${response.data.error}`);
    return response.data.file_key;
  };

  // The photo is stored by the backend, which returns a token bound to this
  // account: the client never names the storage path of its own ID document.
  const storePhoto = async (photo) => {
    const response = await z8.functions.invoke("photonpayCards", {
      action: "store_id_photo",
      payload: { dataBase64: await readBase64(photo), fileName: photo.name, mimeType: photo.type },
    });
    if (response.data?.error || !response.data?.photo_token) {
      throw new Error(response.data?.error || "The photo could not be saved. Please try again.");
    }
    return response.data.photo_token;
  };

  const submitSelf = async () => {
    setBusy("Saving your ID photos securely…");
    const frontPhotoToken = await storePhoto(front);
    const backPhotoToken = needsBack ? await storePhoto(back) : "";
    setBusy("Submitting for review…");
    const prefix = form.mobilePrefix.trim() ? "+" + form.mobilePrefix.replace(/[^\d]/g, "") : "";
    const response = await z8.functions.invoke("photonpayCards", {
      action: "submit_registration",
      payload: { ...form, email: undefined, mobilePrefix: prefix, frontPhotoToken, backPhotoToken },
    });
    if (response.data?.error) throw new Error(response.data.error);
    clearDraft();
    setResult({ submitted: true, ...response.data.application });
    onCreated?.(response.data.application);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (!self && !form.email.trim() && !form.mobile.trim()) { setError("Enter an email or a mobile number."); return; }
    if (!form.nationalityCountryCode || !form.residentialCountryCode || !form.certCountryCode) { setError("Choose the nationality, billing country and ID issuing country."); return; }
    if (!form.deviceCountry) { setError("Select the country you are in now."); return; }
    if (!form.certType) { setError("Choose an ID document type before adding photos."); return; }
    if (!front) { setError(form.certType === "passport" ? "Add a photo of the passport photo page." : "Add a photo of the front of the ID."); return; }
    if (needsBack && !back) { setError("Add a photo of the back of the ID."); return; }
    try {
      if (self) { await submitSelf(); return; }
      setBusy("Uploading ID photos to PhotonPay…");
      const portrait = await upload(front, "Front of ID");
      const reverseSide = needsBack ? await upload(back, "Back of ID") : undefined;
      setBusy("Registering the cardholder with PhotonPay…");
      const prefix = form.mobilePrefix.trim() ? "+" + form.mobilePrefix.replace(/[^\d]/g, "") : "";
      const response = await z8.functions.invoke("photonpayCards", {
        action: "add_holder",
        payload: { ...form, mobilePrefix: prefix, portrait, reverseSide },
      });
      if (response.data?.error) throw new Error(response.data.error);
      setResult(response.data);
      onCreated?.(response.data);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "The cardholder could not be registered.");
    } finally {
      setBusy("");
    }
  };

  const close = (next) => { if (busy) return; if (!next) { reset(); if (self) clearDraft(); } onOpenChange(next); };

  const eyebrow = self ? "Identity verification" : "PhotonPay cardholder";
  const title = self ? "Verify your identity" : "Add a client";
  const intro = self
    ? "Required before a card can be issued to you. An administrator reviews your details first; only after their approval are they passed to our identity screening. Details must match your ID document exactly."
    : "Registers the client in your PhotonPay account; they appear in the PhotonPay portal and here. Details must match the ID document exactly.";

  if (inline) {
    if (!open) return null;
    return (
      <section className="surface overflow-hidden rounded-[24px]">
        <div className="border-b border-border px-5 py-4 sm:px-6 sm:py-5">
          <div className="label-eyebrow">{eyebrow}</div>
          <h2 className="mt-1 font-display text-2xl">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{intro}</p>
        </div>
        {renderBody(true)}
      </section>
    );
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
        }}
        tabIndex={-1}
        className="!flex max-h-[92dvh] max-w-2xl flex-col gap-0 overflow-hidden rounded-[24px] p-0"
        style={{ display: "flex", flexDirection: "column", height: "auto", maxHeight: "92dvh" }}
      >
        <div className="border-b border-border px-5 py-4 sm:px-6 sm:py-5">
          <DialogHeader>
            <DialogDescription className="label-eyebrow">{eyebrow}</DialogDescription>
            <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
          </DialogHeader>
          <p className="mt-2 text-sm text-muted-foreground">{intro}</p>
        </div>
        {renderBody(false)}
      </DialogContent>
    </Dialog>
  );

  function renderBody(isInline) {
    return result?.submitted ? (
          <div className="space-y-4 px-5 py-6 sm:px-6">
            <div className="flex items-start gap-3 rounded-xl bg-secondary px-4 py-4 text-sm">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="font-medium">Submitted for review</p>
                <p className="mt-1 text-muted-foreground">An administrator will check your details. You can follow the status on this page.</p>
              </div>
            </div>
            <div className="flex justify-end"><Button type="button" onClick={() => close(false)}>Done</Button></div>
          </div>
        ) : result ? (
          <div className="space-y-4 px-5 py-6 sm:px-6">
            <div className="flex items-start gap-3 rounded-xl bg-secondary px-4 py-4 text-sm">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="font-medium">Registered with PhotonPay · {result.photon_cardholder_id}</p>
                <p className="mt-1 text-muted-foreground">
                  {result.status === "active"
                    ? "Approved. You can issue virtual cards to this client now."
                    : `PhotonPay status: ${result.provider_status}, review: ${result.review_status}. Cards can be issued once PhotonPay approves the client; this page updates automatically.`}
                </p>
                {result.reason && <p className="mt-1 text-muted-foreground">PhotonPay note: {result.reason}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={reset}>Add another</Button>
              <Button type="button" onClick={() => close(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className={isInline ? undefined : "min-h-0 overflow-hidden"}
            style={isInline ? undefined : { minHeight: 0, overflow: "hidden" }}
          >
            <div
              className={isInline ? "space-y-6 px-5 py-5 sm:px-6" : "max-h-[60dvh] space-y-6 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6"}
              style={isInline ? undefined : { maxHeight: "calc(92dvh - 230px)", overflowY: "auto" }}
            >
              <section className="grid gap-4 sm:grid-cols-2">
                <h3 className="text-sm font-medium sm:col-span-2">Identity</h3>
                <Field label="First name" hint="Letters and spaces only, as on the ID.">
                  <Input value={form.firstName} onChange={set("firstName")} maxLength={40} required autoComplete="off" />
                </Field>
                <Field label="Last name">
                  <Input value={form.lastName} onChange={set("lastName")} maxLength={40} required autoComplete="off" />
                </Field>
                <Field label="Date of birth">
                  <Input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} max={new Date().toISOString().slice(0, 10)} required />
                </Field>
                <Field label="Nationality">
                  <CountrySelect value={form.nationalityCountryCode} onValueChange={pick("nationalityCountryCode")} placeholder="Select nationality" />
                </Field>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <h3 className="text-sm font-medium sm:col-span-2">Contact <span className="font-normal text-muted-foreground">· email or mobile</span></h3>
                {self ? (
                  <Field label="Email" className="sm:col-span-2" hint={accountEmail.length > 40 ? "Your login email is too long to be submitted (40 characters), so add a mobile number." : "Your Z8 login email is used."}>
                    <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm">{accountEmail}</div>
                  </Field>
                ) : (
                  <Field label="Email" className="sm:col-span-2">
                    <Input type="email" value={form.email} onChange={set("email")} maxLength={40} autoComplete="off" />
                  </Field>
                )}
                <Field label="Country calling code" hint="Sets the + code for the mobile number.">
                  <CountrySelect
                    showDial
                    value={form.mobileCountry}
                    placeholder="Select country"
                    onValueChange={(code) => setForm((current) => ({ ...current, mobileCountry: code, mobilePrefix: dialFor(code) }))}
                  />
                </Field>
                <Field label="Mobile number" hint="Up to 11 digits, without the country code.">
                  <Input inputMode="numeric" value={form.mobile} onChange={set("mobile", (v) => v.replace(/\D/g, "").slice(0, 11))} />
                </Field>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <h3 className="text-sm font-medium sm:col-span-2">Billing address</h3>
                <Field label="Street address" className="sm:col-span-2">
                  <Input value={form.residentialAddress} onChange={set("residentialAddress")} maxLength={100} required />
                </Field>
                <Field label="City"><Input value={form.residentialCity} onChange={set("residentialCity")} maxLength={50} required /></Field>
                <Field label="State or province"><Input value={form.residentialState} onChange={set("residentialState")} maxLength={50} required /></Field>
                <Field label="Postal code"><Input value={form.residentialPostalCode} onChange={set("residentialPostalCode")} maxLength={10} required /></Field>
                <Field label="Country">
                  <CountrySelect value={form.residentialCountryCode} onValueChange={pick("residentialCountryCode")} placeholder="Select country" />
                </Field>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <h3 className="text-sm font-medium sm:col-span-2">ID document</h3>
                <Field label="ID type" hint="Choose a document type to show the photo fields you need.">
                  <ResponsiveSelect value={form.certType} onValueChange={(v) => { setForm((c) => ({ ...c, certType: v })); if (v === "passport") setBack(null); }} options={ID_TYPES} placeholder="ID type" />
                </Field>
                <Field label="Issuing country">
                  <CountrySelect value={form.certCountryCode} onValueChange={pick("certCountryCode")} placeholder="Select country" />
                </Field>
                {form.certType && <>
                <Field label="ID number" className="sm:col-span-2" hint={self ? "Kept only until your verification is reviewed; afterwards Z8 keeps just the last four characters." : "Sent to PhotonPay; Z8 keeps only the last four characters."}>
                  <Input value={form.certId} onChange={set("certId")} maxLength={64} required autoComplete="off" />
                </Field>
                {[[front, setFront, form.certType === "passport" ? "Passport photo page" : "Front of ID"], ...(needsBack ? [[back, setBack, "Back of ID"]] : [])].map(([photo, setter, label]) => (
                  <IdPhotoPicker
                    key={label}
                    photo={photo}
                    label={label}
                    hint={self ? "JPG or PNG, clear and uncropped. Stored privately; only administrators can view it." : "JPG or PNG, clear and uncropped. Sent only to PhotonPay."}
                    onChange={pickPhoto(setter)}
                    disabled={Boolean(busy)}
                  />
                ))}
                </>}
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <Field label="Country you are in now" className="sm:col-span-2" hint={self
                  ? "Where you and this device are right now. It is sent with your card application for fraud checks, so it must match your internet connection."
                  : "Where you and this device are right now. When this client's card is issued automatically, your device's connection and this country are sent with the application for fraud checks."}>
                  <CountrySelect value={form.deviceCountry} onValueChange={pick("deviceCountry")} placeholder="Select country" />
                </Field>
              </section>

              {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
            </div>
            <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border bg-background px-5 py-3.5 sm:px-6 sm:py-4">
              <span className="text-xs text-muted-foreground" role="status">{busy}</span>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => close(false)} disabled={Boolean(busy)}>Cancel</Button>
                <Button type="submit" disabled={Boolean(busy)}>{busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{busy ? "Please wait…" : (self ? "Submit for review" : "Register with PhotonPay")}</Button>
              </div>
            </div>
          </form>
        );
  }
}

function IdPhotoPicker({ photo, label, hint, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const cameraRef = React.useRef(null);
  const galleryRef = React.useRef(null);
  const choose = (ref) => {
    setOpen(false);
    ref.current?.click();
  };

  return (
    <Field label={label} hint={hint}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" disabled={disabled} className="w-full justify-start gap-2 rounded-xl border-dashed font-normal">
            <ImageUp className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{photo ? `${photo.name} · ${(photo.size / 1024).toFixed(0)} KB` : "Choose photo"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Add {label.toLowerCase()}</p>
          <Button type="button" variant="ghost" className="w-full justify-start gap-2" onClick={() => choose(cameraRef)}>
            <Camera className="h-4 w-4" /> Take a photo
          </Button>
          <Button type="button" variant="ghost" className="w-full justify-start gap-2" onClick={() => choose(galleryRef)}>
            <FolderOpen className="h-4 w-4" /> Choose from files
          </Button>
        </PopoverContent>
      </Popover>
      <input ref={cameraRef} type="file" accept="image/jpeg,image/png" capture="environment" className="sr-only" onChange={onChange} />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png" className="sr-only" onChange={onChange} />
    </Field>
  );
}
