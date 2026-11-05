import { Briefcase, Megaphone, MoreHorizontal, Plane, Repeat, ShoppingBag } from "lucide-react";

// What a client uses a card for. Values match the photonpayCards function.
export const CARD_PURPOSES = [
  { value: "online_shopping", label: "Online shopping", hint: "Stores and marketplaces", icon: ShoppingBag },
  { value: "advertising", label: "Advertising", hint: "Facebook, Google, TikTok ads", icon: Megaphone },
  { value: "subscriptions", label: "Subscriptions", hint: "Software, apps, streaming", icon: Repeat },
  { value: "travel", label: "Travel", hint: "Flights, hotels, transport", icon: Plane },
  { value: "business_expenses", label: "Business expenses", hint: "Suppliers and services", icon: Briefcase },
  { value: "other", label: "Other", hint: "Tell us what for", icon: MoreHorizontal },
];

export function purposeLabel(purpose, detail) {
  if (!purpose) return "";
  if (purpose === "other") return detail || "Other";
  return CARD_PURPOSES.find((item) => item.value === purpose)?.label || "";
}

export function purposeIcon(purpose) {
  return CARD_PURPOSES.find((item) => item.value === purpose)?.icon || null;
}
