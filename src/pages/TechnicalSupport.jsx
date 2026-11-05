import React from "react";
import AssistantChat from "@/components/assistant/AssistantChat";

const PROFILE = {
  agent: "technical_support",
  eyebrow: "Admin · Technical",
  title: "Technical support",
  assistantName: "Support assistant",
  showDetails: true,
  placeholder: "Describe what isn't working…",
  intro: "Work through connection and data problems: failed card requests, missing transactions, sync or webhook issues. The assistant runs checks and compares the stored record with what PhotonPay reports.",
  heading: "What's not working?",
  body: "Describe the symptom and, if you have one, the card, client or time it involves. The assistant checks the connection and the records before answering.",
  suggestions: ["Run a connection check", "A client's sync is failing", "Why is a transaction missing?", "Why did a card application fail?"],
};

export default function TechnicalSupport() {
  return <AssistantChat profile={PROFILE} />;
}