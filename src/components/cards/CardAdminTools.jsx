import React, { useState } from "react";
import { FlaskConical, Loader2, Settings2, Wallet } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Field from "@/components/forms/Field";
import ResponsiveSelect from "@/components/forms/ResponsiveSelect";

const LIMIT_MODES = [
  { value: "none", label: "Keep the current limit" },
  { value: "increase", label: "Increase the spending limit by…" },
  { value: "decrease", label: "Decrease the spending limit by…" },
  { value: "unlimited", label: "Remove the spending limit" },
];

const TXN_TYPES = [
  { value: "auth", label: "Payment (auth)" },
  { value: "void", label: "Void a payment" },
  { value: "refund", label: "Refund a payment" },
];

async function call(action, payload) {
  const response = await base44.functions.invoke("photonpayCards", { action, payload });
  if (response.data?.error) throw new Error(response.data.error);
  return response.data;
}

// Funds a Regular card after the client has paid you: PhotonPay quotes the
// transfer from your USD account (fee, amount arriving), then it is confirmed.
function TopUpPanel({ card, onUpdated, onActivity }) {
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const locked = card.auto_issued && !card.funded_at;

  const getQuote = async (e) => {
    e.preventDefault();
    setBusy("quote"); setMessage(""); setQuote(null);
    try {
      const data = await call("top_up_quote", { recordId: card.id, amount });
      setQuote({ ...data, received: Date.now() });
    } catch (error) {
      setMessage(error?.response?.data?.error || error.message);
    } finally { setBusy(""); }
  };

  const confirm = async () => {
    setBusy("confirm"); setMessage("");
    try {
      const data = await call("top_up_confirm", { recordId: card.id, requestId: quote.request_id });
      setQuote(null); setAmount("");
      onUpdated?.({ ...(data.balance != null ? { balance: data.balance } : {}), ...(data.unlocked ? { funded_at: new Date().toISOString() } : {}) });
      setMessage(`Topped up${data.arrival_amount != null ? ` · ${data.arrival_amount} ${card.currency || "USD"} added` : ""}${data.balance != null ? ` · balance ${data.balance} ${card.currency || "USD"}` : ""}.${data.unlocked ? " The client can now see their card details." : ""}`);
      onActivity?.();
    } catch (error) {
      setMessage(error?.response?.data?.error || error.message);
    } finally { setBusy(""); }
  };

  const expired = quote?.valid_seconds && Date.now() - quote.received > quote.valid_seconds * 1000;

  return (
    <form onSubmit={getQuote} className="surface space-y-4 p-5 sm:p-6 lg:col-span-2">
      <div className="flex items-center gap-2"><Wallet className="h-4 w-4" aria-hidden="true" /><h2 className="font-display text-lg">Top up</h2></div>
      <p className="text-sm text-muted-foreground">
        Load money onto this card. For a client's card it is paid from their account balance (record their deposit under Client funds first); PhotonPay's fee comes out of the amount.
        {locked ? " This card was issued automatically and its details stay hidden from the client until its first top-up." : ""}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label={`Amount to load (${card.currency || "USD"})`} className="sm:w-64">
          <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setQuote(null); }} className="num" required />
        </Field>
        <Button type="submit" variant="outline" disabled={Boolean(busy)}>{busy === "quote" && <Loader2 className="h-4 w-4 animate-spin" />} Get quote</Button>
      </div>
      {quote && (
        <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm">
          <p>From your account: <span className="num font-medium">{quote.recharge_amount} {quote.currency}</span>
            {quote.fee != null ? <> · Fee <span className="num">{quote.fee} {quote.currency}</span></> : null}
            {quote.arrival_amount != null ? <> · Arrives on card: <span className="num font-medium">{quote.arrival_amount} {quote.currency}</span></> : null}</p>
          {quote.valid_seconds ? <p className="mt-1 text-xs text-muted-foreground">PhotonPay holds this quote for {quote.valid_seconds} seconds.</p> : null}
          <div className="mt-3 flex gap-2">
            {expired
              ? <Button type="submit" size="sm" variant="outline" disabled={Boolean(busy)}>Quote expired · get a new one</Button>
              : <Button type="button" size="sm" onClick={confirm} disabled={Boolean(busy)}>{busy === "confirm" && <Loader2 className="h-4 w-4 animate-spin" />} Confirm top-up</Button>}
            <Button type="button" size="sm" variant="ghost" onClick={() => setQuote(null)} disabled={Boolean(busy)}>Cancel</Button>
          </div>
        </div>
      )}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </form>
  );
}

