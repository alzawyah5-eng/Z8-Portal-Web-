import React, { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Paperclip, Plus, RefreshCw, Search, X } from "lucide-react";
import ProofPicker from "@/components/funds/ProofPicker";
import { openProof, uploadProof } from "@/lib/proofFile";
import { tierInfo } from "@/lib/tiers";
import { z8 } from "@/api/z8Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import Field from "@/components/forms/Field";
import ResponsiveSelect from "@/components/forms/ResponsiveSelect";
import StatusPill from "@/components/StatusPill";
import { cn } from "@/lib/utils";
import { DEPOSIT_METHODS, ENTRY_KINDS, ENTRY_STATUS, entryDate, methodLabel, signedUsd, usd } from "@/lib/funds";

function TierBadge({ tier }) {
  const info = tierInfo(tier);
  return info
    ? <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: info.gradient }}>{info.name}</span>
    : <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">No tier</span>;
}

const call = async (action, payload = {}) => {
  const response = await z8.functions.invoke("photonpayCards", { action, payload });
  if (response.data?.error) throw new Error(response.data.error);
  return response.data;
};
const errorText = (err, fallback) => err?.response?.data?.error || err?.message || fallback;

// A deposit a client says they sent: confirm it for what actually arrived, or reject it.
function PendingDeposit({ entry, onDone }) {
  const [amount, setAmount] = useState(String(entry.amount ?? ""));
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const review = async (decision) => {
    setBusy(decision); setError("");
    try {
      await call("wallet_review", decision === "confirm" ? { entryId: entry.id, decision, amount: Number(amount) } : { entryId: entry.id, decision, note });
      onDone();
    } catch (err) {
      setError(errorText(err, "That did not go through."));
    } finally {
      setBusy("");
    }
  };

  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="font-medium">{entry.client_name || entry.owner_email}</p>
          <p className="truncate text-xs text-muted-foreground">{entry.owner_email}</p>
          <p className="mt-1 text-sm">Says they sent <span className="num font-semibold">{usd(entry.amount)}</span> by {methodLabel(entry.method).toLowerCase() || "—"}</p>
          <p className="text-xs text-muted-foreground">{[entryDate(entry.date), entry.reference && `Ref ${entry.reference}`, entry.note && `“${entry.note}”`].filter(Boolean).join(" · ")}</p>
          {entry.has_proof ? (
            <button type="button" data-compact onClick={() => openProof(entry.id).catch((err) => setError(err.message))} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-primary hover:bg-secondary">
              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" /> View proof{entry.proof_type === "application/pdf" ? " (PDF)" : " (photo)"}
            </button>
          ) : <p className="mt-1 text-xs text-muted-foreground">No proof attached.</p>}
        </div>
        {!rejecting ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Amount received (USD)" className="sm:w-44">
              <Input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="num" />
            </Field>
            <Button type="button" onClick={() => review("confirm")} disabled={Boolean(busy)}>
              {busy === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />} Confirm received
            </Button>
            <Button type="button" variant="outline" onClick={() => setRejecting(true)} disabled={Boolean(busy)}><X className="h-4 w-4" aria-hidden="true" /> Not received</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Reason (shown to the client)" className="sm:w-72">
              <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. No transfer with this reference" />
            </Field>
            <Button type="button" variant="destructive" onClick={() => review("reject")} disabled={Boolean(busy)}>
              {busy === "reject" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Reject
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRejecting(false)} disabled={Boolean(busy)}>Back</Button>
          </div>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </li>
  );
}

