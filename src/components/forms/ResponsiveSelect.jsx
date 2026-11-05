import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

/**
 * Select that opens as a bottom sheet on mobile and as the standard
 * centred popover on desktop.
 */
export default function ResponsiveSelect({ value, onValueChange, options, placeholder = "Select", id, className }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          id={id}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            "flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-input bg-card px-3 text-left text-sm",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.label || placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="text-left text-sm font-medium text-muted-foreground">{placeholder}</DrawerTitle>
            </DrawerHeader>
            <div className="max-h-[60vh] overflow-y-auto px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                  aria-pressed={option.value === value}
                  className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-left text-sm hover:bg-secondary"
                >
                  <span className="truncate">{option.label}</span>
                  {option.value === value && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className={className}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}