import React from "react";
import { useAuth } from "@/lib/AuthContext";
import AssistantChat from "@/components/assistant/AssistantChat";

const PROFILES = {
  admin: {
    agent: "card_setup_assistant",
    eyebrow: "Admin assistant",
    title: "Card assistant",
    assistantName: "Card assistant",
    showDetails: true,
    placeholder: "Name a client, or ask about cards and limits…",
    intro: "Issue a card for a client, look up a client's cards, or freeze one. It asks for what it needs and confirms before changing anything.",
    heading: "What would you like to do?",
    body: "Name the client and what you need. Nothing is issued, frozen or cancelled without your yes.",
    suggestions: ["Issue a virtual card for a client", "Which clients are approved for cards?", "Show a client's cards and balances", "What limits should a new card start with?"],
  },
  user: {
    agent: "cardholder_assistant",
    eyebrow: "Your cards",
    title: "Card help",
    assistantName: "Z8 assistant",
    showDetails: false,
    placeholder: "Ask about your cards…",
    intro: "Ask about your cards, their limits and their security. You can freeze or unfreeze a card here at any time.",
    heading: "Your cards, explained",
    body: "Ask what a limit means, what a charge was, or ask me to freeze a card. Cards themselves are issued by your Z8 administrator.",
    suggestions: ["What limits does my card have?", "Freeze my card", "Who do I ask for a new card?"],
  },
};

export default function CardAssistant() {
  const { user } = useAuth();
  return <AssistantChat profile={PROFILES[user?.role === "admin" ? "admin" : "user"]} />;
}