// Administrator tools on a live card: rename and adjust its overall spending
// limit (PhotonPay updateCard), and sandbox-only test transactions.
export default function CardAdminTools({ card, transactions = [], onUpdated, onActivity }) {
  const [nickname, setNickname] = useState(card.nickname || "");
  const [limitMode, setLimitMode] = useState("none");
  const [limitAmount, setLimitAmount] = useState("");
  const [txnType, setTxnType] = useState("auth");
  const [txnAmount, setTxnAmount] = useState("10");
  const [merchant, setMerchant] = useState("Z8 sandbox test");
  const [mcc, setMcc] = useState("5999");
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState({ settings: "", test: "" });
  const live = Boolean(card.photon_card_id);
  const cancelled = card.status === "cancelled";
  const payments = transactions.filter((item) => item.photon_txn_id && item.kind === "spend");

  const say = (key, text) => setMessage((current) => ({ ...current, [key]: text }));

  const saveSettings = async (e) => {
    e.preventDefault();
    const payload = { recordId: card.id };
    if (nickname.trim() && nickname.trim() !== card.nickname) payload.nickname = nickname.trim();
    if (limitMode === "unlimited") payload.transactionLimitType = "unlimited";
    if (limitMode === "increase" || limitMode === "decrease") {
      payload.transactionLimitType = "limited";
      payload.transactionLimitChangeType = limitMode;
      payload.transactionLimit = limitAmount;
    }
    if (!payload.nickname && !payload.transactionLimitType) { say("settings", "Nothing to change."); return; }
    setBusy("settings");
    say("settings", "");
    try {
      const data = await call("update_card", payload);
      onUpdated?.({ nickname: data.nickname, transaction_limit_type: data.transaction_limit_type });
      setLimitMode("none");
      setLimitAmount("");
      say("settings", "Saved with PhotonPay" + (data.available_transaction_limit != null ? ` · available limit ${data.available_transaction_limit} ${card.currency || "USD"}` : "") + ".");
      onActivity?.();
    } catch (error) {
      say("settings", error?.response?.data?.error || error.message);
    } finally {
      setBusy("");
    }
  };

  const runTest = async (e) => {
    e.preventDefault();
    setBusy("test");
    say("test", "");
    try {
      const data = await call("sandbox_txn", { recordId: card.id, txnType, amount: txnAmount, merchantName: merchant, mcc, originTransactionId: txnType === "auth" ? "" : origin });
      say("test", `Sent (${data.request_id}). ${data.note}`);
      setTimeout(() => onActivity?.(), 8000);
    } catch (error) {
      say("test", error?.response?.data?.error || error.message);
    } finally {
      setBusy("");
    }
  };

  if (!live) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {card.card_type === "recharge" && !cancelled && <TopUpPanel card={card} onUpdated={onUpdated} onActivity={onActivity} />}
      <form onSubmit={saveSettings} className="surface space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-2"><Settings2 className="h-4 w-4" aria-hidden="true" /><h2 className="font-display text-lg">Card settings</h2></div>
        <p className="text-sm text-muted-foreground">Rename the card or change its overall spending limit with PhotonPay. Daily, monthly and per-payment caps are set when the card is issued.</p>
        <Field label="Card name">
          <Input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={50} />
        </Field>
        <Field label="Spending limit" hint={`Currently ${card.transaction_limit_type === "limited" ? "limited" : "unlimited"}.${cancelled ? " A cancelled card's limit can only be decreased." : ""}`}>
          <ResponsiveSelect value={limitMode} onValueChange={setLimitMode} options={LIMIT_MODES} placeholder="Spending limit" />
        </Field>
        {(limitMode === "increase" || limitMode === "decrease") && (
          <Field label={`Amount (${card.currency || "USD"})`}>
            <Input type="number" min="0.01" step="0.01" value={limitAmount} onChange={(e) => setLimitAmount(e.target.value)} className="num" required />
          </Field>
        )}
        {message.settings && <p role="status" className="text-sm text-muted-foreground">{message.settings}</p>}
        <Button type="submit" disabled={Boolean(busy)}>{busy === "settings" && <Loader2 className="h-4 w-4 animate-spin" />} Save changes</Button>
      </form>

      <form onSubmit={runTest} className="surface space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-2"><FlaskConical className="h-4 w-4" aria-hidden="true" /><h2 className="font-display text-lg">Sandbox test transaction</h2></div>
        <p className="text-sm text-muted-foreground">Sandbox only. Simulates a payment on this card so you can check webhooks, activity, the daily sync and decline alerts. No real money moves.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type"><ResponsiveSelect value={txnType} onValueChange={setTxnType} options={TXN_TYPES} placeholder="Type" /></Field>
          <Field label={`Amount (${card.currency || "USD"})`}><Input type="number" min="0.01" step="0.01" value={txnAmount} onChange={(e) => setTxnAmount(e.target.value)} className="num" required /></Field>
          <Field label="Merchant name"><Input value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={40} /></Field>
          <Field label="Merchant category (MCC)" hint="4 digits, e.g. 5999."><Input inputMode="numeric" value={mcc} onChange={(e) => setMcc(e.target.value.replace(/\D/g, "").slice(0, 4))} /></Field>
          {txnType !== "auth" && (
            <Field label="Original payment" className="sm:col-span-2" hint="The payment to void or refund.">
              {payments.length ? (
                <ResponsiveSelect value={origin} onValueChange={setOrigin} placeholder="Choose a payment"
                  options={payments.map((item) => ({ value: item.photon_txn_id, label: `${item.merchant || "Payment"} · ${item.amount} ${item.currency} · ${item.photon_txn_id}` }))} />
              ) : (
                <Input value={origin} onChange={(e) => setOrigin(e.target.value.trim())} placeholder="Transaction ID" />
              )}
            </Field>
          )}
        </div>
        {message.test && <p role="status" className="text-sm text-muted-foreground">{message.test}</p>}
        <Button type="submit" variant="outline" disabled={Boolean(busy) || cancelled}>{busy === "test" && <Loader2 className="h-4 w-4 animate-spin" />} Send test transaction</Button>
      </form>
    </div>
  );
}
