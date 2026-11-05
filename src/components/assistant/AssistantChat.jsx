import React, { useEffect, useMemo, useRef, useState } from "react";
import { History, Loader2, Plus, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { AssistantTurn, TypingDots, UserMessage } from "@/components/assistant/MessageBubble";
import AssistantComposer from "@/components/assistant/AssistantComposer";
import { toolState } from "@/components/assistant/toolLabels";
import { cn } from "@/lib/utils";

const rowsOf = (page) => (Array.isArray(page) ? page : page?.items || []);
// Platform times may come without a zone; they are UTC.
const parseTime = (value) => (value ? Date.parse(/Z|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`) || 0 : 0);
const stamp = (row) => parseTime(row?.updated_date || row?.created_date);

// Consecutive assistant messages are one answer; hidden and empty ones are dropped.
function groupTurns(messages) {
  const turns = [];
  for (const message of messages) {
    if (message.hidden) continue;
    if (message.role === "user") {
      if (String(message.content || "").trim()) turns.push({ role: "user", messages: [message] });
      continue;
    }
    if (message.role !== "assistant") continue;
    const hasContent = String(message.content || "").trim() || message.tool_calls?.length;
    if (!hasContent) continue;
    const last = turns[turns.length - 1];
    if (last?.role === "assistant") last.messages.push(message);
    else turns.push({ role: "assistant", messages: [message] });
  }
  return turns;
}

// Still answering: the person spoke last, a step is running, or the answer so
// far ends on a step with no reply after it (recently).
function isWorking(turns, sending) {
  if (sending) return true;
  const last = turns[turns.length - 1];
  if (!last) return false;
  const lastMessage = last.messages[last.messages.length - 1];
  const created = parseTime(lastMessage?.metadata?.created_date || lastMessage?.created_date) || Date.now();
  const recent = Date.now() - created < 3 * 60_000;
  if (last.role === "user") return recent;
  if (last.messages.some((message) => message.tool_calls?.some((call) => toolState(call).running))) return true;
  const endsOnStep = !String(lastMessage.content || "").trim() && lastMessage.tool_calls?.length;
  return Boolean(endsOnStep && recent);
}

export default function AssistantChat({ profile }) {
  const [conversations, setConversations] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);

  const open = async (row) => {
    setLoading(true);
    setError("");
    try {
      const full = row?.id ? (await base44.agents.getConversation(row.id)) || row : row;
      setConversation(full);
      setMessages(full?.messages || []);
      stickToBottom.current = true;
    } catch {
      setError("That conversation could not be opened.");
    } finally {
      setLoading(false);
    }
  };

  const startNew = async () => {
    setHistoryOpen(false);
    setLoading(true);
    setError("");
    try {
      const created = await base44.agents.createConversation({
        agent_name: profile.agent,
        metadata: { name: profile.title, description: profile.eyebrow },
      });
      setConversations((rows) => [created, ...rows]);
      setConversation(created);
      setMessages(created?.messages || []);
      setDraft("");
    } catch {
      setError("A new conversation could not be started. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setConversation(null);
    setMessages([]);
    setError("");
    (async () => {
      try {
        const page = await base44.agents.listConversations({ q: { agent_name: profile.agent }, sort: "-updated_date", limit: 20 });
        // Only this assistant's conversations, newest first.
        const rows = rowsOf(page).filter((row) => row.agent_name === profile.agent).sort((a, b) => stamp(b) - stamp(a));
        if (!active) return;
        setConversations(rows);
        if (rows[0]) {
          const full = (await base44.agents.getConversation(rows[0].id)) || rows[0];
          if (!active) return;
          setConversation(full);
          setMessages(full?.messages || []);
        } else {
          const created = await base44.agents.createConversation({
            agent_name: profile.agent,
            metadata: { name: profile.title, description: profile.eyebrow },
          });
          if (!active) return;
          setConversations([created]);
          setConversation(created);
          setMessages(created?.messages || []);
        }
      } catch {
        if (active) setError("The assistant could not start. Please reload the page.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [profile.agent, profile.title, profile.eyebrow]);

  useEffect(() => {
    if (!conversation?.id) return undefined;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
    });
    return () => unsubscribe();
  }, [conversation?.id]);

  const turns = useMemo(() => groupTurns(messages), [messages]);
  const working = isWorking(turns, sending);

  // Follow new messages only while the reader is at the bottom.
  useEffect(() => {
    const box = scrollRef.current;
    if (box && stickToBottom.current) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [messages, working]);

  const onScroll = () => {
    const box = scrollRef.current;
    if (box) stickToBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  };

  const send = async (text) => {
    const content = String(text ?? draft).trim();
    if (!content || !conversation || sending) return;
    setDraft("");
    setSending(true);
    setError("");
    stickToBottom.current = true;
    try {
      await base44.agents.addMessage(conversation, { role: "user", content });
    } catch {
      setDraft(content);
      setError("Your message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const lastTurn = turns[turns.length - 1];
  const title = (row) => row?.metadata?.title || row?.title || row?.metadata?.name || "Conversation";

  return (
    <div className="flex h-[calc(100dvh-11.5rem)] min-h-[30rem] flex-col gap-4 md:h-[calc(100dvh-10rem)]">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="label-eyebrow">{profile.eyebrow}</div>
          <h1 className="mt-1 font-display text-[28px] leading-tight sm:text-[34px]">{profile.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{profile.intro}</p>
        </div>
        <div className="relative flex shrink-0 gap-2">
          {conversations.length > 1 && (
            <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen}>
              <History className="h-4 w-4" aria-hidden="true" /> History
            </Button>
          )}
          <Button type="button" size="sm" className="h-10" onClick={startNew} disabled={loading || sending}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New chat
          </Button>
          {historyOpen && (
            <div className="absolute right-0 top-12 z-20 w-72 rounded-2xl border border-border bg-card p-1.5 shadow-xl">
              <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent conversations</p>
              <ul className="max-h-72 overflow-y-auto">
                {conversations.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => { setHistoryOpen(false); open(row); }}
                      className={cn("flex w-full flex-col rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted", row.id === conversation?.id && "bg-secondary text-primary")}
                    >
                      <span className="truncate font-medium">{title(row)}</span>
                      <span className="text-[11px] text-muted-foreground">{stamp(row) ? new Date(stamp(row)).toLocaleString() : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </header>

      <section className="surface flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Assistant conversation">
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6" aria-live="polite">
          <div className="mx-auto max-w-3xl space-y-5">
            {loading && (
              <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading the conversation…
              </div>
            )}

            {!loading && !turns.length && (
              <div className="mx-auto max-w-md py-10 text-center">
                <span className="empty-icon"><Sparkles className="h-6 w-6" aria-hidden="true" /></span>
                <h2 className="font-display text-xl">{profile.heading}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{profile.body}</p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {profile.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => send(suggestion)}
                      disabled={!conversation || sending}
                      className="min-h-12 rounded-2xl border border-border bg-card px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-secondary disabled:opacity-60"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!loading && turns.map((turn, index) => (turn.role === "user"
              ? <UserMessage key={turn.messages[0].id || index} message={turn.messages[0]} />
              : (
                <AssistantTurn
                  key={turn.messages[0].id || index}
                  messages={turn.messages}
                  name={profile.assistantName}
                  showDetails={Boolean(profile.showDetails)}
                  working={working && index === turns.length - 1}
                />
              )))}

            {!loading && working && lastTurn?.role !== "assistant" && (
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true"><Sparkles className="h-4 w-4" /></span>
                <div className="rounded-2xl rounded-tl-md border border-border bg-card px-4 py-2.5 shadow-sm"><TypingDots /></div>
              </div>
            )}
          </div>
        </div>

        {error && <p role="alert" className="border-t border-border bg-destructive/5 px-4 py-2 text-xs text-destructive">{error}</p>}

        <AssistantComposer value={draft} onChange={setDraft} onSend={() => send()} busy={working} disabled={loading || !conversation} placeholder={profile.placeholder} />
      </section>
    </div>
  );
}
