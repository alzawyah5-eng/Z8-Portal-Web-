export function formatMoney(value, currency = "USD") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

export function formatDate(value, options = {}) {
  if (!value) return "—";
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", ...options }).format(date);
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

// API timestamps without an explicit zone are UTC. Render them in the user's
// local time while keeping one complete day/month/year and 24-hour format.
function parseDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  const raw = String(value || "").trim();
  if (!raw) return new Date(NaN);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  if (dateOnly) {
    const [year, month, day] = raw.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  return new Date(!zoned ? `${raw}Z` : raw);
}

export function initials(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}
