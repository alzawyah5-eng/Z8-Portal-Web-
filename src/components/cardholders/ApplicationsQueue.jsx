import React, { useEffect, useState } from "react";
import { Check, Eye, Loader2, X } from "lucide-react";
import { z8 } from "@/api/z8Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { openPrivateFile } from "@/lib/openPrivateFile";

const ID_LABEL = { passport: "Passport", id_card: "National ID", resident_permit: "Residence permit" };

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right">{value || "—"}</span>
    </div>
  );
}

// Clients' own verification requests. Nothing reaches PhotonPay until an
// administrator approves one here.
export default function ApplicationsQueue({ onApproved }) {
  const [apps, setApps] = useState([]);
  const [busy, setBusy] = useState("");
  const [errors, setErrors] = useState({});
  const [rejecting, setRejecting] = useState("");
  const [note, setNote] = useState("");

  const load = async () => {
    const page = await z8.entities.CardholderApplication.filter({ status: "submitted" }, { sort: "-created_date", limit: 50 });
    setApps(Array.isArray(page) ? page : page.items || []);
  };

  useEffect(() => { load().catch(() => setApps([])); }, []);

  const call = async (app, action, payload = {}) => {
    setBusy(app.id + action);
    setErrors((current) => ({ ...current, [app.id]: "" }));
    try {
      const response = await z8.functions.invoke("photonpayCards", { action, payload: { applicationId: app.id, ...payload } });
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    } catch (err) {
      setErrors((current) => ({ ...current, [app.id]: err?.response?.data?.error || err.message }));
      return null;
    } finally {
      setBusy("");
    }
  };

  const viewPhoto = async (app, side) => {
    // Open the tab synchronously so pop-up blockers allow it, then point it at
    // the short-lived link.
    const tab = window.open("about:blank", "_blank");
    const data = await call(app, "application_photo", { side });
    if (data?.url) {
      try { await openPrivateFile(data.url, tab); }
      catch (error) { setErrors((current) => ({ ...current, [app.id]: error.message })); }
    } else tab?.close();
  };

  const approve = async (app) => {
    const data = await call(app, "approve_application");
    if (data) { await load(); onApproved?.(data, app); }
  };

  const reject = async (app) => {
    const data = await call(app, "reject_application", { note });
    if (data) { setRejecting(""); setNote(""); await load(); }
  };

  if (!apps.length) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-xl">Client applications · {apps.length}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Clients who verified themselves. Check the details and ID photos; approving sends them to PhotonPay.</p>
      </div>
      <div className="surface divide-y divide-border">
        {apps.map((app) => (
          <div key={app.id} className="space-y-4 px-5 py-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <div className="text-sm font-medium">{app.first_name} {app.last_name}</div>
              <div className="text-xs text-muted-foreground">{app.owner_email} · submitted {formatDateTime(app.submitted_at)}</div>
            </div>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <div>
                <Row label="Date of birth" value={app.date_of_birth} />
                <Row label="Nationality" value={app.nationality} />
                <Row label="Email" value={app.email} />
                <Row label="Mobile" value={app.mobile ? `${app.mobile_prefix} ${app.mobile}` : ""} />
              </div>
              <div>
                <Row label="Address" value={[app.address_line, app.city, app.state, app.postal_code, app.country].filter(Boolean).join(", ")} />
                <Row label="ID" value={`${ID_LABEL[app.cert_type] || app.cert_type} · ${app.cert_country}`} />
                <Row label="ID number" value={app.cert_id} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => viewPhoto(app, "front")} disabled={Boolean(busy)}><Eye className="h-3.5 w-3.5" /> {app.cert_type === "passport" ? "Photo page" : "Front"}</Button>
              {app.back_file_uri && <Button type="button" variant="outline" size="sm" onClick={() => viewPhoto(app, "back")} disabled={Boolean(busy)}><Eye className="h-3.5 w-3.5" /> Back</Button>}
            </div>
            {app.last_error && <p className="text-xs text-destructive">Last attempt failed: {app.last_error}</p>}
            {errors[app.id] && <p role="alert" className="text-sm text-destructive">{errors[app.id]}</p>}
            {rejecting === app.id ? (
              <div className="space-y-2">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="What should the client correct? They will see this note." />
                <div className="flex gap-2">
                  <Button type="button" variant="destructive" size="sm" onClick={() => reject(app)} disabled={!note.trim() || Boolean(busy)}>
                    {busy === app.id + "reject_application" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Reject
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setRejecting(""); setNote(""); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => approve(app)} disabled={Boolean(busy)}>
                  {busy === app.id + "approve_application" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {busy === app.id + "approve_application" ? "Sending to PhotonPay…" : "Approve & send to PhotonPay"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(app.id)} disabled={Boolean(busy)}>Reject…</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
