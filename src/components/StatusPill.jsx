import { cn } from "@/lib/utils";

const VARIANTS = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  frozen: "border-sky-200 bg-sky-50 text-sky-800",
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  cancelled: "border-slate-200 bg-slate-100 text-slate-700",
  declined: "border-rose-200 bg-rose-50 text-rose-800",
  suspended: "border-rose-200 bg-rose-50 text-rose-800",
};

// `label` shows custom wording (e.g. PhotonPay's "Under review") in the colour
// of `status`.
export default function StatusPill({ status, label, className }) {
  const key = String(status || "pending").toLowerCase();
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium leading-none", label ? "" : "capitalize", VARIANTS[key] || VARIANTS.pending, className)}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{label || key}</span>;
}