import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import CardVisual from "@/components/cards/CardVisual";
import StatusPill from "@/components/StatusPill";
import { formatMoney } from "@/lib/format";
import { cardTypeLabel } from "@/lib/cardTypes";
import { purposeLabel } from "@/lib/cardPurposes";

export default function CardTile({ card }) {
  return (
    <Link to={`/cards/${card.id}`} className="surface group block min-w-0 p-3.5 transition-all duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-lg motion-reduce:transform-none">
      <CardVisual card={card} />
      <div className="px-1 pb-1 pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{card.nickname || "Z8 card"}</span>
          <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">Virtual · {cardTypeLabel(card.card_type)}{card.purpose ? ` · ${purposeLabel(card.purpose, card.purpose_detail)}` : ""}</p>
        <div className="mt-4 flex items-end justify-between gap-2 border-t border-border pt-3.5">
          <div className="min-w-0"><p className="text-[11px] text-muted-foreground">Available balance</p><p className="num mt-1 truncate text-[17px] font-semibold tracking-tight">{formatMoney(card.balance, card.currency)}</p></div>
          <StatusPill status={card.status} />
        </div>
      </div>
    </Link>
  );
}