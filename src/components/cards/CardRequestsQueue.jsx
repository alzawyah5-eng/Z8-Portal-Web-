import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CountrySelect from "@/components/forms/CountrySelect";
import Field from "@/components/forms/Field";
import { purposeLabel } from "@/lib/cardPurposes";
import { tierInfo } from "@/lib/tiers";

const COUNTRY_KEY = "z8.adminDeviceCountry";

const usd = (value) => `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

function savedCountry() {
  try { return localStorage.getItem(COUNTRY_KEY) || ""; } catch { return ""; }
}

function RequestRow({ row, country, account, onDone }) {
  const [amount, setAmount] = useState(String(row.amount ?? ""));
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(row.last_error || "");

  const run = async (action, payload) => {
    setBusy(action); setError("");
    try {
      const response = await base44.functions.invoke("photonpayCards", { action, payload: { requestId: row.id, ...payload } });
      if (response.data?.error) throw new Error(response.data.error);
      onDone();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "That did not go through.");
    } finally {
      setBusy("");
    }
  };

  const approve = () => {
    const value = Number(amount);
    if (!country) { setError("Select the country you are in now (top of this list)."); return; }
    if (!window.confirm(`Create ${row.client_name || "this client"}'s card loaded with ${usd(value)} from your USD account?`)) return;
    run("approve_card_request", { amount: value, gpsCountry: country });
  };

  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="font-medium">{row.client_name || "Client"}</p>
          <p className="truncate text-xs text-muted-foreground">{row.owner_email}</p>
          <p className="mt-1 text-sm">Requested <span className="num font-semibold">{usd(row.amount)}</span>
            <span className="text-muted-foreground">{row.requested_at ? ` · ${new Date(row.requested_at).toLocaleString()}` : ""}</span></p>
          {(row.tier || row.purpose) && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              {tierInfo(row.tier) && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: tierInfo(row.tier).gradient }}>{tierInfo(row.tier).name}</span>}
              {row.purpose && <span>For <span className="font-medium">{purposeLabel(row.purpose, row.purpose_detail)}</span></span>}
            </p>
          )}
          {account && (
            <p className="mt-1 text-xs text-muted-foreground">
              Client account: balance <span className="num font-medium text-foreground">{usd(account.balance)}</span> · can use up to <span className="num font-medium text-foreground">{usd(Number(account.available) + Number(row.amount || 0))}</span> for this card
            </p>
          )}
          {row.client_note && <p className="mt-1 text-xs text-muted-foreground">“{row.client_note}”</p>}
        </div>
        {!rejecting ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Load on card (USD)" className="sm:w-40">
              <Input type="number" inputMode="decimal" min="20" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="num" />
            </Field>
            <Button type="button" onClick={approve} disabled={Boolean(busy)}>
              {busy === "approve_card_request" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />} Approve and fund
            </Button>
            <Button type="button" variant="outline" onClick={() => setRejecting(true)} disabled={Boolean(busy)}><X className="h-4 w-4" aria-hidden="true" /> Reject</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Reason (shown to the client)" className="sm:w-72">
              <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Deposit not received yet" />
            </Field>
            <Button type="button" variant="destructive" onClick={() => run("reject_card_request", { note })} disabled={Boolean(busy)}>
              {busy === "reject_card_request" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Reject request
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRejecting(false)} disabled={Boolean(busy)}>Back</Button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
    </li>
  );
}

// Clients' card requests waiting for the administrator. Approving creates the
// Regular card at PhotonPay, loaded with the amount the client deposited.
export default function CardRequestsQueue({ onChanged }) {
  const [rows, setRows] = useState([]);
  const [country, setCountry] = useState(savedCountry);
  const [version, setVersion] = useState(0);
  const [accounts, setAccounts] = useState({});

  useEffect(() => {
    let active = true;
    base44.entities.CardRequest.filter({ status: "pending" }, { sort: "created_date", limit: 50 })
      .then((page) => { if (active) setRows(Array.isArray(page) ? page : page.items || []); })
      .catch(() => { if (active) setRows([]); });
    // Each client's balance, so the amount loaded matches what they deposited.
    base44.functions.invoke("photonpayCards", { action: "wallet_overview", payload: {} })
      .then((response) => { if (active) setAccounts(Object.fromEntries((response.data?.clients || []).map((client) => [client.email, client]))); })
      .catch(() => {});
    return () => { active = false; };
  }, [version]);

  const pickCountry = (value) => {
    setCountry(value);
    try { localStorage.setItem(COUNTRY_KEY, value); } catch { /* storage unavailable */ }
  };

  if (!rows.length) return null;

  return (
    <section className="surface" aria-labelledby="card-requests-title">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="card-requests-title" className="font-display text-lg">Card requests · {rows.length}</h2>
          <p className="mt-1 text-xs text-muted-foreground">Approve to create the card at PhotonPay loaded with that amount. It is paid from the client's account balance (Client funds), so a request can't use more than they deposited. Minimum 20 USD.</p>
        </div>
        <Field label="Country you are in now" className="sm:w-60">
          <CountrySelect value={country} onValueChange={pickCountry} placeholder="Select country" />
        </Field>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => <RequestRow key={row.id} row={row} country={country} account={accounts[String(row.owner_email || "").toLowerCase()]} onDone={() => { setVersion((v) => v + 1); onChanged?.(); }} />)}
      </ul>
    </section>
  );
}
