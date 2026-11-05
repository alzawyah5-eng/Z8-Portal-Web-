import { Link } from "react-router-dom";
import { Check, CreditCard, SlidersHorizontal, Sparkles } from "lucide-react";
import Brand from "@/components/Brand";
import CardVisual from "@/components/cards/CardVisual";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-[100svh] bg-background lg:grid lg:grid-cols-2 lg:gap-4 lg:p-5">
      <aside className="ink-panel relative hidden min-h-[calc(100svh-40px)] flex-col justify-between overflow-hidden rounded-[28px] p-10 text-white lg:flex xl:p-14">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-72 -left-48 h-[700px] w-[700px] rounded-full border-[80px] border-white/[0.035]" />
        <Link to="/" aria-label="Z8 Cards home" className="relative w-fit"><Brand light /></Link>
        <div className="relative mx-auto w-full max-w-md py-10">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-medium text-white/90"><Sparkles className="h-3.5 w-3.5" /> Make room for possibilities</span>
          <h2 className="font-display text-[42px] leading-[1.13] tracking-[-0.04em] xl:text-[50px]">Your cards.<br />Your everyday,<br /><span className="text-[#bde6cd]">made simpler.</span></h2>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/75">A friendly space to create cards, manage limits, and stay on top of every payment.</p>
          <div className="relative mx-auto mb-5 mt-9 w-full max-w-[350px]">
            <div aria-hidden="true" className="absolute inset-0 rotate-[7deg] rounded-[20px] border border-white/20 bg-[#bde6cd]/20" />
            <CardVisual className="relative -rotate-[4deg] border border-white/15 shadow-2xl" card={{ masked_number: "•••• •••• •••• ••••", cardholder_name: "Your name", expiry: "••/••", scheme: "MasterCard", form_factor: "virtual_card", currency: "USD" }} />
            <span className="absolute -bottom-4 right-2 flex items-center gap-2 rounded-2xl bg-[#d5efdf] px-3.5 py-3 text-xs font-semibold text-[#27503b] shadow-lg"><Check className="h-4 w-4" /> You're in control</span>
          </div>
          <p className="mt-8 text-center text-xs text-white/75">Illustrative card</p>
        </div>
        <div className="relative flex flex-wrap gap-x-6 gap-y-3 text-xs text-white/80"><span className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-[#bde6cd]" /> Virtual cards</span><span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-[#bde6cd]" /> Simple spending controls</span></div>
      </aside>

      <main className="mx-auto flex w-full max-w-[520px] flex-col justify-center px-5 py-8 sm:px-10 sm:py-12 lg:py-8">
        <Link to="/" aria-label="Z8 Cards home" className="mb-10 w-fit lg:hidden"><Brand /></Link>
        <div className="mb-7">
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span>
          <h1 className="font-display text-[30px] leading-tight sm:text-[34px]">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="rounded-[24px] border border-border bg-card p-5 shadow-[0_6px_28px_-20px_rgba(50,30,50,0.18)] sm:p-7">{children}</div>
        {footer && <p className="mt-6 text-center text-[13px] leading-relaxed text-muted-foreground">{footer}</p>}
        <p className="mt-8 text-center text-xs text-muted-foreground">A little clarity for your everyday cards.</p>
      </main>
    </div>
  );
}