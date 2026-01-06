"use client";

import { useEffect, useMemo, useState } from "react";
import { cubicBezier, motion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  Cpu,
  GitBranch,
  MessageSquareText,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Avatar } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import { cn } from "@/lib/utils";

type AuthUser = { email?: string };
type ConversationStatus = "open" | "attention" | "resolved";

type Conversation = {
  id: string;
  name: string;
  handle: string;
  lastMessage: string;
  lastAt: number;
  unread: number;
  status: ConversationStatus;
  tags: string[];
  avatarUrl: string;
  online: boolean;
};

type InboxState = {
  conversations: Conversation[];
  selectedId: string | null;
};

type Message = {
  id: string;
  conversationId: string;
  role: "member" | "nexus";
  text: string;
  at: number;
};

type TraceKind = "trigger" | "decision" | "rule" | "action" | "message" | "state" | "integration";

type TraceEvent = {
  id: string;
  kind: TraceKind;
  title: string;
  summary: string;
  at: number;
  confidence?: number;
  durationMs?: number;
  meta?: Record<string, string>;
  severity?: "info" | "warn" | "critical";
};

const INBOX_KEY = "nexus_demo_inbox_v1";
const MESSAGES_KEY = "nexus_demo_messages_v1";

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(input: string) {
  let s = 0;
  for (let i = 0; i < input.length; i++) s = (s + input.charCodeAt(i) * (i + 1)) % 1000000;
  return s;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function kindLabel(kind: TraceKind) {
  if (kind === "trigger") return "Trigger";
  if (kind === "decision") return "Decision";
  if (kind === "rule") return "Rule";
  if (kind === "action") return "Action";
  if (kind === "message") return "Message";
  if (kind === "state") return "State";
  return "Integration";
}

function kindVariant(kind: TraceKind) {
  if (kind === "decision") return "blue";
  if (kind === "rule") return "default";
  if (kind === "action") return "green";
  if (kind === "message") return "blue";
  if (kind === "state") return "amber";
  if (kind === "integration") return "default";
  return "default";
}

function kindIcon(kind: TraceKind) {
  if (kind === "trigger") return Sparkles;
  if (kind === "decision") return Cpu;
  if (kind === "rule") return SlidersHorizontal;
  if (kind === "action") return CheckCircle2;
  if (kind === "message") return MessageSquareText;
  if (kind === "state") return Activity;
  return GitBranch;
}

function severityTone(severity: TraceEvent["severity"]) {
  if (severity === "critical") return "text-red-600";
  if (severity === "warn") return "text-amber-600";
  return "text-zinc-700";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function buildTrace(conversation: Conversation, messages: Message[], seed: number): TraceEvent[] {
  const rng = mulberry32(seed);
  const base = conversation.lastAt;

  const memberLast = [...messages]
    .filter((m) => m.role === "member")
    .sort((a, b) => b.at - a.at)[0];

  const triggerAt = memberLast?.at ?? base;
  const text = (memberLast?.text ?? conversation.lastMessage).slice(0, 120);

  const urgency = conversation.status === "attention" ? 0.85 : conversation.unread > 0 ? 0.62 : 0.38;
  const risk = conversation.tags.includes("Escalated") ? 0.78 : rng() * 0.55;
  const vip = conversation.tags.includes("VIP") ? 1 : 0;

  const confidence = clamp(0.62 + vip * 0.2 + urgency * 0.12 + (rng() - 0.5) * 0.08, 0.55, 0.95);
  const duration = Math.floor(38 + rng() * 210);

  const e: TraceEvent[] = [
    {
      id: "t_trigger",
      kind: "trigger",
      title: "Inbound message received",
      summary: `"${text}${text.length >= 120 ? "…" : ""}"`,
      at: triggerAt,
      meta: {
        channel: "Inbox",
        source: "Member",
      },
    },
    {
      id: "t_classifier",
      kind: "decision",
      title: "Intent classification",
      summary: "Classified message and extracted entities.",
      at: triggerAt + 1200,
      confidence,
      durationMs: duration,
      meta: {
        intent: urgency > 0.7 ? "Support: urgent" : "Support",
        entities: rng() > 0.5 ? "integration, event, profile" : "workflow, onboarding",
      },
    },
    {
      id: "t_rules",
      kind: "rule",
      title: "Rule evaluation",
      summary: "Evaluated matching rules and guardrails.",
      at: triggerAt + 2100,
      durationMs: Math.floor(12 + rng() * 40),
      meta: {
        matched: conversation.tags.includes("VIP") ? "VIP priority" : conversation.tags.includes("Escalated") ? "Escalation required" : "Standard handling",
        throttled: rng() > 0.92 ? "yes" : "no",
      },
    },
  ];

  if (conversation.tags.includes("VIP")) {
    e.push({
      id: "t_action_vip",
      kind: "action",
      title: "Apply VIP routing",
      summary: "Pinned thread and boosted response priority.",
      at: triggerAt + 2800,
      durationMs: Math.floor(8 + rng() * 22),
      meta: { queue: "Priority", sla: "10m" },
    });
  }

  if (conversation.tags.includes("Escalated") || risk > 0.7) {
    e.push({
      id: "t_action_escalate",
      kind: "action",
      title: "Escalate to human",
      summary: "Routed to a human operator due to risk/complexity.",
      at: triggerAt + 3200,
      durationMs: Math.floor(10 + rng() * 35),
      severity: conversation.tags.includes("Escalated") ? "critical" : "warn",
      meta: { reason: conversation.tags.includes("Escalated") ? "manual tag" : "risk score", risk: `${Math.round(risk * 100)}%` },
    });
  } else {
    e.push({
      id: "t_action_auto",
      kind: "action",
      title: "Auto-handle enabled",
      summary: "Selected best action set for automated reply.",
      at: triggerAt + 3200,
      durationMs: Math.floor(10 + rng() * 35),
      meta: { policy: "safe-reply", tools: rng() > 0.55 ? "knowledge-base" : "templates" },
    });
  }

  e.push({
    id: "t_state",
    kind: "state",
    title: "Conversation state updated",
    summary: "Updated state machine and audit fields.",
    at: triggerAt + 4200,
    durationMs: Math.floor(6 + rng() * 24),
    meta: {
      state: conversation.status === "resolved" ? "resolved" : conversation.status === "attention" ? "needs_attention" : "open",
      unread: String(conversation.unread),
    },
  });

  const lastNexus = [...messages]
    .filter((m) => m.role === "nexus")
    .sort((a, b) => b.at - a.at)[0];

  const replyAt = lastNexus?.at ?? triggerAt + 6000;
  e.push({
    id: "t_message",
    kind: "message",
    title: "Assistant reply drafted",
    summary: lastNexus?.text ? `"${lastNexus.text.slice(0, 140)}${lastNexus.text.length > 140 ? "…" : ""}"` : "Drafted a response for the operator.",
    at: replyAt,
    durationMs: Math.floor(24 + rng() * 130),
    meta: { author: "Nexus", delivery: conversation.online ? "read" : "delivered" },
  });

  if (rng() > 0.55) {
    e.push({
      id: "t_integration",
      kind: "integration",
      title: "Integration probe",
      summary: "Checked external context for better handling.",
      at: replyAt + 900,
      durationMs: Math.floor(45 + rng() * 240),
      meta: { provider: "Skool", result: rng() > 0.25 ? "ok" : "rate_limited" },
      severity: rng() > 0.85 ? "warn" : "info",
    });
  }

  return e.sort((a, b) => a.at - b.at);
}

export default function AutomationTracePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [activeKind, setActiveKind] = useState<TraceKind | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const inbox = safeParse<InboxState>(localStorage.getItem(INBOX_KEY));
    const messagesMap = safeParse<Record<string, Message[]>>(localStorage.getItem(MESSAGES_KEY)) ?? {};

    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("id");
    const id = fromQuery ?? inbox?.selectedId ?? null;
    const c = id ? inbox?.conversations?.find((x) => x.id === id) ?? null : null;

    const seed = c ? seedFromString(`${user?.email ?? "nexus"}:${c.id}:${c.name}`) : 0;
    const thread = c ? messagesMap[c.id] ?? [] : [];
    const nextEvents = c ? buildTrace(c, thread, seed) : [];

    queueMicrotask(() => {
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((data: { user: AuthUser | null }) => {
          queueMicrotask(() => setUser(data.user));
        })
        .catch(() => {
          // ignore
        });
      setConversation(c);
      setEvents(nextEvents);
      setSelectedId(nextEvents[0]?.id ?? null);
    });
  }, []);

  const ease = useMemo(() => cubicBezier(0.22, 1, 0.36, 1), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (activeKind !== "all" && e.kind !== activeKind) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        Object.values(e.meta ?? {}).some((v) => v.toLowerCase().includes(q))
      );
    });
  }, [events, activeKind, query]);

  const selected = useMemo(
    () => (selectedId ? events.find((e) => e.id === selectedId) ?? null : null),
    [events, selectedId]
  );

  const counts = useMemo(() => {
    const base: Record<TraceKind, number> = {
      trigger: 0,
      decision: 0,
      rule: 0,
      action: 0,
      message: 0,
      state: 0,
      integration: 0,
    };
    for (const e of events) base[e.kind]++;
    return base;
  }, [events]);

  const container = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease, staggerChildren: 0.05 } },
  };

  const item = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.25, ease } },
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Automation Trace</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Transparent, step-by-step log of how the system handled this conversation.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button variant="outline" className="cursor-pointer" onClick={() => router.push("/dashboard/conversations/inbox")}>
            <ArrowLeft size={16} />
            Back to Inbox
          </Button>
        </div>
      </motion.div>

      <motion.div variants={item} className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Context</CardTitle>
            <CardDescription>What this trace is anchored to.</CardDescription>
          </CardHeader>
          <CardContent>
            {!conversation ? (
              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-center">
                <div className="text-sm font-semibold text-zinc-900">No conversation selected</div>
                <div className="mt-1 text-xs text-zinc-500">Open a thread in Inbox, then return here.</div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <Avatar name={conversation.name} src={conversation.avatarUrl} online={conversation.online} size="lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-lg font-extrabold text-zinc-900">{conversation.name}</div>
                    <Badge variant={conversation.status === "attention" ? "amber" : conversation.status === "resolved" ? "green" : "blue"}>
                      {conversation.status === "attention" ? "Needs attention" : conversation.status === "resolved" ? "Resolved" : "Open"}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-zinc-500">{conversation.handle}</div>
                  <div className="mt-3 text-xs font-semibold text-zinc-500">
                    Last activity: {formatTime(conversation.lastAt)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {conversation.tags.length ? (
                      conversation.tags.map((t) => (
                        <Badge key={t} variant={t === "Escalated" ? "red" : t === "VIP" ? "blue" : "default"}>
                          {t}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs font-semibold text-zinc-500">No tags</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-8">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Controls</CardTitle>
                <CardDescription>Filter the trace by category and search.</CardDescription>
              </div>
              <div className="w-full sm:w-[360px]">
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search events..." />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "all" as const, label: "All", count: events.length },
                  { key: "decision" as const, label: "Decisions", count: counts.decision },
                  { key: "rule" as const, label: "Rules", count: counts.rule },
                  { key: "action" as const, label: "Actions", count: counts.action },
                  { key: "message" as const, label: "Messages", count: counts.message },
                  { key: "state" as const, label: "State", count: counts.state },
                  { key: "integration" as const, label: "Integrations", count: counts.integration },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveKind(t.key)}
                  className={cn(
                    "cursor-pointer inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    activeKind === t.key
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  )}
                >
                  <span>{t.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px]",
                      activeKind === t.key ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-600"
                    )}
                  >
                    {t.count}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={item} className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Timeline</CardTitle>
                <CardDescription>Every important step, ordered in time.</CardDescription>
              </div>
              <Badge variant="default">{filtered.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[62vh] overflow-y-auto overscroll-contain">
              {!filtered.length ? (
                <div className="px-5 pb-5">
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-center">
                    <div className="text-sm font-semibold text-zinc-900">No events</div>
                    <div className="mt-1 text-xs text-zinc-500">Try another filter or search.</div>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-4">
                  <div className="relative">
                    <div className="absolute left-4 top-0 h-full w-px bg-zinc-200" />
                    <div className="space-y-3">
                      {filtered.map((e, idx) => {
                        const Icon = kindIcon(e.kind);
                        const active = e.id === selectedId;
                        return (
                          <motion.button
                            key={e.id}
                            type="button"
                            onClick={() => setSelectedId(e.id)}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.01 + idx * 0.015, duration: 0.22, ease }}
                            className={cn(
                              "relative w-full cursor-pointer rounded-2xl border bg-white px-4 py-4 text-left transition-colors",
                              active ? "border-blue-200 bg-blue-50/40" : "border-zinc-200 hover:bg-zinc-50"
                            )}
                          >
                            <div className="absolute left-2.5 top-5 flex h-7 w-7 items-center justify-center rounded-xl border border-zinc-200 bg-white">
                              <Icon size={14} className={cn(e.severity ? severityTone(e.severity) : "text-zinc-700")} />
                            </div>

                            <div className="pl-10">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="truncate text-sm font-semibold text-zinc-900">{e.title}</div>
                                    <Badge variant={kindVariant(e.kind)}>{kindLabel(e.kind)}</Badge>
                                    {typeof e.confidence === "number" && (
                                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-700">
                                        {Math.round(e.confidence * 100)}%
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-2 text-sm text-zinc-700">{e.summary}</div>
                                  {e.meta && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {Object.entries(e.meta).slice(0, 3).map(([k, v]) => (
                                        <span
                                          key={k}
                                          className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600"
                                        >
                                          {k}: {v}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="shrink-0 text-xs font-semibold text-zinc-500">{formatTime(e.at)}</div>
                              </div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Event details</CardTitle>
            <CardDescription>Why the system did what it did.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-center">
                <div className="text-sm font-semibold text-zinc-900">Select an event</div>
                <div className="mt-1 text-xs text-zinc-500">Click any timeline row to inspect it.</div>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-lg font-extrabold text-zinc-900">{selected.title}</div>
                      <Badge variant={kindVariant(selected.kind)}>{kindLabel(selected.kind)}</Badge>
                    </div>
                    <div className="mt-2 text-sm text-zinc-700">{selected.summary}</div>
                  </div>
                  <div className="shrink-0 text-xs font-semibold text-zinc-500">{formatTime(selected.at)}</div>
                </div>

                <Separator className="my-5" />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                    <div className="text-xs text-zinc-500">Kind</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-900">{kindLabel(selected.kind)}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                    <div className="text-xs text-zinc-500">Duration</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-900">
                      {typeof selected.durationMs === "number" ? `${selected.durationMs} ms` : "—"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                    <div className="text-xs text-zinc-500">Confidence</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-900">
                      {typeof selected.confidence === "number" ? `${Math.round(selected.confidence * 100)}%` : "—"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                    <div className="text-xs text-zinc-500">Severity</div>
                    <div className={cn("mt-1 text-sm font-semibold", severityTone(selected.severity))}>
                      {selected.severity ?? "info"}
                    </div>
                  </div>
                </div>

                {selected.meta && (
                  <>
                    <Separator className="my-5" />
                    <div className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                      <ScrollText size={16} />
                      Metadata
                    </div>
                    <div className="mt-3 space-y-2">
                      {Object.entries(selected.meta).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                          <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">{k}</span>
                          <span className="text-sm font-semibold text-zinc-900">{v}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <Separator className="my-5" />

                <div className="flex flex-col gap-2">
                  <Button className="cursor-pointer" onClick={() => router.push("/dashboard/automations/simulator")}>
                    Run simulator
                    <ArrowUpRight size={14} />
                  </Button>
                  <Button variant="outline" className="cursor-pointer" onClick={() => router.push("/dashboard/audit/decisions")}>
                    Open audit logs
                    <ArrowUpRight size={14} />
                  </Button>
                </div>

                {selected.severity && selected.severity !== "info" && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="flex items-start gap-2">
                      <TriangleAlert size={16} className="mt-0.5 text-amber-700" />
                      <div>
                        <div className="text-sm font-semibold text-amber-900">Attention</div>
                        <div className="mt-1 text-xs text-amber-800">
                          This event indicates potential risk or a guardrail was triggered.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
