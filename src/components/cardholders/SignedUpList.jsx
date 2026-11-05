import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import StatusPill from "@/components/StatusPill";

const date = (value) => (value ? String(value).replace("T", " ").slice(0, 16) : "—");

// Z8 accounts that are not PhotonPay card users yet and have no application
// waiting or approved: they signed up but have not (successfully) verified.
export default function SignedUpList({ accounts }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter(({ user }) => !q || [user.full_name, user.email].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [accounts, query]);

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">People who created a Z8 account but are not PhotonPay card users yet. They are asked to verify each time they sign in.</p>
      <label className="relative block max-w-md">
        <span className="sr-only">Search accounts</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or email" className="pl-9" />
      </label>
      {shown.length ? (
        <div className="surface divide-y divide-border">
          {shown.map(({ user, application }) => (
            <div key={user.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{user.full_name || user.email}</div>
                <div className="break-all text-xs text-muted-foreground">{user.email} · signed up {date(user.created_date)}</div>
                {application?.status === "rejected" && application.review_note && <div className="mt-1 text-xs text-muted-foreground">Your note: {application.review_note}</div>}
              </div>
              <StatusPill status="pending" label={application?.status === "rejected" ? "Sent back for changes" : "Not started"} />
            </div>
          ))}
        </div>
      ) : (
        <div className="surface px-6 py-12 text-center text-sm text-muted-foreground">{accounts.length ? "No accounts match." : "Everyone who signed up has verified or applied."}</div>
      )}
    </section>
  );
}
