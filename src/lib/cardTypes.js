// Card type names exactly as PhotonPay uses them. The stored values stay
// PhotonPay's API values ("share", "recharge"); only these labels are shown.
export const CARD_TYPE_LABELS = {
  share: "Share card",
  recharge: "Regular card",
};

export const CARD_TYPE_HINTS = {
  share: "Spends from your shared PhotonPay balance.",
  recharge: "Loaded with its own balance from your PhotonPay account.",
};

export function cardTypeLabel(type) {
  return CARD_TYPE_LABELS[type] || CARD_TYPE_LABELS.share;
}

export const CARD_TYPE_OPTIONS = Object.entries(CARD_TYPE_LABELS).map(([value, label]) => ({ value, label }));
