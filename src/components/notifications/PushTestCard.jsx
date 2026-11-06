import React, { useEffect, useRef, useState } from "react";
import { BellRing, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { z8 } from "@/api/z8Client";
import { Button } from "@/components/ui/button";

/** Register this browser and ask the API to send it a real Firebase push. */
export default function PushTestCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const receivedRef = useRef(false);

  useEffect(() => {
    let active = true;
    let unsubscribe;
    z8.notifications.onForeground((payload) => {
      if (payload?.data?.type === "notification_test" && active) {
        receivedRef.current = true;
        setResult((current) => current ? { ...current, received: true } : current);
      }
    }).then((stop) => {
      if (active) unsubscribe = stop;
      else stop?.();
    }).catch(() => undefined);
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    setError("");
    receivedRef.current = false;
    try {
      const response = await z8.notifications.sendTestPush();
      const deviceCount = Number(response?.deviceCount || 0);
      const sent = Number(response?.sent || 0);
      setResult({ deviceCount, sent, received: receivedRef.current });
    } catch (cause) {
      setError(cause?.message || "The test notification could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="push-test-title">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BellRing className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="push-test-title" className="font-display text-base">Test browser notifications</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Register this browser and send a real push to the signed-in account.
          </p>
          {result && (
            result.sent > 0 ? (
              <p role="status" className="mt-2 flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {result.received
                  ? "This browser received the test push."
                  : `Firebase accepted the push for ${result.sent} of ${result.deviceCount} registered device${result.deviceCount === 1 ? "" : "s"}. Keep this page open to confirm foreground receipt, or check browser notifications while it is in the background.`}
              </p>
            ) : (
              <p role="status" className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {result.deviceCount === 0
                  ? "No browser device is registered. Check notification permission and Firebase web push setup."
                  : "Firebase did not accept the push. Check the backend notification logs."}
              </p>
            )
          )}
          {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      </div>
      <Button type="button" variant="outline" onClick={send} disabled={busy} className="shrink-0">
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <BellRing className="mr-1.5 h-4 w-4" aria-hidden="true" />}
        {busy ? "Sending…" : "Send test push"}
      </Button>
    </section>
  );
}
