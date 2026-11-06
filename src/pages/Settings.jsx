import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, LifeBuoy, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { z8 } from "@/api/z8Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import StatusPill from "@/components/StatusPill";
import ProgrammeDefaults from "@/components/settings/ProgrammeDefaults";
import PushTestCard from "@/components/notifications/PushTestCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function Requirement({ label, detail, met }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-[13px]">{label}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{detail}</div>
      </div>
      <span
        className={
          met
            ? "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-accent/10"
            : "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-secondary"
        }
      >
        {met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 text-muted-foreground" />}
      </span>
    </div>
  );
}


export default function Settings() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [balance, setBalance] = useState(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [diagnostics, setDiagnostics] = useState(null);

  const check = async () => {
    setBusy("check");
    setNotice("");
    try {
      const response = await z8.functions.invoke("photonpayCards", { action: "status" });
      setStatus(response.data);
    } catch (error) {
      setNotice(error?.response?.data?.error || error.message);
    } finally {
      setBusy("");
    }
  };

  const loadBalance = async () => {
    setBusy("balance");
    setNotice("");
    try {
      const response = await z8.functions.invoke("photonpayCards", { action: "balance", payload: {} });
      if (response.data?.error) throw new Error(response.data.error);
      setBalance(response.data);
    } catch (error) {
      setNotice(error?.response?.data?.error || error.message);
    } finally {
      setBusy("");
    }
  };

  const diagnose = async () => {
    setBusy("diagnostics");
    setNotice("");
    try {
      const response = await z8.functions.invoke("photonpayDiagnostics", {});
      setDiagnostics(response.data);
    } catch (error) {
      setNotice(error?.response?.data?.error || "The diagnostic check could not complete. Please try again.");
    } finally { setBusy(""); }
  };

  const deleteAccount = async () => {
    setBusy("delete");
    setNotice("");
    try {
      const response = await z8.functions.invoke("deleteAccount", { confirm_email: user?.email });
      if (response.data?.error) throw new Error(response.data.error);
      await z8.auth.logout();
    } catch (error) {
      setNotice(error?.response?.data?.error || "We couldn't delete this account. Please try again or contact support.");
      setBusy("");
    }
  };

  useEffect(() => {
    check();
  }, []);

  // A locally valid signature says nothing about PhotonPay accepting it: only
  // the signed probe request proves the private key matches the portal key.
  const signResults = Array.isArray(diagnostics?.signing) ? diagnostics.signing : [];
  const signatureAccepted = signResults.some((row) => row.signature_accepted)
    ? true
    : signResults.length ? false : null;

  return (
    <div className="space-y-8">
      <header>
        <div className="label-eyebrow">Infrastructure</div>
        <h1 className="mt-2 font-display text-[40px] leading-none tracking-tight sm:text-[48px]">Connection</h1>
        <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
          Z8 issues virtual cards for clients under your main PhotonPay account. Credentials live server-side only and are never exposed to the
          browser.
        </p>
      </header>

      {notice && (
        <div className="rounded-sm border border-border bg-secondary/60 px-4 py-2.5 text-[12px] text-muted-foreground">{notice}</div>
      )}

      <PushTestCard />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="label-eyebrow">PhotonPay Open API</div>
              <div className="mt-2 font-display text-[30px] leading-none">
                {status?.connected ? "Linked" : "Not linked"}
              </div>
            </div>
            <StatusPill status={status?.connected ? "active" : "pending"} />
          </div>

          <div className="mt-5 space-y-3 text-[12px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">Configured main account</span>
              <span className="break-all font-medium">{status?.master_account_email || "Loading…"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Client model</span><span>Cardholders under the main account</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Issuing</span><span>Virtual cards only</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Environment</span>
              <span className="num uppercase">{status?.env || "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">App credentials</span>
              <span>{status?.configured ? "Stored" : "Missing"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Request signing</span>
              <span>{diagnostics?.key?.signature_verified ? "Verified locally" : status?.signing ? "Private key stored" : "Not configured"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Static IP relay</span>
              <span>{status?.relay ? "In use" : "Direct"}</span>
            </div>
          </div>

          {status?.message && !status?.connected && (
            <p className="mt-4 rounded-sm border border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
              {status.message}{status.error_code && <span className="mt-1 block break-all font-mono">{status.error_code}</span>}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={check} disabled={Boolean(busy)}>
              {busy === "check" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Re-test connection
            </Button>
            <Button variant="outline" size="sm" onClick={diagnose} disabled={Boolean(busy)}>
              {busy === "diagnostics" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Full diagnostic check
            </Button>
          </div>
        </section>

        <section className="surface p-5">
          <div className="label-eyebrow">Required credentials</div>
          <div className="mt-2">
            <Requirement
              label="App ID"
              detail="PhotonPay portal → Settings → Developers"
              met={Boolean(status?.configured)}
            />
            <Requirement
              label="App Secret"
              detail="Paired with the App ID for token issuance"
              met={Boolean(status?.configured)}
            />
            <Requirement
              label="Environment"
              detail="Production uses the live PhotonPay API"
              met={Boolean(status?.env)}
            />
            <Requirement
              label="RSA private key"
              detail="PKCS#8 key used to sign card issuing requests (X-PD-SIGN)"
              met={Boolean(status?.signing)}
            />
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            Update keys from the app dashboard under Secrets. Changes take effect on the next request.
          </p>
        </section>
      </div>

      {diagnostics && <section className="surface space-y-5 p-5 sm:p-6" aria-label="Connection diagnostic results">
        <h2 className="font-display text-xl">Connection diagnostic results</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Signing key</dt><dd className="mt-1 font-medium">{diagnostics.key?.signature_verified ? `RSA ${diagnostics.key.bits} · signature verified locally` : diagnostics.key?.present ? "Key could not be validated" : "No private key saved"}</dd></div>
          <div><dt className="text-muted-foreground">Observed outbound IP</dt><dd className="mt-1 break-all font-mono">{diagnostics.egress?.observed_ip || "Could not determine"}</dd></div>
          <div><dt className="text-muted-foreground">Static IP relay</dt><dd className="mt-1">{diagnostics.relay?.configured ? diagnostics.relay.reachable ? `Reachable · ${diagnostics.relay.host}` : `Unreachable · ${diagnostics.relay.host}` : "Not configured (calls go out directly)"}</dd></div>
          <div><dt className="text-muted-foreground">Card API access</dt><dd className="mt-1">{diagnostics.permission ? diagnostics.permission.allowed ? "Permitted" : "Refused by PhotonPay" : "Not checked"}</dd></div>
          <div><dt className="text-muted-foreground">Request signing</dt><dd className="mt-1">{signatureAccepted === true ? "Accepted by PhotonPay" : signatureAccepted === false ? "Refused: invalid sign" : "Not checked"}</dd></div>
        </dl>
        <p className="text-xs leading-relaxed text-muted-foreground">This public network check shows an observed outbound address. It may differ by destination and is not guaranteed to be fixed.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-border text-muted-foreground"><th className="py-3 pr-4 font-medium">Environment</th><th className="py-3 pr-4 font-medium">Check</th><th className="py-3 pr-4 font-medium">Result</th><th className="py-3 font-medium">Provider code</th></tr></thead><tbody>{(diagnostics.probes || []).map((probe, index) => <tr key={index} className="border-b border-border last:border-0"><td className="py-3 pr-4 uppercase">{probe.environment}</td><td className="py-3 pr-4">{probe.auth_mode === "direct" ? "Direct API access" : `Token (${probe.scheme})`}</td><td className="py-3 pr-4">{probe.success ? "Passed" : probe.message || probe.network_error || "Failed"}</td><td className="break-all py-3 font-mono">{probe.code || "—"}</td></tr>)}</tbody></table></div>
        {diagnostics.probes?.some(probe => probe.code === "union-oauth2-local:00289") && <p className="rounded-xl bg-secondary p-4 text-sm leading-relaxed">PhotonPay refused this app during sandbox token issuance. Confirm the App ID and App Secret are a matched pair from the sandbox Developer settings for the configured main account. If they are, ask PhotonPay to check sandbox API access for this app and provide error code union-oauth2-local:00289. This response does not identify the exact cause.</p>}
        {signatureAccepted === false && <p className="rounded-xl bg-secondary p-4 text-sm leading-relaxed">PhotonPay rejects the signature on every write request (&ldquo;invalid sign&rdquo;, code 1001). Sign-in and read endpoints work because they are not signed. The saved RSA private key is valid, but it is not the pair of the public key registered on this App ID, so the card operations that create or change a card cannot run. Upload the public key that belongs to this private key in the PhotonPay portal, or save the private key that belongs to the key already registered there. The public half of the saved private key is shown under Signing key in this report.</p>}
        {signatureAccepted === false && diagnostics.key?.public_key_pem && <div className="rounded-xl border border-border bg-background p-4">
          <div className="label-eyebrow">Public key to register in PhotonPay</div>
          <pre className="mt-2 select-all overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">{diagnostics.key.public_key_pem}</pre>
        </div>}
        {diagnostics.permission && !diagnostics.permission.allowed && <p className="rounded-xl bg-secondary p-4 text-sm leading-relaxed">Sign-in works, but PhotonPay refuses the card API for this App ID with &ldquo;{diagnostics.permission.message || diagnostics.permission.network_error || "no permission"}&rdquo;. Cardholder sync, BINs and card listing all use that API, so nothing that reads or issues cards can run until PhotonPay enables Issuing API access for this App ID. The SFTP whitelist in their portal is for report files only and does not grant API access. Ask your PhotonPay account manager or tech-support@photonpay.com to enable Issuing (card and cardholder) API permission for the app, quoting that message.</p>}
      </section>}

      <section className="surface p-5 sm:p-6">
        <h2 className="font-display text-lg">Main account and client access</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Register clients as cardholders in your main PhotonPay account, sync them into Z8, then issue to their approved cardholder IDs. Clients sign in to Z8 and see only cards assigned to their account email.</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">The email identifies your configured main account. API access still depends on the App ID and App Secret belonging to that account. A successful connection is required to verify access.</p>
      </section>

      <section className="surface p-5 sm:p-6" aria-label="Static IP relay">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="label-eyebrow">Fixed source address</div>
            <h2 className="mt-2 font-display text-lg">Static IP relay</h2>
          </div>
          <StatusPill status={status?.relay ? "active" : "pending"} />
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          PhotonPay can restrict API access to allowlisted IPv4 addresses, and this app's own egress address is not fixed. A relay on a small server with a static IPv4 keeps every provider call coming from one address you control.
        </p>
        <div className="mt-4 space-y-2 text-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Relay setting</span>
            <span>{status?.relay ? "Configured · provider calls routed through the relay" : "Not configured · provider calls go out directly"}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Address to allowlist at PhotonPay</span>
            <span className="break-all font-mono">{diagnostics?.relay?.outbound_ip || "Run the diagnostic check to read it"}</span>
          </div>
        </div>
        {diagnostics?.relay?.error && <p className="mt-4 rounded-xl bg-secondary p-4 text-sm leading-relaxed">The relay could not be reached: {diagnostics.relay.error}. Check the server is running, serves HTTPS, and the shared secret matches.</p>}
      </section>

      <section className="surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <div className="label-eyebrow">Technical support</div>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Work through a failed request, a missing transaction or a sync problem with the technical assistant. It runs the diagnostic checks and reads the stored records for you.
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link to="/admin/support"><LifeBuoy className="mr-1.5 h-4 w-4" aria-hidden="true" /> Open technical support</Link>
        </Button>
      </section>

      <section className="surface">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[13px] font-medium uppercase tracking-[0.18em]">Funding balance</div>
            <p className="mt-1 text-[11px] text-muted-foreground">USD balance in your PhotonPay account. Regular cards are funded from it; PhotonPay chooses card BINs itself.</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadBalance} disabled={Boolean(busy)}>
            {busy === "balance" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Check balance
          </Button>
        </div>
        <div className="px-5 py-4">
          {balance === null ? (
            <p className="text-[12px] text-muted-foreground">Not loaded yet.</p>
          ) : (
            <div>
              <div className="num font-display text-2xl">{Number(balance.available || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</div>
              <p className="mt-1 text-[11px] text-muted-foreground">{balance.environment === "sandbox" ? "Sandbox · " : ""}Account {balance.account || "—"}{balance.as_of ? " · as of " + balance.as_of : ""}</p>
            </div>
          )}
        </div>
      </section>

      <ProgrammeDefaults />

      <section className="surface border-destructive/25 p-5 sm:p-6">
        <h2 className="font-display text-lg text-destructive">Delete account</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Permanently delete your Z8 account. You are signed out immediately and can't sign back in with this address. Cards assigned to this account are released back to your administrator, and your card activity stays with the programme as an audit record. This can't be undone.
        </p>
        <div className="mt-5">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="border-destructive/40 text-destructive" disabled={Boolean(busy)}>
                {busy === "delete" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                Delete my account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this account permanently?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your Z8 login is removed right away and you will be signed out. Any card access linked to your email ends, and card activity records remain visible to administrators. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep my account</AlertDialogCancel>
                <AlertDialogAction onClick={deleteAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>
    </div>
  );
}
