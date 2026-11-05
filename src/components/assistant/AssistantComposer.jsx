import React, { useEffect, useRef } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Grows with the message up to a few lines; Enter sends, Shift+Enter adds a line.
export default function AssistantComposer({ value, onChange, onSend, busy, disabled, placeholder }) {
  const ref = useRef(null);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 180)}px`;
  }, [value]);

  const send = () => {
    if (busy || disabled || !value.trim()) return;
    onSend();
  };

  return (
    <form onSubmit={(event) => { event.preventDefault(); send(); }} className="border-t border-border bg-card px-3 pb-3 pt-3 sm:px-5">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-input bg-background px-3 py-2 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
        <textarea
          ref={ref}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
          }}
          rows={1}
          disabled={disabled}
          aria-label="Message the assistant"
          placeholder={placeholder || "Ask the assistant…"}
          className="max-h-[180px] min-h-[40px] flex-1 resize-none bg-transparent py-2 text-base leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60 md:text-sm"
        />
        <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-xl" aria-label="Send message" disabled={busy || disabled || !value.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowUp className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
      <p className="mx-auto mt-1.5 hidden max-w-3xl px-1 text-[11px] text-muted-foreground sm:block">Enter to send · Shift + Enter for a new line</p>
    </form>
  );
}
