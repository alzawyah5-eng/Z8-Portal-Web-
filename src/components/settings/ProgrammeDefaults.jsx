import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import Field from "@/components/forms/Field";

const EMPTY = { client_requests_enabled: true, client_topups_enabled: true, max_cards_per_client: "1", default_max_on_daily: "", default_max_on_monthly: "", default_max_on_percent: "", min_opening_amount: "20", funding_instructions: "", tier_start_amount: "250", tier_plum_from: "10000", tier_crimson_from: "50000", tier_emerald_enabled: true, tier_plum_enabled: true, tier_crimson_enabled: true };

const toForm = (row) => ({
  client_requests_enabled: row?.client_requests_enabled !== false,
  client_topups_enabled: row?.client_topups_enabled !== false,
  max_cards_per_client: row?.max_cards_per_client ?? "1",
  default_max_on_daily: row?.default_max_on_daily ?? "",
  default_max_on_monthly: row?.default_max_on_monthly ?? "",
  default_max_on_percent: row?.default_max_on_percent ?? "",
  min_opening_amount: row?.min_opening_amount ?? "20",
  funding_instructions: row?.funding_instructions ?? "",
  tier_start_amount: row?.tier_start_amount ?? "250",
  tier_plum_from: row?.tier_plum_from ?? "10000",
  tier_crimson_from: row?.tier_crimson_from ?? "50000",
  tier_emerald_enabled: row?.tier_emerald_enabled !== false,
  tier_plum_enabled: row?.tier_plum_enabled !== false,
  tier_crimson_enabled: row?.tier_crimson_enabled !== false,
});

const num = (value) => (value === "" || value === null || value === undefined ? null : Math.max(0, Number(value)) || null);

