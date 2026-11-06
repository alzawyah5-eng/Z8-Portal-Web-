import { useCallback, useEffect, useState } from "react";
import { z8 } from "@/api/z8Client";

// Everything a client screen needs about getting a card: verification, the
// latest card request, and the account balance. One load, shared by the
// account bar, its dialogs and the account page.
export default function useClientAccount({ enabled = true } = {}) {
  const [registration, setRegistration] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const [reg, account] = await Promise.all([
        z8.functions.invoke("photonpayCards", { action: "my_registration", payload: {} }),
        z8.functions.invoke("photonpayCards", { action: "my_wallet", payload: {} }).catch(() => ({ data: null })),
      ]);
      setRegistration(reg.data || null);
      setWallet(account.data || null);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.error || "Your account could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { reload(); }, [reload]);

  const state = registration?.card_request || null;
  return {
    loading, error, reload, wallet,
    state,
    application: registration?.application || null,
    latest: registration?.latest_card_request || null,
    verified: Boolean(state?.verified),
    min: Number(state?.min_amount || wallet?.min_amount) || 20,
  };
}
