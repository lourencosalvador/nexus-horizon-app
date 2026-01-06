"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cubicBezier, motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  Cpu,
  FileJson2,
  GitBranch,
  MessageSquareText,
  Play,
  RotateCcw,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/lib/utils";
type AuthUser = { email?: string };
import { toast } from "sonner";

type ScenarioKey = "message_received" | "member_joined" | "flag_raised";

type SimulatorEvent = {
  type: ScenarioKey;
  message?: string;
  memberName?: string;
  tags?: string[];
  channel?: "inbox" | "dm" | "comment";
  severity?: "low" | "medium" | "high";
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

type StateSnapshot = {
  status: "open" | "attention" | "resolved";
  tags: string[];
  unread: number;
  replyDrafted: boolean;
  escalated: boolean;
  riskScore: number;
};

type SimulationRun = {
  id: string;
  at: number;
  scenario: ScenarioKey;
  input: SimulatorEvent;
  trace: TraceEvent[];
  before: StateSnapshot;
  after: StateSnapshot;
};

const RUNS_KEY = "nexus_demo_sim_runs_v1";

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function seedFromString(input: string) {
  let s = 0;
  for (let i = 0; i < input.length; i++) s = (s + input.charCodeAt(i) * (i + 1)) % 1000000;
  return s;
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
  if (kind === "action") return "green";
  if (kind === "state") return "amber";
  if (kind === "message") return "blue";
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

function normalizeEvent(input: SimulatorEvent): SimulatorEvent {
  const tags = Array.isArray(input.tags) ? input.tags.filter(Boolean).slice(0, 8) : [];
  const message = typeof input.message === "string" ? input.message.slice(0, 400) : undefined;
  const memberName = typeof input.memberName === "string" ? input.memberName.slice(0, 40) : undefined;
  const channel = input.channel === "dm" || input.channel === "comment" ? input.channel : "inbox";
  const severity =
    input.severity === "high" || input.severity === "medium" ? input.severity : input.severity === "low" ? "low" : "medium";
  return { ...input, tags, message, memberName, channel, severity };
}

function buildDefaults(scenario: ScenarioKey): SimulatorEvent {
  if (scenario === "member_joined") {
    return {
      type: "member_joined",
      memberName: "Jane Cooper",
      channel: "inbox",
      tags: ["New Member"],
      severity: "low",
      message: "Joined the community and completed onboarding.",
    };
  }
  if (scenario === "flag_raised") {
    return {
      type: "flag_raised",
      memberName: "Wade Warren",
      channel: "comment",
      tags: ["Potential Lead"],
      severity: "high",
      message: "Multiple reports: suspicious content in public thread.",
    };
  }
  return {
    type: "message_received",
    memberName: "Sofia Martins",
    channel: "dm",
    tags: ["Question-Asked"],
    severity: "medium",
    message: "I’m getting an error when I try to join the event. Can you help?",
  };
}

function simulateRun(input: SimulatorEvent, userSeed: string): SimulationRun {
  const normalized = normalizeEvent(input);
  const seed = seedFromString(`${userSeed}:${JSON.stringify(normalized)}`);
  const rng = mulberry32(seed);
  const now = Date.now();
  const runId = `run_${now}_${Math.floor(rng() * 9999)}`;

  const baseRisk =
    normalized.type === "flag_raised" ? 0.78 : normalized.severity === "high" ? 0.72 : normalized.severity === "low" ? 0.25 : 0.48;
  const hasEscalatedTag = (normalized.tags ?? []).some((t) => t.toLowerCase().includes("escalat"));
  const vip = (normalized.tags ?? []).some((t) => t.toLowerCase() === "vip");
  const riskScore = clamp(baseRisk + (hasEscalatedTag ? 0.15 : 0) + (vip ? -0.12 : 0) + (rng() - 0.5) * 0.12, 0.05, 0.95);

  const before: StateSnapshot = {
    status: "open",
    tags: normalized.tags ?? [],
    unread: normalized.type === "member_joined" ? 0 : 1,
    replyDrafted: false,
    escalated: false,
    riskScore,
  };

  const confidence = clamp(0.62 + (vip ? 0.18 : 0) + (1 - riskScore) * 0.15 + (rng() - 0.5) * 0.08, 0.55, 0.95);
  const escalated = riskScore > 0.75 || hasEscalatedTag || normalized.type === "flag_raised";

  const status: StateSnapshot["status"] = escalated ? "attention" : normalized.severity === "high" ? "attention" : "open";
  const after: StateSnapshot = {
    status,
    tags: before.tags,
    unread: before.unread,
    replyDrafted: !escalated,
    escalated,
    riskScore,
  };

  const at0 = now - 1200;
  const trace: TraceEvent[] = [
    {
      id: `${runId}_t1`,
      kind: "trigger",
      title: "Event ingested",
      summary: `Accepted input: ${normalized.type.replace(/_/g, " ")}`,
      at: at0,
      meta: { channel: normalized.channel ?? "inbox" },
    },
    {
      id: `${runId}_t2`,
      kind: "decision",
      title: "Classifier pass",
      summary: "Normalized fields, extracted intent and signals.",
      at: at0 + 600,
      durationMs: Math.floor(40 + rng() * 180),
      confidence,
      meta: {
        severity: normalized.severity ?? "medium",
        tags: (normalized.tags ?? []).slice(0, 3).join(", ") || "none",
      },
    },
    {
      id: `${runId}_t3`,
      kind: "rule",
      title: "Rule evaluation",
      summary: "Matched rules and validated guardrails.",
      at: at0 + 1200,
      durationMs: Math.floor(12 + rng() * 40),
      meta: {
        matched: escalated ? "Escalation required" : vip ? "VIP fast-path" : "Standard handling",
        risk: `${Math.round(riskScore * 100)}%`,
      },
      severity: riskScore > 0.8 ? "warn" : "info",
    },
    {
      id: `${runId}_t4`,
      kind: "action",
      title: escalated ? "Escalate to human" : "Select automated action",
      summary: escalated
        ? "Routed to a human operator due to risk/complexity."
        : "Prepared safe response and next-step suggestion.",
      at: at0 + 1800,
      durationMs: Math.floor(18 + rng() * 65),
      severity: escalated ? "critical" : "info",
      meta: { policy: escalated ? "handoff" : "safe-reply" },
    },
    {
      id: `${runId}_t5`,
      kind: "state",
      title: "State transition",
      summary: `Status -> ${after.status}`,
      at: at0 + 2300,
      durationMs: Math.floor(8 + rng() * 28),
      meta: { unread: String(after.unread), replyDrafted: after.replyDrafted ? "yes" : "no" },
    },
  ];

  if (!escalated) {
    trace.push({
      id: `${runId}_t6`,
      kind: "message",
      title: "Draft reply",
      summary: normalized.message
        ? `Drafted response for: "${normalized.message.slice(0, 90)}${normalized.message.length > 90 ? "…" : ""}"`
        : "Drafted a response template.",
      at: at0 + 2900,
      durationMs: Math.floor(35 + rng() * 140),
      meta: { author: "Nexus", delivery: "draft" },
    });
  } else {
    trace.push({
      id: `${runId}_t6`,
      kind: "integration",
      title: "Operator handoff prepared",
      summary: "Created handoff packet: context, risks, suggested actions.",
      at: at0 + 2900,
      durationMs: Math.floor(60 + rng() * 220),
      meta: { destination: "Inbox queue", sla: "10m" },
      severity: "warn",
    });
  }

  return {
    id: runId,
    at: now,
    scenario: normalized.type,
    input: normalized,
    trace: trace.sort((a, b) => a.at - b.at),
    before,
    after,
  };
}

function diffEntries(before: StateSnapshot, after: StateSnapshot) {
  const out: Array<{ key: string; before: string; after: string; changed: boolean }> = [];
  const keys: Array<keyof StateSnapshot> = ["status", "unread", "replyDrafted", "escalated", "riskScore", "tags"];
  for (const k of keys) {
    const b =
      k === "tags"
        ? (before.tags ?? []).join(", ") || "none"
        : k === "riskScore"
        ? `${Math.round(before.riskScore * 100)}%`
        : String(before[k]);
    const a =
      k === "tags"
        ? (after.tags ?? []).join(", ") || "none"
        : k === "riskScore"
        ? `${Math.round(after.riskScore * 100)}%`
        : String(after[k]);
    out.push({ key: String(k), before: b, after: a, changed: b !== a });
  }
  return out;
}

export default function SimulatorPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [scenario, setScenario] = useState<ScenarioKey>("message_received");
  const [event, setEvent] = useState<SimulatorEvent>(() => buildDefaults("message_received"));
  const [json, setJson] = useState<string>(() => JSON.stringify(buildDefaults("message_received"), null, 2));

  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const jsonRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const stored = safeParse<SimulationRun[]>(localStorage.getItem(RUNS_KEY)) ?? [];
    queueMicrotask(() => {
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((data: { user: AuthUser | null }) => {
          queueMicrotask(() => setUser(data.user));
        })
        .catch(() => {
          // ignore
        });
      setRuns(stored);
      setActiveRunId(stored[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(0, 20)));
  }, [runs]);

  const ease = useMemo(() => cubicBezier(0.22, 1, 0.36, 1), []);

  const activeRun = useMemo(
    () => (activeRunId ? runs.find((r) => r.id === activeRunId) ?? null : null),
    [runs, activeRunId]
  );

  const selectedTrace = useMemo(() => {
    if (!activeRun) return null;
    return selectedEventId ? activeRun.trace.find((t) => t.id === selectedEventId) ?? null : activeRun.trace[0] ?? null;
  }, [activeRun, selectedEventId]);

  const onPickScenario = (next: ScenarioKey) => {
    setScenario(next);
    const e = buildDefaults(next);
    setEvent(e);
    setJson(JSON.stringify(e, null, 2));
  };

  const syncJsonToEvent = () => {
    const parsed = safeParse<SimulatorEvent>(json);
    if (!parsed || !parsed.type) {
      toast.error("Invalid JSON. Please provide an object with a 'type'.");
      return false;
    }
    const t = parsed.type;
    if (t !== "message_received" && t !== "member_joined" && t !== "flag_raised") {
      toast.error("Unknown event type. Use: message_received, member_joined, flag_raised.");
      return false;
    }
    setScenario(t);
    setEvent(parsed);
    return true;
  };

  const runSimulation = async () => {
    if (!syncJsonToEvent()) return;
    setRunning(true);
    const seed = user?.email ?? "nexus";
    const input = safeParse<SimulatorEvent>(json);
    if (!input) {
      setRunning(false);
      return;
    }
    const run = simulateRun(input, seed);

    await new Promise<void>((r) => window.setTimeout(() => r(), 350));

    setRuns((prev) => [run, ...prev].slice(0, 20));
    setActiveRunId(run.id);
    setSelectedEventId(run.trace[0]?.id ?? null);
    setRunning(false);
  };

  const resetEditor = () => {
    const e = buildDefaults(scenario);
    setEvent(e);
    setJson(JSON.stringify(e, null, 2));
    toast.success("Reset to scenario defaults.");
  };

  const applyQuickField = (patch: Partial<SimulatorEvent>) => {
    const next: SimulatorEvent = { ...event, ...patch, type: scenario };
    setEvent(next);
    setJson(JSON.stringify(next, null, 2));
  };

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
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Simulator</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Test automation behavior without touching the real inbox. Runs are deterministic per input.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button variant="outline" className="cursor-pointer" onClick={() => window.location.assign("/dashboard/conversations/trace")}>
            Open trace
            <ArrowUpRight size={14} />
          </Button>
          <Button className="cursor-pointer" onClick={() => void runSimulation()} disabled={running}>
            <Play size={16} />
            {running ? "Running…" : "Run simulation"}
          </Button>
        </div>
      </motion.div>

      <motion.div variants={item} className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileJson2 size={16} className="text-zinc-900" />
                  Input
                </CardTitle>
                <CardDescription>Pick a scenario, edit JSON, then run.</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="cursor-pointer" onClick={resetEditor}>
                <RotateCcw size={14} />
                Reset
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "message_received" as const, label: "Message received" },
                  { key: "member_joined" as const, label: "Member joined" },
                  { key: "flag_raised" as const, label: "Flag raised" },
                ] as const
              ).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onPickScenario(s.key)}
                  className={cn(
                    "cursor-pointer inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    scenario === s.key
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  )}
                >
                  <span>{s.label}</span>
                </button>
              ))}
            </div>

            <Separator />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Member name</div>
                <div className="mt-2">
                  <Input
                    value={event.memberName ?? ""}
                    onChange={(e) => applyQuickField({ memberName: e.target.value })}
                    placeholder="e.g. Jane Cooper"
                  />
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-900">Channel</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["inbox", "dm", "comment"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => applyQuickField({ channel: c })}
                      className={cn(
                        "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                        (event.channel ?? "inbox") === c
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-sm font-semibold text-zinc-900">Message</div>
                <div className="mt-2">
                  <Input
                    value={event.message ?? ""}
                    onChange={(e) => applyQuickField({ message: e.target.value })}
                    placeholder="Write a short event payload…"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-900">JSON</div>
                <button
                  type="button"
                  className="cursor-pointer text-xs font-semibold text-zinc-600 hover:text-zinc-900"
                  onClick={() => {
                    jsonRef.current?.focus();
                    toast.warning("Paste or edit JSON, then run simulation.");
                  }}
                >
                  Focus editor
                </button>
              </div>
              <div className="mt-2">
                <Textarea
                  ref={jsonRef}
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  className="min-h-[280px] font-mono text-[12px]"
                  spellCheck={false}
                />
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                Tip: event must include a <span className="font-semibold text-zinc-700">type</span>.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ScrollText size={16} className="text-zinc-900" />
                  Output
                </CardTitle>
                <CardDescription>Trace timeline + state diff.</CardDescription>
              </div>
              <Badge variant="default">{runs.length} runs</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {!activeRun ? (
              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-8 text-center">
                <div className="text-sm font-semibold text-zinc-900">No runs yet</div>
                <div className="mt-1 text-xs text-zinc-500">Run a simulation to see the trace and diff.</div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default">{activeRun.scenario.replace(/_/g, " ")}</Badge>
                    <span className="text-xs font-semibold text-zinc-500">{formatTime(activeRun.at)}</span>
                    {activeRun.after.escalated && (
                      <Badge variant="red">Escalated</Badge>
                    )}
                    {activeRun.after.replyDrafted && (
                      <Badge variant="green">Reply drafted</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <select
                        className="h-10 cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900"
                        value={activeRunId ?? ""}
                        onChange={(e) => {
                          setActiveRunId(e.target.value);
                          const run = runs.find((r) => r.id === e.target.value);
                          setSelectedEventId(run?.trace[0]?.id ?? null);
                        }}
                      >
                        {runs.map((r) => (
                          <option key={r.id} value={r.id}>
                            {new Date(r.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} —{" "}
                            {r.scenario.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid gap-4 lg:grid-cols-12">
                  <div className="lg:col-span-7">
                    <div className="text-sm font-semibold text-zinc-900">Timeline</div>
                    <div className="mt-3 max-h-[48vh] overflow-y-auto overscroll-contain space-y-2 pr-1">
                      {activeRun.trace.map((t, idx) => {
                        const Icon = kindIcon(t.kind);
                        const active = t.id === (selectedEventId ?? activeRun.trace[0]?.id);
                        return (
                          <motion.button
                            key={t.id}
                            type="button"
                            onClick={() => setSelectedEventId(t.id)}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.01 + idx * 0.015, duration: 0.22, ease }}
                            className={cn(
                              "w-full cursor-pointer rounded-2xl border bg-white px-4 py-3 text-left transition-colors",
                              active ? "border-blue-200 bg-blue-50/40" : "border-zinc-200 hover:bg-zinc-50"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white">
                                  <Icon size={14} className={cn(t.severity ? severityTone(t.severity) : "text-zinc-700")} />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="truncate text-sm font-semibold text-zinc-900">{t.title}</div>
                                    <Badge variant={kindVariant(t.kind)}>{kindLabel(t.kind)}</Badge>
                                    {typeof t.confidence === "number" && (
                                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-700">
                                        {Math.round(t.confidence * 100)}%
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1 truncate text-sm text-zinc-700">{t.summary}</div>
                                </div>
                              </div>
                              <div className="shrink-0 text-xs font-semibold text-zinc-500">{formatTime(t.at)}</div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="lg:col-span-5">
                    <div className="text-sm font-semibold text-zinc-900">Details</div>
                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-4">
                      {!selectedTrace ? (
                        <div className="text-sm font-semibold text-zinc-900">Select a timeline row</div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-lg font-extrabold text-zinc-900">{selectedTrace.title}</div>
                              <div className="mt-1 text-sm text-zinc-700">{selectedTrace.summary}</div>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Badge variant={kindVariant(selectedTrace.kind)}>{kindLabel(selectedTrace.kind)}</Badge>
                                {typeof selectedTrace.durationMs === "number" && (
                                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-700">
                                    {selectedTrace.durationMs} ms
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-xs font-semibold text-zinc-500">{formatTime(selectedTrace.at)}</div>
                          </div>

                          {selectedTrace.meta && (
                            <>
                              <Separator />
                              <div className="space-y-2">
                                {Object.entries(selectedTrace.meta).map(([k, v]) => (
                                  <div
                                    key={k}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2"
                                  >
                                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">{k}</span>
                                    <span className="text-sm font-semibold text-zinc-900">{v}</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}

                          {selectedTrace.severity && selectedTrace.severity !== "info" && (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                              <div className="flex items-start gap-2">
                                <TriangleAlert size={16} className="mt-0.5 text-amber-700" />
                                <div>
                                  <div className="text-sm font-semibold text-amber-900">Guardrail triggered</div>
                                  <div className="mt-1 text-xs text-amber-800">
                                    This step indicates elevated risk or requires operator review.
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <div className="text-sm font-semibold text-zinc-900">State diff</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {diffEntries(activeRun.before, activeRun.after).map((d) => (
                      <div
                        key={d.key}
                        className={cn(
                          "rounded-2xl border bg-white px-4 py-3",
                          d.changed ? "border-blue-200" : "border-zinc-200"
                        )}
                      >
                        <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">{d.key}</div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-zinc-500">{d.before}</span>
                          <span className="text-xs font-semibold text-zinc-400">→</span>
                          <span className={cn("text-xs font-extrabold", d.changed ? "text-blue-700" : "text-zinc-900")}>
                            {d.after}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
