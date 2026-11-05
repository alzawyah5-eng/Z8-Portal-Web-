import React from "react";
import { cn } from "@/lib/utils";

export default function Field({ label, hint, className, children }) {
  return (
    <label className={cn("block space-y-2", className)}>
      <span className="block text-[13px] font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-xs leading-relaxed text-muted-foreground">{hint}</span> : null}
    </label>
  );
}