// Money received from a client, entered by the administrator.
function RecordDeposit({ clients, presetEmail = "", onDone, onCancel }) {
  const [form, setForm] = useState({ ownerEmail: presetEmail, amount: "", method: "bank_transfer", reference: "", note: "", adminNote: "" });
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const options = clients.map((row) => ({ value: row.email, label: row.name ? `${row.name} · ${row.email}` : row.email }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const proofToken = proof ? await uploadProof(proof) : "";
      await call("wallet_record", { ...form, kind: "deposit", amount: Number(form.amount), ...(proofToken ? { proofToken, proofName: proof.name } : {}) });
      onDone(`Recorded ${usd(form.amount)} for ${form.ownerEmail}.`);
    } catch (err) {
      setError(errorText(err, "The deposit could not be recorded."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="surface space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg">Record money received</h2>
        <p className="mt-1 text-xs text-muted-foreground">A transfer or cash payment from a client. It is added to their balance straight away and they see it in their account.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client" className="sm:col-span-2">
          {options.length
            ? <ResponsiveSelect value={form.ownerEmail} onValueChange={(value) => setForm((current) => ({ ...current, ownerEmail: value }))} options={options} placeholder="Choose a client" />
            : <Input type="email" value={form.ownerEmail} onChange={set("ownerEmail")} placeholder="client@email.com" required />}
        </Field>
        <Field label="Amount received (USD)">
          <Input type="number" inputMode="decimal" min="0.01" step="0.01" required value={form.amount} onChange={set("amount")} className="num" />
        </Field>
        <Field label="Paid by">
          <ResponsiveSelect value={form.method} onValueChange={(value) => setForm((current) => ({ ...current, method: value }))} options={DEPOSIT_METHODS} />
        </Field>
        <Field label="Reference" hint="Bank reference, receipt number…">
          <Input value={form.reference} onChange={set("reference")} maxLength={120} />
        </Field>
        <Field label="Note for the client (optional)">
          <Input value={form.note} onChange={set("note")} maxLength={300} />
        </Field>
        <Field label="Internal note (optional)" hint="Only administrators see this." className="sm:col-span-2">
          <Input value={form.adminNote} onChange={set("adminNote")} maxLength={500} />
        </Field>
        <div className="sm:col-span-2">
          <ProofPicker value={proof} onChange={setProof} label="Proof (optional)" hint="Bank statement line, receipt or cash slip. The client can also see it." />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !form.ownerEmail}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Add to balance</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// One client's account: balance and every movement, with corrections.
function ClientLedger({ client, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [adjust, setAdjust] = useState({ amount: "", note: "", adminNote: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = () => call("wallet_client", { ownerEmail: client.email }).then(setData).catch((err) => setError(errorText(err, "Could not load this account.")));
  useEffect(() => { setData(null); setError(""); setMessage(""); load(); }, [client.email]);

  const saveAdjustment = async (event) => {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      await call("wallet_record", { ownerEmail: client.email, kind: "adjustment", amount: Number(adjust.amount), note: adjust.note, adminNote: adjust.adminNote });
      setAdjust({ amount: "", note: "", adminNote: "" });
      setMessage("Correction saved.");
      await load();
      onChanged();
    } catch (err) {
      setMessage(errorText(err, "The correction could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-xl">{client.name || client.email}</SheetTitle>
          <SheetDescription className="break-all">{client.email}</SheetDescription>
        </SheetHeader>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        {!data && !error && <div className="mt-6 h-32 animate-pulse rounded-2xl bg-muted" />}
        {data && (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border text-center">
              {[["Balance", data.balance], ["Held", data.held], ["Available", data.available]].map(([label, value]) => (
                <div key={label} className="px-2 py-3"><div className="label-eyebrow">{label}</div><div className="num mt-1 text-sm font-semibold">{usd(value)}</div></div>
              ))}
            </div>
            {data.ladder && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <TierBadge tier={data.tier} /> {usd(data.deposited)} deposited in total{data.next_tier ? ` · ${usd(data.next_tier.remaining)} to ${data.next_tier.name}` : " · highest tier"}
              </p>
            )}
            {data.held > 0 && <p className="text-xs text-muted-foreground">Held for {data.holds.length} card request{data.holds.length === 1 ? "" : "s"} waiting for your approval (Cards page).</p>}

            <div>
              <h3 className="mb-2 text-sm font-semibold">Movements</h3>
              {data.entries.length ? (
                <ul className="divide-y divide-border rounded-2xl border border-border">
                  {data.entries.map((entry) => {
                    const state = ENTRY_STATUS[entry.status] || ENTRY_STATUS.completed;
                    return (
                      <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{ENTRY_KINDS[entry.kind] || entry.kind}{entry.method ? ` · ${methodLabel(entry.method)}` : ""}</span>
                            <StatusPill status={state.status} label={state.label} />
                          </div>
                          <p className="mt-0.5 break-words text-xs text-muted-foreground">
                            {[entryDate(entry.date), entry.reference && `Ref ${entry.reference}`, entry.note, entry.reported_by === "client" && "reported by client", entry.recorded_by && `by ${entry.recorded_by}`].filter(Boolean).join(" · ")}
                          </p>
                          {entry.admin_note && <p className="mt-0.5 text-xs italic text-muted-foreground">Internal: {entry.admin_note}</p>}
                          {entry.has_proof && (
                            <button type="button" data-compact onClick={() => openProof(entry.id).catch((err) => setMessage(err.message))} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                              <Paperclip className="h-3 w-3" aria-hidden="true" /> View proof
                            </button>
                          )}
                        </div>
                        <span className={cn("num shrink-0 text-sm font-semibold", entry.status !== "completed" ? "text-muted-foreground" : entry.amount > 0 ? "text-emerald-700 dark:text-emerald-400" : "")}>{signedUsd(entry.amount)}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="text-sm text-muted-foreground">No movements yet.</p>}
            </div>

            <form onSubmit={saveAdjustment} className="space-y-3 rounded-2xl border border-border p-4">
              <div>
                <h3 className="text-sm font-semibold">Correct the balance</h3>
                <p className="text-xs text-muted-foreground">Positive adds, negative takes away (e.g. a bank charge). The client sees the reason.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
                <Field label="Amount (USD)"><Input type="number" inputMode="decimal" step="0.01" required value={adjust.amount} onChange={(e) => setAdjust((c) => ({ ...c, amount: e.target.value }))} className="num" /></Field>
                <Field label="Reason (shown to the client)"><Input required minLength={3} maxLength={300} value={adjust.note} onChange={(e) => setAdjust((c) => ({ ...c, note: e.target.value }))} /></Field>
              </div>
              <Field label="Internal note (optional)"><Input maxLength={500} value={adjust.adminNote} onChange={(e) => setAdjust((c) => ({ ...c, adminNote: e.target.value }))} /></Field>
              {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
              <Button type="submit" variant="outline" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save correction</Button>
            </form>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function ClientFunds() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    call("wallet_overview").then((result) => { if (active) { setData(result); setError(""); } })
      .catch((err) => { if (active) setError(errorText(err, "Client funds could not be loaded.")); });
    return () => { active = false; };
  }, [version]);

  const reload = () => setVersion((value) => value + 1);
  const clients = data?.clients || [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? clients.filter((row) => `${row.name} ${row.email}`.toLowerCase().includes(term)) : clients;
  }, [clients, search]);

  return (
    <div className="space-y-6">
      <header className="page-header flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Admin workspace</p>
          <h1 className="font-display">Client funds</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Money clients deposit with you, by transfer or cash. Their balance pays for new cards and top-ups; without one they cannot request a card.</p>
        </div>
        <div className="flex gap-2 self-start sm:self-end">
          <Button type="button" variant="outline" size="icon" onClick={reload} aria-label="Refresh"><RefreshCw className="h-4 w-4" aria-hidden="true" /></Button>
          <Button type="button" onClick={() => { setRecording((value) => !value); setNotice(""); }}><Plus className="h-4 w-4" aria-hidden="true" /> Record money received</Button>
        </div>
      </header>

      {notice && <p role="status" className="rounded-2xl border border-border bg-secondary/60 px-4 py-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="rounded-2xl border border-destructive/25 px-4 py-3 text-sm text-destructive">{error}</p>}

      {recording && (
        <RecordDeposit
          clients={clients}
          onCancel={() => setRecording(false)}
          onDone={(text) => { setRecording(false); setNotice(text); reload(); }}
        />
      )}

      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="surface px-5 py-4"><div className="label-eyebrow">Held for clients</div><div className="num mt-1.5 text-xl font-semibold">{usd(data.totals.held_for_clients)}</div></div>
          <div className="surface px-5 py-4"><div className="label-eyebrow">Deposits to confirm</div><div className="num mt-1.5 text-xl font-semibold">{data.totals.pending_count}</div></div>
          <div className="surface px-5 py-4"><div className="label-eyebrow">Clients</div><div className="num mt-1.5 text-xl font-semibold">{clients.length}</div></div>
        </div>
      )}

      {data?.pending_deposits?.length > 0 && (
        <section className="surface" aria-labelledby="pending-title">
          <div className="border-b border-border px-5 py-4">
            <h2 id="pending-title" className="font-display text-lg">Deposits to confirm · {data.pending_deposits.length}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Clients told you they sent these. Check your bank or cash book, then confirm what actually arrived.</p>
          </div>
          <ul className="divide-y divide-border">
            {data.pending_deposits.map((entry) => <PendingDeposit key={entry.id} entry={entry} onDone={reload} />)}
          </ul>
        </section>
      )}

      <section className="surface" aria-labelledby="clients-title">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="clients-title" className="font-display text-lg">Client balances</h2>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input aria-label="Search clients" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" className="pl-10" />
          </div>
        </div>
        {!data && !error && <div className="m-5 h-24 animate-pulse rounded-2xl bg-muted" />}
        {data && !filtered.length && <p className="px-5 py-6 text-sm text-muted-foreground">{clients.length ? "No client matches this search." : "No clients yet. Verified clients appear here."}</p>}
        {filtered.length > 0 && (
          <>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-5 py-2.5 font-medium">Client</th>
                    <th className="px-3 py-2.5 font-medium">Tier</th>
                    <th className="px-3 py-2.5 text-right font-medium">Deposited</th>
                    <th className="px-3 py-2.5 text-right font-medium">Balance</th>
                    <th className="px-3 py-2.5 text-right font-medium">Held</th>
                    <th className="px-3 py-2.5 text-right font-medium">Available</th>
                    <th className="px-3 py-2.5 font-medium">Last movement</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((row) => (
                    <tr key={row.email} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelected(row)}>
                      <td className="px-5 py-3">
                        <div className="font-medium">{row.name || row.email}</div>
                        <div className="text-xs text-muted-foreground">{row.email}{row.verified ? "" : " · not verified"}</div>
                      </td>
                      <td className="px-3 py-3"><TierBadge tier={row.tier} /></td>
                      <td className="num px-3 py-3 text-right text-muted-foreground">{usd(row.deposited)}</td>
                      <td className="num px-3 py-3 text-right font-semibold">{usd(row.balance)}</td>
                      <td className="num px-3 py-3 text-right text-muted-foreground">{usd(row.held)}</td>
                      <td className="num px-3 py-3 text-right">{usd(row.available)}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{entryDate(row.last_activity) || "—"}{row.pending_deposits ? <span className="ml-2"><StatusPill status="pending" label={`${row.pending_deposits} to confirm`} /></span> : null}</td>
                      <td className="px-5 py-3 text-right text-xs font-medium text-primary">Open</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border md:hidden">
              {filtered.map((row) => (
                <li key={row.email}>
                  <button type="button" onClick={() => setSelected(row)} className="flex w-full items-center gap-3 px-5 py-3 text-left">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{row.name || row.email}</div>
                      <div className="truncate text-xs text-muted-foreground">{row.email}</div>
                      <div className="mt-1"><TierBadge tier={row.tier} /></div>
                      {row.pending_deposits ? <div className="mt-1"><StatusPill status="pending" label={`${row.pending_deposits} to confirm`} /></div> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="num text-sm font-semibold">{usd(row.available)}</div>
                      <div className="text-[11px] text-muted-foreground">available</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {selected && <ClientLedger client={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </div>
  );
}
