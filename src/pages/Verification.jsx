import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, BadgeCheck, Clock, CreditCard, ShieldCheck, XCircle } from "lucide-react";
import { z8 } from "@/api/z8Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import AddCardholderDialog from "@/components/cardholders/AddCardholderDialog";
import { formatDateTime } from "@/lib/format";

// A client's own identity verification. The application waits for an
// administrator; only an approved application is sent to PhotonPay.
export default function Verification() {
  const { user } = useAuth();
  const [application, setApplication] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Reopen the form if the phone reloaded the page mid-way (e.g. after the camera).
  const [open, setOpen] = useState(() => {
    try { return Boolean(sessionStorage.getItem("z8.verificationDraft")); } catch { return false; }
  });

  const load = async () => {
    try {
      const response = await z8.functions.invoke("photonpayCards", { action: "my_registration", payload: {} });
      if (response.data?.error) throw new Error(response.data.error);
      setApplication(response.data?.application || null);
      setIdentity(response.data?.identity || null);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Your verification status could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Once the details are at PhotonPay, their decision is the client's status.
  const verified = identity?.status === "verified";
  const status = identity ? `identity_${identity.status}` : application?.status;
  const canApply = !identity && (!status || status === "rejected");

  return (
    <div className="space-y-6">
      <header>
        <div className="label-eyebrow">Your account</div>
        <h1 className="mt-2 font-display text-[40px] leading-none tracking-tight sm:text-[48px]">Verification</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">Before a card can be issued to you, we need to verify your identity. You submit your details here; an administrator reviews them and only then are they passed to our identity screening.</p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-destructive/25 px-4 py-3 text-sm text-destructive">{error}</p>}

      {loading ? <div className="h-40 animate-pulse rounded-xl bg-secondary" /> : (
        <section className="surface p-5 sm:p-6">
          {!status && (
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h2 className="font-display text-lg">Not verified yet</h2>
                <p className="mt-1 text-sm text-muted-foreground">Have your passport or national ID ready. It takes about five minutes.</p>
              </div>
            </div>
          )}
          {status === "submitted" && (
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h2 className="font-display text-lg">Waiting for review</h2>
                <p className="mt-1 text-sm text-muted-foreground">Submitted {formatDateTime(application.submitted_at)} for {application.full_name}. An administrator will review it.</p>
              </div>
            </div>
          )}
          {verified && (
            <div>
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                  <BadgeCheck className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg">You're verified</h2>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Verified</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{identity.full_name ? `${identity.full_name}, your` : "Your"} identity is confirmed. You can now request your card.</p>
                </div>
              </div>
              <Button asChild className="mt-5"><Link to="/cards"><CreditCard className="h-4 w-4" aria-hidden="true" /> Go to my cards</Link></Button>
            </div>
          )}
          {status === "identity_checking" && (
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h2 className="font-display text-lg">Final identity check in progress</h2>
                <p className="mt-1 text-sm text-muted-foreground">Your details were approved and passed to our card issuer for a final check. This page shows "Verified" as soon as it clears.</p>
              </div>
            </div>
          )}
          {status === "identity_needs_changes" && (
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <h2 className="font-display text-lg">More information needed</h2>
                <p className="mt-1 text-sm text-muted-foreground">Our card issuer needs more information to confirm your identity. We'll contact you about what to send.</p>
              </div>
            </div>
          )}
          {status === "identity_declined" && (
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
              <div>
                <h2 className="font-display text-lg">Not approved</h2>
                <p className="mt-1 text-sm text-muted-foreground">Our card issuer could not confirm your identity. Please contact support.</p>
              </div>
            </div>
          )}
          {status === "approved" && (
            <div className="flex items-start gap-3">
              <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h2 className="font-display text-lg">Approved</h2>
                <p className="mt-1 text-sm text-muted-foreground">Your details are approved and are now going through a final identity check. Once that clears, you can request your card from the Cards page. Its number and CVV unlock as soon as your account is funded.</p>
              </div>
            </div>
          )}
          {status === "rejected" && (
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
              <div>
                <h2 className="font-display text-lg">Changes needed</h2>
                <p className="mt-1 text-sm text-muted-foreground">{application.review_note || "Your application was not approved."} Please correct it and submit again.</p>
              </div>
            </div>
          )}
          {canApply && !open && (
            <Button className="mt-5" onClick={() => setOpen(true)}>{status === "rejected" ? "Submit again" : "Start verification"}</Button>
          )}
        </section>
      )}

      <AddCardholderDialog
        inline
        mode="self"
        accountEmail={String(user?.email || "").toLowerCase()}
        open={open && canApply && !loading}
        onOpenChange={setOpen}
        onCreated={(created) => setApplication(created)}
      />
    </div>
  );
}