// Settings for the Regular card a verified client can request.
export default function ProgrammeDefaults() {
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    base44.entities.ProgrammeSettings.list({ limit: 1 })
      .then((page) => { const row = (Array.isArray(page) ? page : page.items || [])[0] || null; setRecord(row); setForm(toForm(row)); })
      .catch(() => {});
  }, []);

  const set = (key) => (e) => setForm((current) => ({ ...current, [key]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setMessage("");
    const data = {
      client_requests_enabled: Boolean(form.client_requests_enabled),
      client_topups_enabled: Boolean(form.client_topups_enabled),
      max_cards_per_client: Math.max(1, Math.floor(Number(form.max_cards_per_client) || 1)),
      default_max_on_daily: num(form.default_max_on_daily),
      default_max_on_monthly: num(form.default_max_on_monthly),
      default_max_on_percent: num(form.default_max_on_percent),
      min_opening_amount: Math.max(20, num(form.min_opening_amount) ?? 20),
      funding_instructions: String(form.funding_instructions || "").slice(0, 3000),
      tier_start_amount: num(form.tier_start_amount) ?? 250,
      tier_plum_from: num(form.tier_plum_from) ?? 10000,
      tier_crimson_from: num(form.tier_crimson_from) ?? 50000,
      tier_emerald_enabled: Boolean(form.tier_emerald_enabled),
      tier_plum_enabled: Boolean(form.tier_plum_enabled),
      tier_crimson_enabled: Boolean(form.tier_crimson_enabled),
    };
    try {
      const saved = record ? await base44.entities.ProgrammeSettings.update(record.id, data) : await base44.entities.ProgrammeSettings.create(data);
      setRecord(saved || { ...record, ...data });
      setMessage("Saved.");
    } catch (error) {
      setMessage(error?.response?.data?.error || error.message);
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} className="surface">
      <div className="border-b border-border px-5 py-4">
        <div className="text-[13px] font-medium uppercase tracking-[0.18em]">Client card requests</div>
        <p className="mt-1 text-[11px] text-muted-foreground">Once a client is approved by you and by PhotonPay, they can request a Regular card from their Cards page with the amount they deposited (at least the minimum below). You approve each request under Cards; the card is then created at PhotonPay loaded with that amount, and the client can see its details straight away.</p>
      </div>
      <div className="space-y-4 px-5 py-4">
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>Verified clients can request a card</span>
          <Switch checked={form.client_requests_enabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, client_requests_enabled: checked }))} />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>Clients can add credit to their cards from their balance</span>
          <Switch checked={form.client_topups_enabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, client_topups_enabled: checked }))} />
        </label>
        <Field label="Cards per client" hint="How many cards (not cancelled) one client can request.">
          <Input type="number" min="1" step="1" value={form.max_cards_per_client} onChange={set("max_cards_per_client")} className="num sm:w-32" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Daily limit (USD)" hint="Blank for none."><Input type="number" min="1" value={form.default_max_on_daily} onChange={set("default_max_on_daily")} className="num" /></Field>
          <Field label="Monthly limit (USD)" hint="Blank for none."><Input type="number" min="1" value={form.default_max_on_monthly} onChange={set("default_max_on_monthly")} className="num" /></Field>
          <Field label="Per payment (USD)" hint="Blank for none."><Input type="number" min="1" value={form.default_max_on_percent} onChange={set("default_max_on_percent")} className="num" /></Field>
        </div>
        <Field label="Minimum opening amount (USD)" hint="Clients see this when they request a card. PhotonPay will not create a Regular card with less than 20 USD.">
          <Input type="number" min="20" step="0.01" value={form.min_opening_amount} onChange={set("min_opening_amount")} className="num sm:w-48" />
        </Field>
        <div>
          <p className="text-[13px] font-medium">Card tiers</p>
          <p className="mb-2 text-xs text-muted-foreground">Switch on the cards the app offers. A client's tier follows the total they have deposited (confirmed deposits; it never drops); they can request any offered card at or below it. If a client qualifies for a card that's off, they get the highest offered one below it.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[["emerald", "Emerald", "tier_start_amount", "#00583F"], ["plum", "Plum", "tier_plum_from", "#51082F"], ["crimson", "Crimson", "tier_crimson_from", "#A00918"]].map(([id, name, amountKey, color]) => {
              const enabledKey = `tier_${id}_enabled`;
              const on = form[enabledKey];
              return (
                <div key={id} className={`space-y-3 rounded-2xl border border-border p-3 ${on ? "" : "bg-muted/40"}`}>
                  <label className="flex items-center justify-between gap-3 text-sm font-medium">
                    <span className="flex items-center gap-2"><span className="h-3 w-5 rounded-sm" style={{ background: color }} aria-hidden="true" />{name}</span>
                    <Switch checked={on} onCheckedChange={(checked) => setForm((current) => ({ ...current, [enabledKey]: checked }))} aria-label={`Offer the ${name} card`} />
                  </label>
                  <Field label="From (USD deposited)" hint={on ? (id === "emerald" ? "Needed for the first card." : undefined) : "Not offered in the app."}>
                    <Input type="number" min="1" step="1" value={form[amountKey]} onChange={set(amountKey)} className="num" disabled={!on} />
                  </Field>
                </div>
              );
            })}
          </div>
          {!form.tier_emerald_enabled && !form.tier_plum_enabled && !form.tier_crimson_enabled && (
            <p role="status" className="mt-2 text-xs text-amber-700">All tiers are off: clients can't request cards until you switch one on.</p>
          )}
        </div>
        <Field label="How clients fund their account" hint="Shown to verified clients under “How to fund your account”: your bank details, the reference to use, where to pay cash. Confirm each deposit under Client funds.">
          <Textarea rows={5} maxLength={3000} value={form.funding_instructions} onChange={set("funding_instructions")} placeholder={"Bank: …\nAccount name: …\nIBAN: …\nReference: your email address"} />
        </Field>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
          {message && <span role="status" className="text-sm text-muted-foreground">{message}</span>}
        </div>
      </div>
    </form>
  );
}
