import React, { useState } from "react";
import { AlertCircle, Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeTool } from "@/components/assistant/toolLabels";

// Never shown even in technical details: card data and identifiers.
const HIDDEN_KEYS = /card_?no|cardNumber|cvv|expir|cert_?id|token|secret|password|authorization/i;

function scrub(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => scrub(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, HIDDEN_KEYS.test(key) ? "•••" : scrub(item, depth + 1)]));
}

function Step({ toolCall, showDetails }) {
  const [open, setOpen] = useState(false);
  const step = describeTool(toolCall);
  const Icon = step.running ? Loader2 : step.failed ? AlertCircle : Check;
  const expandable = showDetails && !step.running && (step.args || step.results);
  return (
    <li>
      <button
        type="button"
        onClick={() => expandable && setOpen((value) => !value)}
        aria-expanded={expandable ? open : undefined}
        className={cn("flex w-full items-start gap-2 rounded-lg px-1 py-1 text-left", expandable && "hover:bg-muted/60")}
      >
        <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", step.running && "animate-spin text-primary", step.failed ? "text-destructive" : "text-emerald-600")} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={cn(step.failed && "text-destructive")}>{step.label}</span>
          {step.outcome && <span className="text-muted-foreground"> · {step.outcome}</span>}
        </span>
        {expandable && <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />}
      </button>
      {open && expandable && (
        <pre className="mb-1 ml-6 mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted px-2.5 py-2 font-mono text-[11px] text-muted-foreground">
          {JSON.stringify({ request: scrub(step.args), result: scrub(step.results) }, null, 2)}
        </pre>
      )}
    </li>
  );
}

// The steps the assistant took for one answer, collapsed to a single line
// once they are done ("Looked up clients · 2 steps").
export default function ToolSteps({ toolCalls, showDetails }) {
  const steps = toolCalls.map((toolCall) => ({ toolCall, ...describeTool(toolCall) }));
  const running = steps.some((step) => step.running);
  const failed = steps.filter((step) => step.failed).length;
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  const expanded = open || running;
  const last = steps[steps.length - 1];
  const summary = running
    ? `${last.label}…`
    : failed
      ? `${steps.find((step) => step.failed).label}${failed > 1 ? ` (+${failed - 1} more)` : ""}`
      : steps.length === 1 ? last.label : `${steps[0].label} and ${steps.length - 1} more step${steps.length > 2 ? "s" : ""}`;

  return (
    <div className="my-2 rounded-xl border border-border bg-background/70 text-xs">
      <button
        type="button"
        onClick={() => !running && setOpen((value) => !value)}
        aria-expanded={expanded}
        className="flex min-h-9 w-full items-center gap-2 px-3 py-1.5 text-left"
      >
        {running
          ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
          : failed
            ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
            : <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />}
        <span className={cn("min-w-0 flex-1 truncate font-medium", failed && !running && "text-destructive")}>{summary}</span>
        {!running && <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden="true" />}
      </button>
      {expanded && (
        <ul className="space-y-0.5 border-t border-border px-2 py-1.5">
          {steps.map((step, index) => <Step key={step.toolCall.id || index} toolCall={step.toolCall} showDetails={showDetails} />)}
        </ul>
      )}
    </div>
  );
}
