import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Remembered for this browser session only: "Later" hides the prompt until the
// client's next visit, so it keeps reminding them until they verify.
const DISMISS_KEY = "z8.verifyPromptDismissed";

function dismissed() {
  try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
}

// Asks a client who has not verified their identity yet to do so: a card can
// only be issued to them once they are verified. Shown to client accounts only,
// never on the Verification page itself, and not once an application is waiting
// for review or approved.
export default function VerifyPrompt() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [rejected, setRejected] = useState(false);
  const client = Boolean(user) && user.role !== "admin";

  useEffect(() => {
    if (!client || dismissed() || pathname.startsWith("/verification")) return;
    let active = true;
    base44.functions.invoke("photonpayCards", { action: "my_registration", payload: {} })
      .then((response) => {
        if (!active || response.data?.error) return;
        const status = response.data?.application?.status || "";
        // Already registered at PhotonPay (for example by an administrator): no prompt.
        if (response.data?.identity) return;
        if (!status || status === "rejected") {
          setRejected(status === "rejected");
          setOpen(true);
        }
      })
      .catch(() => {});
    return () => { active = false; };
    // Checked once per sign-in; the route is read only to skip the Verification page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, user?.email]);

  useEffect(() => { if (pathname.startsWith("/verification")) setOpen(false); }, [pathname]);

  const later = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage unavailable */ }
    setOpen(false);
  };

  if (!client) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) later(); }}>
      <DialogContent className="max-w-md rounded-[24px]">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <DialogTitle className="font-display text-2xl">{rejected ? "Your verification needs changes" : "Verify your identity"}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {rejected
              ? "Your last verification was not approved. Correct your details to get your card."
              : "To get a card, we first need to verify your identity. It takes about five minutes: have your passport or national ID ready."}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={later}>Later</Button>
          <Button type="button" onClick={() => { setOpen(false); navigate("/verification"); }}>
            {rejected ? "Review my details" : "Verify now"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
