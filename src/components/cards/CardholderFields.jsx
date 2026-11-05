import React from "react";
import { Link } from "react-router-dom";
import Field from "@/components/forms/Field";
import { Input } from "@/components/ui/input";
import ResponsiveSelect from "@/components/forms/ResponsiveSelect";

export default function CardholderFields({ value, onChange, cardholders, onPickHolder }) {
  const linked = cardholders.filter(holder => holder.photon_cardholder_id);
  const selected = linked.find(holder => holder.id === value.holder_id);
  const options = linked.map(holder => ({
    value: holder.id,
    label: `${holder.full_name}${holder.email ? " · " + holder.email : ""}`,
  }));
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Choose a client registered under your main PhotonPay account. Z8 checks their current approval before requesting a virtual card.
      </p>
      {linked.length ? (
        <Field label="PhotonPay cardholder">
          <ResponsiveSelect
            value={value.holder_id || ""}
            onValueChange={onPickHolder}
            options={options}
            placeholder="Choose a synced client"
          />
        </Field>
      ) : <p className="rounded-xl bg-secondary p-4 text-sm">No linked clients yet. Register the cardholder in PhotonPay, then sync clients into Z8.</p>}
      {selected && <div className="rounded-xl border border-border p-4 text-sm">
        <div className="font-medium">{selected.full_name}</div>
        <p className="mt-1 text-xs text-muted-foreground">Last synced review: {selected.review_status || "unknown"}. Approval is checked again when you issue.</p>
      </div>}
      <Field label="Client's Z8 account email" hint="This account will receive access to the card and its activity.">
        <Input type="email" value={value.email} onChange={event => onChange({ ...value, email: event.target.value })} placeholder="client@example.com" />
      </Field>
      <Link to="/cardholders" className="inline-block text-sm font-medium underline">Manage and sync clients</Link>
    </div>
  );
}