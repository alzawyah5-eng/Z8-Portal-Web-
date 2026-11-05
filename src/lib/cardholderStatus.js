// PhotonPay's own card user ("Carduser") vocabulary, so Z8 reads like the
// portal's Issuing → Card User list.

// status (pagingVccCardholder): normal, pending, disabled, failed
export const CARDUSER_STATUS = {
  normal: { label: "Normal", tone: "active" },
  pending: { label: "Under review", tone: "pending" },
  disabled: { label: "Disabled", tone: "suspended" },
  failed: { label: "Failed", tone: "suspended" },
  rejected: { label: "Rejected", tone: "suspended" },
};

// cardholderReviewStatus: pending, modify, approved, rejected, cert_required, or empty (no review)
export const REVIEW_STATUS = {
  pending: { label: "Under review", tone: "pending" },
  modify: { label: "Pending modification", tone: "pending" },
  approved: { label: "Approved", tone: "active" },
  rejected: { label: "Rejected", tone: "suspended" },
  cert_required: { label: "Identity information required", tone: "pending" },
  none: { label: "No review required", tone: "active" },
};

export const ID_TYPES = { id_card: "National ID card", passport: "Passport", resident_permit: "Residence permit" };

export function cardUserStatus(holder) {
  const key = String(holder?.provider_status || "").toLowerCase();
  return CARDUSER_STATUS[key] ? { key, ...CARDUSER_STATUS[key] } : { key: "", label: "Not synced", tone: "pending" };
}

export function reviewStatus(holder) {
  const raw = String(holder?.review_status || "").toLowerCase();
  const key = !raw || raw === "unknown" ? (holder?.id_info_requirement === "N" ? "none" : "") : raw;
  return REVIEW_STATUS[key] ? { key, ...REVIEW_STATUS[key] } : { key: "", label: "—", tone: "pending" };
}

// Needs the administrator: PhotonPay asked for changes, documents or rejected.
export function needsAction(holder) {
  const review = reviewStatus(holder).key;
  return ["modify", "cert_required", "rejected"].includes(review) || ["failed", "disabled"].includes(cardUserStatus(holder).key);
}
