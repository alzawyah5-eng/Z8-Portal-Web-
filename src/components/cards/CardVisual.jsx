import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { GOLD, tierInfo } from "@/lib/tiers";
import Z8Logo from "@/components/Z8Logo";

// The infinity ribbon watermark from the brand guidelines: quiet, gold-tinted,
// across almost the full card width.
function InfinityWatermark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-x-[4%] top-1/2 h-[78%] w-[92%] -translate-y-1/2 opacity-[0.13]">
      <path d="M200 100 C 160 40, 70 30, 45 100 C 70 170, 160 160, 200 100 C 240 40, 330 30, 355 100 C 330 170, 240 160, 200 100 Z" fill="none" stroke={GOLD} strokeWidth="22" strokeLinejoin="round" />
      <path d="M200 100 C 160 40, 70 30, 45 100 C 70 170, 160 160, 200 100 C 240 40, 330 30, 355 100 C 330 170, 240 160, 200 100 Z" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="3" />
    </svg>
  );
}

function Contactless() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round">
      <path d="M8.5 8.5a5 5 0 0 1 0 7" /><path d="M12 6a8.5 8.5 0 0 1 0 12" /><path d="M15.5 3.5a12 12 0 0 1 0 17" />
    </svg>
  );
}

// Copies text, with a fallback for in-app browsers without the Clipboard API.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

// A revealed value on the card that copies itself when tapped.
function CopyValue({ value, copyAs, label, className, onCopied }) {
  return (
    <button
      type="button"
      data-compact
      onClick={async () => onCopied(label, await copyText(copyAs ?? value))}
      aria-label={`Copy ${label.toLowerCase()}`}
      title={`Copy ${label.toLowerCase()}`}
      className={cn("group -mx-1.5 inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-left font-mono text-white/95 transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:bg-white/15", className)}
    >
      <span className="min-w-0 whitespace-nowrap">{value}</span>
      <Copy className="h-3.5 w-3.5 shrink-0 text-white/70 group-hover:text-white" aria-hidden="true" />
    </button>
  );
}

function groupNumber(digits) {
  return String(digits).replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function Scheme({ scheme }) {
  const name = String(scheme || "MasterCard");
  if (name.toLowerCase() === "discover") {
    return <span className="text-xs font-semibold tracking-wide text-white/90">DISCOVER<span className="ml-1 inline-block h-2 w-2 rounded-full bg-orange-400" /></span>;
  }
  return <span className="flex flex-col items-end gap-1" aria-label="Mastercard"><span className="relative block h-6 w-10"><span className="absolute left-0 h-6 w-6 rounded-full bg-[#ee6c61]" /><span className="absolute right-0 h-6 w-6 rounded-full bg-[#f7bd63]/90" /></span><span className="text-[8px] font-medium tracking-wide text-white/85">mastercard</span></span>;
}

export default function CardVisual({ card, revealedNumber, revealedCvv, revealedExpiry, className }) {
  const number = revealedNumber ? groupNumber(revealedNumber) : card?.masked_number || `•••• •••• •••• ${card?.last4 || "••••"}`;
  const holder = String(card?.cardholder_name || "Z8 Cardholder");
  const tier = tierInfo(card?.tier);
  const digits = String(revealedNumber || "").replace(/\s/g, "");
  const canCopy = /^\d{12,19}$/.test(digits);
  const expiry = revealedExpiry || card?.expiry || "--/--";
  const [copied, setCopied] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onCopied = (label, ok) => {
    clearTimeout(timer.current);
    setCopied(ok ? `${label} copied` : "Couldn't copy. Press and hold to copy instead.");
    timer.current = setTimeout(() => setCopied(""), 1800);
  };

  return (
    <div
      className={cn("grain relative flex aspect-[1.586/1] w-full min-w-0 flex-col justify-between overflow-hidden rounded-[18px] p-4 text-white min-[375px]:p-5 shadow-[0_8px_24px_-14px_rgba(40,10,25,0.6)] sm:p-6", !tier && "ink-panel", className)}
      style={tier ? { background: tier.gradient } : undefined}
      data-tier={tier?.id || undefined}
    >
      {tier
        ? <InfinityWatermark />
        : <div aria-hidden="true" className="pointer-events-none absolute -right-[28%] -top-[50%] h-[200%] w-[95%] rotate-[30deg] rounded-[45%] border-[28px] border-white/[0.045]" />}
      <div className="relative flex items-start justify-between gap-3">
        <Z8Logo className="w-12 sm:w-14" style={{ color: tier ? GOLD : "#fff" }} />
        <span className="rounded-full border px-2.5 py-1 text-[10px] font-medium" style={tier ? { borderColor: `${GOLD}66`, color: GOLD, background: "rgba(0,0,0,0.12)" } : { borderColor: "rgba(255,255,255,.2)", color: "rgba(255,255,255,.9)", background: "rgba(255,255,255,.1)" }}>
          {tier ? `${tier.name} · Virtual` : "Virtual card"}
        </span>
      </div>
      <div className={cn("relative", revealedNumber ? "py-0.5" : "py-2")}>
        {/* The chip makes room for the revealed number and CVV. */}
        <div className={cn("mb-3 flex items-center gap-2.5", revealedNumber && "hidden")}>
          <span aria-hidden="true" className="grid h-6 w-8 grid-cols-3 overflow-hidden rounded-md border border-[#e3d7ad]/80 bg-gradient-to-br from-[#e8ddb4] to-[#b6a270]"><span className="border-r border-[#95835c]/50" /><span className="border-r border-[#95835c]/50" /><span /></span>
          {tier && <Contactless />}
        </div>
        {canCopy
          ? <CopyValue value={number} copyAs={digits} label="Card number" onCopied={onCopied} className="text-[12px] font-medium tracking-[0.06em] min-[375px]:text-[13px] min-[375px]:tracking-[0.08em] sm:text-[15px]" />
          : <p className="font-mono text-[13px] font-medium tracking-[0.08em] text-white/95 sm:text-[15px]">{number}</p>}
        {revealedCvv && (
          <p className="mt-0.5 flex items-center gap-1 font-mono text-[11px] text-white/85">
            CVV <CopyValue value={revealedCvv} label="CVV" onCopied={onCopied} className="text-[11px]" />
          </p>
        )}
      </div>
      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[8px] font-medium uppercase tracking-[0.12em] text-white/75">Cardholder</p>
          <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-[0.07em] text-white/95">{holder}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[8px] text-white/75">Valid thru</p>
          {revealedExpiry
            ? <CopyValue value={expiry} label="Expiry date" onCopied={onCopied} className="mt-0.5 text-[11px]" />
            : <p className="mt-1 font-mono text-[11px] text-white/95">{expiry}</p>}
        </div>
        <div className="ml-1 shrink-0"><Scheme scheme={card?.scheme} /></div>
      </div>
      <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
        {copied && (
          <span className="flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur">
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> {copied}
          </span>
        )}
      </div>
    </div>
  );
}