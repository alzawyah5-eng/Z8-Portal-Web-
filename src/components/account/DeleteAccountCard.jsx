import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { z8 } from "@/api/z8Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function DeleteAccountCard() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const close = (next) => {
    if (busy) return;
    setOpen(next);
    if (!next) {
      setConfirmation("");
      setError("");
    }
  };

  const removeAccount = async () => {
    if (!user?.email || confirmation.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      setError("Enter the signed-in account email exactly to continue.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await z8.functions.invoke("deleteAccount", { confirm_email: confirmation.trim() });
      if (response.data?.ok !== true) throw new Error(response.data?.error || "Account deletion could not be confirmed.");
      await z8.auth.logout();
    } catch (cause) {
      setError(cause?.message || "We couldn't delete this account. Please try again or contact support.");
      setBusy(false);
    }
  };

  return (
    <section className="surface border-destructive/25 p-5 sm:p-6">
      <h2 className="font-display text-lg text-destructive">Delete account</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Permanently close your Z8 account. Your sign-in will be disabled, card access will end, and financial activity will remain in the programme audit history. A minimal email record is retained to prevent this closed account from being recreated. This cannot be undone.
      </p>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={busy} className="mt-5 border-destructive/40 text-destructive">
        <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Delete my account
      </Button>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this account permanently?</DialogTitle>
            <DialogDescription>
              This removes your Z8 sign-in and ends your access to cards and account features. Type <strong className="break-all text-foreground">{user?.email}</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoComplete="email"
            inputMode="email"
            aria-label="Confirm account email"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={busy}
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>Keep my account</Button>
            <Button type="button" variant="destructive" onClick={removeAccount} disabled={busy || !confirmation.trim()}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              {busy ? "Deleting account…" : "Delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
