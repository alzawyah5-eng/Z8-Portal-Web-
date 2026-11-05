import React from "react";
import Field from "@/components/forms/Field";
import { Input } from "@/components/ui/input";
import ResponsiveSelect from "@/components/forms/ResponsiveSelect";
import { CARD_TYPE_HINTS, CARD_TYPE_OPTIONS } from "@/lib/cardTypes";
import CountrySelect from "@/components/forms/CountrySelect";



export default function CardSpecFields({ value, onChange }) {
  const set = (key) => (next) => onChange({ ...value, [key]: next });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Card name" className="sm:col-span-2">
        <Input
          value={value.nickname}
          onChange={(e) => set("nickname")(e.target.value)}
          placeholder="Team travel · Q4"
        />
      </Field>

      <Field label="Card type" hint={CARD_TYPE_HINTS[value.card_type]}>
        <ResponsiveSelect value={value.card_type} onValueChange={set("card_type")} options={CARD_TYPE_OPTIONS} placeholder="Card type" />
      </Field>

      {value.card_type === "recharge" && (
        <Field label="Opening balance (USD)" hint="Moved from your USD PhotonPay balance onto the card when it is issued.">
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={value.recharge_amount || ""}
            onChange={(e) => set("recharge_amount")(e.target.value)}
            placeholder="100.00"
            className="num"
          />
        </Field>
      )}

      <Field label="Currency" hint="PhotonPay issues these cards in USD.">
        <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm">USD · US Dollar</div>
      </Field>

      <Field label="Card format">
        <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm">Virtual card</div>
      </Field>

      <Field label="Issuing from" hint="The country your device is in right now. It must match your internet connection, or risk review may decline the card.">
        <CountrySelect value={value.gps_country || ""} onValueChange={set("gps_country")} placeholder="Select country" />
      </Field>

      <Field label="Daily limit" hint="Leave blank for no daily cap.">
        <Input
          type="number"
          min="1"
          value={value.max_on_daily}
          onChange={(e) => set("max_on_daily")(e.target.value)}
          placeholder="2000"
          className="num"
        />
      </Field>

      <Field label="Monthly limit">
        <Input
          type="number"
          min="1"
          value={value.max_on_monthly}
          onChange={(e) => set("max_on_monthly")(e.target.value)}
          placeholder="10000"
          className="num"
        />
      </Field>

      <Field label="Per transaction cap">
        <Input
          type="number"
          min="1"
          value={value.max_on_percent}
          onChange={(e) => set("max_on_percent")(e.target.value)}
          placeholder="1500"
          className="num"
        />
      </Field>
    </div>
  );
}