import React, { useRef, useState } from "react";
import { FileText, ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { prepareProof } from "@/lib/proofFile";

// Attach one photo or PDF as proof of payment. The prepared file goes to onChange.
export default function ProofPicker({ value, onChange, label = "Proof of payment (optional)", hint = "A photo or PDF of the transfer receipt or cash slip. It helps us confirm faster." }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true); setError("");
    try {
      onChange(await prepareProof(file));
    } catch (err) {
      setError(err.message || "That file could not be used.");
    } finally {
      setBusy(false);
    }
  };

  const pdf = value?.type === "application/pdf";
  return (
    <div className="space-y-2">
      <span className="block text-[13px] font-medium text-foreground">{label}</span>
      {value ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 px-3 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background text-primary">
            {pdf ? <FileText className="h-4 w-4" aria-hidden="true" /> : <ImageIcon className="h-4 w-4" aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{value.name || (pdf ? "Receipt.pdf" : "Photo")}</span>
            <span className="block text-xs text-muted-foreground">{(value.size / 1024 / 1024).toFixed(1)} MB · {pdf ? "PDF" : "Photo"}</span>
          </span>
          <button type="button" data-compact onClick={() => onChange(null)} aria-label="Remove proof" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-background hover:text-foreground">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Paperclip className="h-4 w-4" aria-hidden="true" />}
          {busy ? "Preparing…" : "Add a photo or PDF"}
        </button>
      )}
      <input ref={input} type="file" accept="image/*,application/pdf" className="hidden" onChange={pick} aria-label={label} />
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
