import { cn } from "@/lib/utils";
import Z8Logo from "@/components/Z8Logo";

export default function Brand({ light = false, compact = false, audience = "admin" }) {
  const name = audience === "user" ? "Z8 Cards" : "Z8 Card Manager";
  const description = audience === "user" ? "Your card account" : "Card programme console";
  return (
    <span className={cn("inline-flex items-center gap-2.5", light ? "text-white" : "text-foreground")}>
      <span className={cn("flex shrink-0 items-center justify-center overflow-hidden", compact ? "h-12 w-12 rounded-xl" : "h-8 w-8 rounded-lg", light ? "bg-white/10 ring-1 ring-white/40" : "bg-[#F6F2E9] ring-1 ring-border")}>
        <Z8Logo className={compact ? "w-9" : "w-6"} style={{ color: light ? "#fff" : "#51082F" }} />
      </span>
      {!compact && (
        <span className="text-left">
          <span className="block font-display text-[15px] font-bold leading-tight tracking-tight">{name}</span>
          <span className={cn("mt-0.5 block text-[10px] font-medium", light ? "text-white/65" : "text-muted-foreground")}>{description}</span>
        </span>
      )}
    </span>
  );
}
