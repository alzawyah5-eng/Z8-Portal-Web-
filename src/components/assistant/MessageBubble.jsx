import React, { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import Markdown from "@/components/assistant/Markdown";
import ToolSteps from "@/components/assistant/ToolCall";

function timeOf(message) {
  const value = message?.metadata?.created_date || message?.created_date;
  if (!value) return "";
  const date = new Date(/Z|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function UserMessage({ message }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] sm:max-w-[75%]">
        <div className="rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        {timeOf(message) && <p className="mt-1 text-right text-[11px] text-muted-foreground">{timeOf(message)}</p>}
      </div>
    </div>
  );
}

// One answer from the assistant. The platform stores it as several messages
// (a sentence, a lookup, then the reply); they are shown here as one block,
// with consecutive lookups folded into a single "steps" line.
export function AssistantTurn({ messages, name = "Z8 assistant", showDetails = false, working = false }) {
  const [copied, setCopied] = useState(false);
  const blocks = [];
  for (const message of messages) {
    const text = String(message.content || "").trim();
    if (text) blocks.push({ kind: "text", text });
    const calls = message.tool_calls || [];
    if (calls.length) {
      const previous = blocks[blocks.length - 1];
      if (previous?.kind === "steps") previous.calls.push(...calls);
      else blocks.push({ kind: "steps", calls: [...calls] });
    }
  }
  const finalText = blocks.filter((block) => block.kind === "text").map((block) => block.text).join("\n\n");
  const copy = async () => {
    try { await navigator.clipboard.writeText(finalText); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">{name}</p>
        <div className="rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3 shadow-sm">
          {blocks.map((block, index) => block.kind === "text"
            ? <Markdown key={index}>{block.text}</Markdown>
            : <ToolSteps key={index} toolCalls={block.calls} showDetails={showDetails} />)}
          {working && <TypingDots />}
        </div>
        {!working && finalText && (
          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
            {timeOf(messages[messages.length - 1]) && <span>{timeOf(messages[messages.length - 1])}</span>}
            <button type="button" onClick={copy} className="inline-flex min-h-8 items-center gap-1 rounded-md px-1 hover:text-foreground" aria-label="Copy reply">
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TypingDots({ label = "Thinking" }) {
  return (
    <div role="status" className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 150, 300].map((delay) => <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: `${delay}ms` }} />)}
      </span>
      {label}…
    </div>
  );
}

export default UserMessage;
