// Wording for client accounts (money deposited with Z8), shared by the client
// and administrator screens.

export const DEPOSIT_METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

export const methodLabel = (value) => DEPOSIT_METHODS.find((item) => item.value === value)?.label || "";

export const ENTRY_KINDS = {
  deposit: "Deposit",
  card_opening: "New card",
  card_topup: "Card top-up",
  refund: "Refund",
  adjustment: "Correction",
};

export const ENTRY_STATUS = {
  pending: { status: "pending", label: "Waiting for confirmation" },
  completed: { status: "completed", label: "Confirmed" },
  rejected: { status: "declined", label: "Not received" },
};

export function usd(value) {
  const amount = Number(value) || 0;
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

export function signedUsd(value) {
  const amount = Number(value) || 0;
  return `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${usd(Math.abs(amount))}`;
}

// Platform times may come without a zone; they are UTC.
export function entryDate(value) {
  if (!value) return "";
  const date = new Date(/Z|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}
