import React, { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Plus, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import AddCardholderDialog from "@/components/cardholders/AddCardholderDialog";
import ApplicationsQueue from "@/components/cardholders/ApplicationsQueue";
import EditCardholderDialog from "@/components/cardholders/EditCardholderDialog";
import CardUsersTable from "@/components/cardholders/CardUsersTable";
import SignedUpList from "@/components/cardholders/SignedUpList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// PhotonPay's refusals are terse. Turn the two that have a known remedy into
// guidance; anything else is shown exactly as the provider worded it.
function explainSyncError(message) {
  const text = String(message || "");
  if (/does not have permission/i.test(text)) {
    const code = (text.match(/\(code ([^)]+)\)/) || [])[1];
    return "PhotonPay is authenticating this app but refuses its cardholder API. Enable the Issuing (cardholder) API permission for this App ID in the PhotonPay portal, then sync again. If it is already enabled, ask PhotonPay support to confirm the API IP allowlist includes this app's static relay address" + (code ? ", quoting code " + code : "") + ".";
  }
  if (/invalid token/i.test(text)) {
    return "PhotonPay rejected the access token. Run the connection check on the Connection page to request a fresh token, then sync again.";
  }
  return text;
}

export default function Cardholders() {
  const [holders, setHolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [cards, setCards] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [applications, setApplications] = useState([]);
  const [tab, setTab] = useState("card-users");
  const running = useRef(false);

  const load = async () => {
    const items = [];
    let cursor;
    for (let page = 0; page < 20; page++) {
      const result = await base44.entities.Cardholder.list({ sort: "-created_date", limit: 100, ...(cursor ? { cursor } : {}) });
      items.push(...(Array.isArray(result) ? result : result.items || []));
      if (Array.isArray(result) || !result.has_more) break;
      cursor = result.next_cursor;
    }
    setHolders(items);
    // Everything else the page cross-references: cards per card user, Z8
    // accounts, and client applications.
    const [cardPage, userPage, appPage] = await Promise.all([
      base44.entities.Card.list({ limit: 500 }).catch(() => []),
      base44.entities.User.list({ limit: 500 }).catch(() => []),
      base44.entities.CardholderApplication.list({ sort: "-created_date", limit: 500 }).catch(() => []),
    ]);
    const asList = (page) => (Array.isArray(page) ? page : page?.items || []);
    setCards(asList(cardPage));
    const apps = asList(appPage);
    setApplications(apps);
    const known = new Set(items.flatMap((h) => [h.email, h.owner_email]).filter(Boolean).map((e) => e.toLowerCase()));
    setAccounts(asList(userPage)
      .filter((u) => u.role !== "admin" && u.email && !known.has(u.email.toLowerCase()))
      .map((u) => ({ user: u, application: apps.find((a) => a.owner_email === u.email.toLowerCase()) || null }))
      .filter(({ application }) => !application || application.status === "rejected"));
  };

  useEffect(() => {
    load()
      .catch(() => setError("We couldn't load clients. Please reload the page."))
      .finally(() => setLoading(false));
    // Clients stay in step with PhotonPay by themselves; the header button is
    // only there to ask for a sync again after a failure.
    sync({ quiet: true });
  }, []);

  const sync = async ({ quiet = false } = {}) => {
    if (running.current) return;
    running.current = true;
    setSyncing(true);
    setNotice(quiet ? "Checking PhotonPay for client updates…" : "");
    if (!quiet) setError("");
    let synced = 0;
    try {
      let hasMore = false;
      for (let pageIndex = 1; pageIndex <= 20; pageIndex++) {
        const response = await base44.functions.invoke("photonpayCards", { action: "sync_holders", payload: { pageIndex } });
        if (response.data?.error) throw new Error(response.data.error);
        synced += response.data?.synced || 0;
        hasMore = Boolean(response.data?.has_more);
        setNotice("Synced " + synced + " clients…");
        if (!hasMore) break;
      }
      await load();
      setNotice(hasMore
        ? "Synced " + synced + " clients. More records remain; contact your administrator to complete the import."
        : quiet
          ? "Up to date · " + synced + " clients checked with PhotonPay."
          : "Synced " + synced + " clients and their PhotonPay review statuses.");
    } catch (err) {
      const message = explainSyncError(err?.response?.data?.error || "Client sync failed. Check the main account connection.");
      if (quiet) {
        setNotice("Automatic sync couldn't run. " + message);
      } else {
        setNotice("");
        setError(message);
      }
      if (synced) await load().catch(() => {});
    } finally { running.current = false; setSyncing(false); }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="label-eyebrow">Main account · Clients</div>
          <h1 className="mt-2 font-display text-[40px] leading-none tracking-tight sm:text-[48px]">Cardholders</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">Your clients' PhotonPay cardholder records. Each client accesses their assigned virtual cards through their own Z8 login.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={sync} disabled={syncing || loading}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {syncing ? "Syncing clients…" : "Sync again"}
          </Button>
          <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add client</Button>
        </div>
      </header>
      <AddCardholderDialog
        open={adding}
        onOpenChange={setAdding}
        onCreated={(created) => {
          setNotice("Registered with PhotonPay · " + created.photon_cardholder_id + (created.status === "active" ? " · approved" : " · awaiting PhotonPay review"));
          load().catch(() => {});
        }}
      />

      <EditCardholderDialog
        holder={editing}
        onOpenChange={(next) => { if (!next) setEditing(null); }}
        onSaved={(saved) => {
          setNotice("Updated at PhotonPay · review: " + (saved.review_status || "unknown") + (saved.status === "active" ? " · approved" : ""));
          load().catch(() => {});
        }}
      />
      {notice && <p role="status" className="rounded-xl bg-secondary px-4 py-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-destructive/25 px-4 py-3 text-sm text-destructive">{error}</p>}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="card-users">Card users · {holders.length}</TabsTrigger>
          <TabsTrigger value="applications">Applications · {applications.filter((a) => a.status === "submitted").length}</TabsTrigger>
          <TabsTrigger value="signed-up">Signed up, not verified · {accounts.length}</TabsTrigger>
        </TabsList>

        <TabsContent value="card-users" className="mt-4">
          <p className="mb-4 text-sm text-muted-foreground">Your card users at PhotonPay, with the same fields and statuses as the portal (Issuing → Card User). <a href="https://portal.photonpay.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">Open PhotonPay <ExternalLink className="h-3 w-3" aria-hidden="true" /></a></p>
          {loading ? <div className="h-64 animate-pulse rounded-xl bg-secondary" /> : <CardUsersTable holders={holders} cards={cards} onEdit={setEditing} />}
        </TabsContent>

        <TabsContent value="applications" className="mt-4">
          <p className="mb-4 text-sm text-muted-foreground">Clients who verified themselves in Z8. Nothing reaches PhotonPay until you approve.</p>
          <ApplicationsQueue
            onApproved={(created, app) => {
              setNotice(`Approved ${app.first_name} ${app.last_name} · sent to PhotonPay as ${created.photon_cardholder_id}` + (created.status === "active" ? " · approved by PhotonPay" : " · awaiting PhotonPay review"));
              load().catch(() => {});
            }}
          />
          {!applications.some((a) => a.status === "submitted") && <div className="surface px-6 py-12 text-center text-sm text-muted-foreground">No applications waiting for review.</div>}
        </TabsContent>

        <TabsContent value="signed-up" className="mt-4">
          <SignedUpList accounts={accounts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}