import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Pencil, Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ResponsiveSelect from "@/components/forms/ResponsiveSelect";
import StatusPill from "@/components/StatusPill";
import { COUNTRIES } from "@/lib/countries";
import { CARDUSER_STATUS, ID_TYPES, REVIEW_STATUS, cardUserStatus, needsAction, reviewStatus } from "@/lib/cardholderStatus";
import { cardTypeLabel } from "@/lib/cardTypes";

const COUNTRY = Object.fromEntries((COUNTRIES || []).map((c) => [c.code, c.name]));
const countryName = (code) => (code ? `${COUNTRY[code] || code}` : "—");
const date = (value) => (value ? String(value).replace("T", " ").slice(0, 16) : "—");

const STATUS_OPTIONS = [{ value: "all", label: "All statuses" }, ...Object.entries(CARDUSER_STATUS).filter(([k]) => k !== "rejected").map(([value, s]) => ({ value, label: s.label }))];
const REVIEW_OPTIONS = [{ value: "all", label: "All review statuses" }, ...Object.entries(REVIEW_STATUS).map(([value, s]) => ({ value, label: s.label }))];

function Detail({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right">{value || "—"}</span>
    </div>
  );
}

function toCsv(rows) {
  const head = ["Card user ID", "First name", "Last name", "Email", "Mobile", "Nationality", "Status", "Review status", "Reason", "Created (PhotonPay)", "Z8 account", "Cards"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [head, ...rows.map(({ holder, cards }) => [
    holder.photon_cardholder_id, holder.first_name, holder.last_name, holder.email, holder.phone, holder.nationality,
    cardUserStatus(holder).label, reviewStatus(holder).label, holder.review_reason, holder.photon_created_at,
    holder.owner_email || "", cards.length,
  ])].map((r) => r.map(esc).join(",")).join("\n");
}

// PhotonPay's card user list (Issuing → Card User), with the same fields and
// statuses, the portal's filters (card user ID, status, created time) plus
// search and review status, and each card user's Z8 account and cards.
export default function CardUsersTable({ holders, cards, onEdit }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [review, setReview] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actionOnly, setActionOnly] = useState(false);
  const [open, setOpen] = useState(null);

  const rows = useMemo(() => holders.map((holder) => ({ holder, cards: cards.filter((card) => card.cardholder_id === holder.id || (holder.photon_cardholder_id && card.photon_cardholder_id === holder.photon_cardholder_id)) })), [holders, cards]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(({ holder }) => {
      if (status !== "all" && cardUserStatus(holder).key !== status) return false;
      if (review !== "all" && reviewStatus(holder).key !== review) return false;
      if (actionOnly && !needsAction(holder)) return false;
      const created = String(holder.photon_created_at || holder.created_date || "").slice(0, 10);
      if (from && created && created < from) return false;
      if (to && created && created > to) return false;
      if (!q) return true;
      return [holder.photon_cardholder_id, holder.full_name, holder.email, holder.owner_email, holder.phone, holder.nationality]
        .some((v) => String(v || "").toLowerCase().includes(q));
    }).sort((a, b) => String(b.holder.photon_created_at || b.holder.created_date || "").localeCompare(String(a.holder.photon_created_at || a.holder.created_date || "")));
  }, [rows, query, status, review, from, to, actionOnly]);

  const actionCount = rows.filter(({ holder }) => needsAction(holder)).length;
  const filtersOn = query || status !== "all" || review !== "all" || from || to || actionOnly;

  const exportCsv = () => {
    const blob = new Blob(["﻿" + toCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `card-users-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const selected = open ? rows.find((r) => r.holder.id === open) : null;

  return (
    <section className="space-y-4">
      <div className="surface space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto_auto]">
          <label className="relative block">
            <span className="sr-only">Search card users</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Card user ID, name, email or mobile" className="pl-9" />
          </label>
          <ResponsiveSelect value={status} onValueChange={setStatus} options={STATUS_OPTIONS} placeholder="Status" />
          <ResponsiveSelect value={review} onValueChange={setReview} options={REVIEW_OPTIONS} placeholder="Review status" />
          <label className="flex items-center gap-2 text-sm"><span className="shrink-0 text-muted-foreground">Created</span><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Created from" className="w-[9.5rem]" /></label>
          <label className="flex items-center gap-2 text-sm"><span className="shrink-0 text-muted-foreground">to</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Created to" className="w-[9.5rem]" /></label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setActionOnly((v) => !v)} className={"min-h-9 rounded-full border px-3 text-xs font-medium " + (actionOnly ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
              Needs action · {actionCount}
            </button>
            {filtersOn && <button type="button" onClick={() => { setQuery(""); setStatus("all"); setReview("all"); setFrom(""); setTo(""); setActionOnly(false); }} className="inline-flex min-h-9 items-center gap-1 text-xs text-muted-foreground underline"><X className="h-3 w-3" /> Clear filters</button>}
            <span className="text-xs text-muted-foreground">{filtered.length} of {rows.length} card users</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}><Download className="h-3.5 w-3.5" /> Export CSV</Button>
        </div>
      </div>

      {filtered.length ? (
        <>
          {/* Desktop: the portal's columns */}
          <div className="surface hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Card user ID</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email / Mobile</th>
                  <th className="px-4 py-3 font-medium">Nationality</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Review status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Z8</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(({ holder, cards: holderCards }) => {
                  const s = cardUserStatus(holder); const r = reviewStatus(holder);
                  return (
                    <tr key={holder.id} onClick={() => setOpen(holder.id)} className="cursor-pointer hover:bg-secondary/50">
                      <td className="num px-4 py-3 text-xs">{holder.photon_cardholder_id || "—"}</td>
                      <td className="px-4 py-3 font-medium">{holder.full_name}{holder.is_legal === "Y" && <span className="ml-1.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-normal">Company</span>}</td>
                      <td className="px-4 py-3"><div className="break-all">{holder.email || "—"}</div><div className="text-xs text-muted-foreground">{holder.phone || ""}</div></td>
                      <td className="px-4 py-3">{countryName(holder.nationality)}</td>
                      <td className="px-4 py-3"><StatusPill status={s.tone} label={s.label} /></td>
                      <td className="px-4 py-3"><StatusPill status={r.tone} label={r.label} />{holder.review_reason && <div className="mt-1 max-w-[14rem] truncate text-xs text-muted-foreground" title={holder.review_reason}>{holder.review_reason}</div>}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">{date(holder.photon_created_at || holder.created_date)}</td>
                      <td className="px-4 py-3 text-xs">{holderCards.length ? `${holderCards.length} card${holderCards.length > 1 ? "s" : ""}` : "No card"}{holder.owner_email ? <div className="break-all text-muted-foreground">{holder.owner_email}</div> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Phone / tablet: one card per card user */}
          <div className="surface divide-y divide-border lg:hidden">
            {filtered.map(({ holder, cards: holderCards }) => {
              const s = cardUserStatus(holder); const r = reviewStatus(holder);
              return (
                <button key={holder.id} type="button" onClick={() => setOpen(holder.id)} className="block w-full px-4 py-4 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{holder.full_name}</div>
                      <div className="num mt-0.5 text-[11px] text-muted-foreground">{holder.photon_cardholder_id}</div>
                      <div className="mt-1 break-all text-xs text-muted-foreground">{holder.email}{holder.phone ? ` · ${holder.phone}` : ""}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1"><StatusPill status={s.tone} label={s.label} /><StatusPill status={r.tone} label={r.label} /></div>
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">Created {date(holder.photon_created_at || holder.created_date)} · {holderCards.length ? `${holderCards.length} card${holderCards.length > 1 ? "s" : ""}` : "No card"}</div>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="surface px-6 py-12 text-center">
          <h2 className="font-display text-xl">{rows.length ? "No card users match these filters" : "No card users yet"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{rows.length ? "Change or clear the filters." : "Approve an application, use Add client, or register them in the PhotonPay portal and sync."}</p>
        </div>
      )}

      <Sheet open={Boolean(selected)} onOpenChange={(next) => { if (!next) setOpen(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected && (() => {
            const { holder, cards: holderCards } = selected;
            const s = cardUserStatus(holder); const r = reviewStatus(holder);
            return (
              <>
                <SheetHeader>
                  <SheetDescription className="num">{holder.photon_cardholder_id}</SheetDescription>
                  <SheetTitle className="font-display text-2xl">{holder.full_name}</SheetTitle>
                </SheetHeader>
                <div className="mt-3 flex flex-wrap gap-2"><StatusPill status={s.tone} label={s.label} /><StatusPill status={r.tone} label={r.label} /></div>
                {holder.review_reason && <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-sm">PhotonPay: {holder.review_reason}</p>}
                <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">PhotonPay card user</h3>
                <Detail label="First name" value={holder.first_name} />
                <Detail label="Last name" value={holder.last_name} />
                <Detail label="Type" value={holder.is_legal === "Y" ? "Legal person (company)" : holder.is_legal === "N" ? "Individual" : ""} />
                <Detail label="Email" value={holder.email} />
                <Detail label="Mobile" value={holder.phone} />
                <Detail label="Date of birth" value={holder.date_of_birth} />
                <Detail label="Nationality" value={countryName(holder.nationality)} />
                <Detail label="Billing address" value={[holder.address_line, holder.city, holder.state, holder.postal_code, holder.country && countryName(holder.country)].filter(Boolean).join(", ")} />
                <Detail label="ID document" value={[ID_TYPES[holder.cert_type], holder.cert_id, holder.cert_country && countryName(holder.cert_country)].filter(Boolean).join(" · ")} />
                <Detail label="ID review required" value={holder.id_info_requirement === "Y" ? "Yes" : holder.id_info_requirement === "N" ? "No" : ""} />
                <Detail label="Created" value={date(holder.photon_created_at)} />
                <Detail label="Last synced" value={date(holder.synced_at)} />
                <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">In Z8</h3>
                <Detail label="Z8 account" value={holder.owner_email} />
                <Detail label="Card request" value={holder.auto_issue_status ? `${holder.auto_issue_status}${holder.auto_issue_note ? ` · ${holder.auto_issue_note}` : ""}` : ""} />
                <div className="mt-2 space-y-2">
                  {holderCards.length ? holderCards.map((card) => (
                    <Link key={card.id} to={`/cards/${card.id}`} className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-secondary/50">
                      <span>{card.nickname} <span className="text-muted-foreground">· {cardTypeLabel(card.card_type)}{card.last4 ? ` · •••• ${card.last4}` : ""}</span></span>
                      <StatusPill status={card.status} />
                    </Link>
                  )) : <p className="text-sm text-muted-foreground">No card yet.</p>}
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  {holder.photon_cardholder_id && <Button type="button" variant="outline" size="sm" onClick={() => { setOpen(null); onEdit?.(holder); }}><Pencil className="h-3.5 w-3.5" /> Edit at PhotonPay</Button>}
                  <Button asChild size="sm"><Link to="/cards?new=1"><Plus className="h-3.5 w-3.5" /> Virtual card</Link></Button>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </section>
  );
}
