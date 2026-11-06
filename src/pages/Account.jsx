import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowLeft, Paperclip, Plus } from "lucide-react";
import { openProof } from "@/lib/proofFile";
import { tierInfo } from "@/lib/tiers";
import { Button } from "@/components/ui/button";
import StatusPill from "@/components/StatusPill";
import AddFundsDialog from "@/components/funds/AddFundsDialog";
import useClientAccount from "@/components/funds/useClientAccount";
import PushTestCard from "@/components/notifications/PushTestCard";
import { cn } from "@/lib/utils";
import { ENTRY_KINDS, ENTRY_STATUS, entryDate, methodLabel, signedUsd, usd } from "@/lib/funds";

// The client's card tier: where they are and what the next one needs.
function TierProgress({ wallet }) {
  const ladder = wallet.ladder || [];
  if (!ladder.length) return null;
  const current = tierInfo(wallet.tier);
  const next = wallet.next_tier;
  const floor = current ? ladder.find((step) => step.id === wallet.tier)?.from || 0 : 0;
  const progress = next ? Math.min(100, Math.max(0, ((wallet.deposited - floor) / Math.max(1, next.from - floor)) * 100)) : 100;
  return (
    <section className="surface overflow-hidden" aria-labelledby="tier-title">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <span className="block aspect-[1.586/1] w-24 shrink-0 rounded-xl shadow" style={{ background: current?.gradient || "linear-gradient(135deg,#d4d4d8,#a1a1aa)" }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="tier-title" className="font-display text-lg">{current ? `${current.name} tier` : "No card tier yet"}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">You've deposited <span className="num font-semibold text-foreground">{usd(wallet.deposited)}</span> in total.</p>
          {next ? (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label={`Progress to ${next.name}`}>
                <div className="h-full rounded-full" style={{ width: `${progress}%`, background: tierInfo(next.id)?.base }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Deposit <span className="num font-semibold text-foreground">{usd(next.remaining)}</span> more to unlock <span className="font-semibold text-foreground">{next.name}</span>.</p>
            </>
          ) : <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">You've reached the highest tier.</p>}
        </div>
      </div>
      <ol className="grid divide-x divide-border border-t border-border text-center" style={{ gridTemplateColumns: `repeat(${ladder.length}, minmax(0, 1fr))` }}>
        {ladder.map((step) => {
          const reached = (wallet.eligible_tiers || []).includes(step.id);
          return (
            <li key={step.id} className={cn("px-2 py-3", !reached && "opacity-60")}>
              <span className="mx-auto mb-1.5 block h-2.5 w-8 rounded-full" style={{ background: tierInfo(step.id)?.base }} aria-hidden="true" />
              <div className="text-xs font-semibold">{step.name}</div>
              <div className="num text-[11px] text-muted-foreground">from {usd(step.from)}</div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// The client's account with Z8: balance and every movement.
export default function Account() {
  const account = useClientAccount();
  const { loading, error, wallet, verified, min, reload } = account;
  const [funding, setFunding] = useState(false);
  const [proofError, setProofError] = useState("");
  const entries = wallet?.entries || [];

  return (
    <div className="space-y-6">
      <header className="page-header flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/cards" className="mb-3 hidden items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground md:inline-flex"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Your cards</Link>
          <h1 className="font-display">Your account</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">Money you deposited with us. New cards and top-ups are paid from it.</p>
        </div>
        {verified && <Button type="button" onClick={() => setFunding(true)} className="self-start sm:self-end"><Plus className="h-4 w-4" aria-hidden="true" /> Add funds</Button>}
      </header>

      {error && <p role="alert" className="rounded-2xl border border-destructive/25 px-4 py-3 text-sm text-destructive">{error}</p>}
      <PushTestCard />
      {loading && <div className="h-28 animate-pulse rounded-[22px] bg-muted" />}

      {!loading && !verified && (
        <div className="surface px-5 py-6 text-sm">
          Verify your identity first; then you can add funds and request cards. <Link to="/verification" className="font-medium text-primary underline-offset-2 hover:underline">Verify now</Link>
        </div>
      )}

      {!loading && verified && wallet && (
        <>
          <div className="surface grid grid-cols-3 divide-x divide-border text-center">
            {[["Balance", wallet.balance, ""], ["Set aside", wallet.held, "text-muted-foreground"], ["Available", wallet.available, wallet.available >= min ? "text-emerald-700 dark:text-emerald-400" : ""]].map(([label, value, tone]) => (
              <div key={label} className="px-2 py-5">
                <div className="label-eyebrow">{label}</div>
                <div className={cn("num mt-2 text-base font-semibold sm:text-xl", tone)}>{usd(value)}</div>
              </div>
            ))}
          </div>
          {wallet.held > 0 && <p className="-mt-3 text-xs text-muted-foreground">Set aside: reserved for your card request until we approve it.</p>}

          <TierProgress wallet={wallet} />

          <section className="surface overflow-hidden" aria-labelledby="movements-title">
            <h2 id="movements-title" className="border-b border-border px-5 py-4 font-display text-lg">Movements</h2>
            {proofError && <p role="alert" className="border-b border-border px-5 py-2 text-xs text-destructive">{proofError}</p>}
            {entries.length ? (
              <ul className="divide-y divide-border">
                {entries.map((entry) => {
                  const state = ENTRY_STATUS[entry.status] || ENTRY_STATUS.completed;
                  const positive = entry.amount > 0;
                  return (
                    <li key={entry.id} className="flex items-start gap-3 px-5 py-3.5">
                      <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", positive ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground")}>
                        <ArrowDownLeft className={cn("h-4 w-4", !positive && "rotate-180")} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-medium">{ENTRY_KINDS[entry.kind] || "Movement"}{entry.method ? ` · ${methodLabel(entry.method)}` : ""}</span>
                          {entry.status !== "completed" && <StatusPill status={state.status} label={state.label} />}
                        </div>
                        <p className="mt-0.5 break-words text-xs text-muted-foreground">{[entryDate(entry.date), entry.reference, entry.note].filter(Boolean).join(" · ")}</p>
                        {entry.has_proof && (
                          <button type="button" data-compact onClick={() => openProof(entry.id).catch((err) => setProofError(err.message))} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                            <Paperclip className="h-3 w-3" aria-hidden="true" /> View proof
                          </button>
                        )}
                      </div>
                      <span className={cn("num shrink-0 text-sm font-semibold", entry.status !== "completed" ? "text-muted-foreground" : positive && "text-emerald-700 dark:text-emerald-400")}>{signedUsd(entry.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-muted-foreground">No movements yet.</p>
                <Button type="button" variant="outline" className="mt-4" onClick={() => setFunding(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Add funds</Button>
              </div>
            )}
          </section>
        </>
      )}

      <AddFundsDialog open={funding} onOpenChange={setFunding} instructions={wallet?.funding_instructions || ""} min={min} onReported={reload} />
    </div>
  );
}
