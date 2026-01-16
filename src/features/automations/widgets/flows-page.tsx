"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, cubicBezier, motion } from "framer-motion";
import {
  ArrowUpRight,
  CheckCircle2,
  Check,
  Settings,
  Copy,
  ChevronDown,
  Filter,
  GitBranch,
  Maximize2,
  Plus,
  X,
  ZoomIn,
  ZoomOut,
  LocateFixed,
  Search,
  SlidersHorizontal,
  Trash2,
  Workflow,
} from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { FlowCanvasReactFlow } from "@/features/automations/widgets/flow-canvas-reactflow";

type FlowStatus = "enabled" | "paused" | "draft";

type FlowTrigger = {
  type: "message_received" | "member_joined" | "flag_raised";
  channel?: "inbox" | "dm" | "comment";
};

type FlowNodeKind = "trigger" | "condition" | "guardrail" | "action";

type FlowNode = {
  id: string;
  kind: FlowNodeKind;
  label: string;
  x: number;
  y: number;
};

type FlowEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

type Flow = {
  id: string;
  name: string;
  status: FlowStatus;
  trigger: FlowTrigger;
  tags: string[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  updatedAt: number;
  runs7d: number;
};

type FlowsState = {
  flows: Flow[];
  selectedId: string | null;
};

const STORAGE_KEY = "nexus_demo_flows_v2";
const STORAGE_KEY_V1 = "nexus_demo_flows_v1";

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function seedFromString(input: string) {
  let s = 0;
  for (let i = 0; i < input.length; i++) s = (s + input.charCodeAt(i) * (i + 1)) % 1000000;
  return s;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statusBadge(status: FlowStatus) {
  if (status === "enabled") return { variant: "green" as const, label: "Enabled" };
  if (status === "paused") return { variant: "amber" as const, label: "Paused" };
  return { variant: "default" as const, label: "Draft" };
}

function triggerLabel(t: FlowTrigger) {
  const base =
    t.type === "message_received"
      ? "Message received"
      : t.type === "member_joined"
      ? "Member joined"
      : "Flag raised";
  if (!t.channel) return base;
  return `${base} · ${t.channel}`;
}

function nodeLabel(kind: FlowNodeKind) {
  if (kind === "trigger") return "Trigger";
  if (kind === "condition") return "Condition";
  if (kind === "guardrail") return "Guardrail";
  return "Action";
}

function nodeIcon(kind: FlowNodeKind) {
  if (kind === "trigger") return Workflow;
  if (kind === "condition") return GitBranch;
  if (kind === "guardrail") return SlidersHorizontal;
  return CheckCircle2;
}

function nodeTone(kind: FlowNodeKind) {
  if (kind === "trigger") return "border-blue-200 bg-blue-50/40";
  if (kind === "guardrail") return "border-amber-200 bg-amber-50/40";
  if (kind === "condition") return "border-zinc-200 bg-white";
  return "border-emerald-200 bg-emerald-50/30";
}

function migrateToCanvas(flow: unknown): Flow {
  const now = Date.now();
  const obj =
    typeof flow === "object" && flow !== null ? (flow as Record<string, unknown>) : ({} as Record<string, unknown>);
  const id = typeof obj.id === "string" ? obj.id : `flow_${now}`;
  const name = typeof obj.name === "string" ? obj.name : "Untitled flow";
  const status: FlowStatus = obj.status === "enabled" || obj.status === "paused" ? (obj.status as FlowStatus) : "draft";
  const triggerObj = typeof obj.trigger === "object" && obj.trigger !== null ? (obj.trigger as Record<string, unknown>) : null;
  const trigger: FlowTrigger =
    triggerObj && typeof triggerObj.type === "string"
      ? (obj.trigger as FlowTrigger)
      : { type: "message_received", channel: "inbox" };
  const tags: string[] = Array.isArray(obj.tags) ? (obj.tags as unknown[]).filter(Boolean).map(String) : [];
  const updatedAt = typeof obj.updatedAt === "number" ? obj.updatedAt : now;
  const runs7d = typeof obj.runs7d === "number" ? obj.runs7d : 0;

  const nodesIn = Array.isArray(obj.nodes) ? (obj.nodes as unknown[]) : null;
  const edgesIn = Array.isArray(obj.edges) ? (obj.edges as unknown[]) : null;

  if (nodesIn?.length && edgesIn?.length) {
    const nodes = nodesIn
      .map((n: unknown) => {
        const r = typeof n === "object" && n !== null ? (n as Record<string, unknown>) : {};
        return {
          id: String(r.id ?? ""),
          kind: ((r.kind as FlowNodeKind) ?? "condition") as FlowNodeKind,
          label: String(r.label ?? ""),
          x: typeof r.x === "number" ? r.x : 0,
          y: typeof r.y === "number" ? r.y : 0,
        };
      })
      .filter((n: { id: string; label: string }) => Boolean(n.id) && Boolean(n.label));
    const edges = edgesIn
      .map((e: unknown) => {
        const r = typeof e === "object" && e !== null ? (e as Record<string, unknown>) : {};
        return { id: String(r.id ?? ""), from: String(r.from ?? ""), to: String(r.to ?? "") };
      })
      .filter((e: { id: string; from: string; to: string }) => Boolean(e.id) && Boolean(e.from) && Boolean(e.to));
    return { id, name, status, trigger, tags, nodes, edges, updatedAt, runs7d };
  }

  const steps = Array.isArray(obj.steps) ? (obj.steps as unknown[]) : [];
  const triggerNode: FlowNode = {
    id: `${id}_trigger`,
    kind: "trigger",
    label: triggerLabel(trigger),
    x: 80,
    y: 120,
  };

  const nodes: FlowNode[] = [triggerNode];
  const edges: FlowEdge[] = [];
  let prev = triggerNode.id;
  let x = 320;
  const y = 120;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const srec = typeof s === "object" && s !== null ? (s as Record<string, unknown>) : {};
    const kind: FlowNodeKind =
      srec.kind === "guardrail" ? "guardrail" : srec.kind === "action" ? "action" : "condition";
    const label = typeof srec.label === "string" ? srec.label : nodeLabel(kind);
    const nid = `${id}_n${i}_${kind}`;
    nodes.push({ id: nid, kind, label, x, y });
    edges.push({ id: `${id}_e${i}`, from: prev, to: nid });
    prev = nid;
    x += 260;
  }

  if (steps.length === 0) {
    const n1: FlowNode = { id: `${id}_n0_condition`, kind: "condition", label: "Detect intent & risk", x: 320, y: 120 };
    const n2: FlowNode = { id: `${id}_n1_guardrail`, kind: "guardrail", label: "Apply policy constraints", x: 580, y: 120 };
    const n3: FlowNode = { id: `${id}_n2_action`, kind: "action", label: "Draft reply + next best action", x: 840, y: 120 };
    nodes.push(n1, n2, n3);
    edges.push(
      { id: `${id}_e0`, from: triggerNode.id, to: n1.id },
      { id: `${id}_e1`, from: n1.id, to: n2.id },
      { id: `${id}_e2`, from: n2.id, to: n3.id }
    );
  }

  return { id, name, status, trigger, tags, nodes, edges, updatedAt, runs7d };
}

function buildDefaultFlow(seed: number, name: string, status: FlowStatus, trigger: FlowTrigger): Flow {
  const rng = mulberry32(seed);
  const now = Date.now();
  const tags: string[] = [];
  if (rng() < 0.35) tags.push("Guardrails");
  if (rng() < 0.22) tags.push("VIP");
  if (rng() < 0.28) tags.push("Onboarding");

  const id = `flow_${seed}_${Math.floor(rng() * 9999)}`;

  const triggerNode: FlowNode = { id: `${id}_trigger`, kind: "trigger", label: triggerLabel(trigger), x: 80, y: 160 };
  const n1: FlowNode = { id: `${id}_n0_condition`, kind: "condition", label: "Detect intent & risk", x: 320, y: 160 };
  const n2: FlowNode = { id: `${id}_n1_guardrail`, kind: "guardrail", label: "Apply policy constraints", x: 580, y: 160 };
  const n3: FlowNode = { id: `${id}_n2_action`, kind: "action", label: "Draft reply + next best action", x: 840, y: 160 };

  const nodes = [triggerNode, n1, n2, n3];
  const edges: FlowEdge[] = [
    { id: `${id}_e0`, from: triggerNode.id, to: n1.id },
    { id: `${id}_e1`, from: n1.id, to: n2.id },
    { id: `${id}_e2`, from: n2.id, to: n3.id },
  ];

  return {
    id,
    name,
    status,
    trigger,
    tags,
    nodes,
    edges,
    updatedAt: now - Math.floor(rng() * 1000 * 60 * 60 * 24 * 8),
    runs7d: Math.floor(rng() * 380),
  };
}

function buildSeedFlows(userSeed: string): Flow[] {
  const seed = seedFromString(userSeed);
  const rng = mulberry32(seed);

  const samples: Array<{ name: string; status: FlowStatus; trigger: FlowTrigger }> = [
    { name: "Inbox triage (safe-reply)", status: "enabled", trigger: { type: "message_received", channel: "inbox" } },
    { name: "New member onboarding", status: "enabled", trigger: { type: "member_joined" } },
    { name: "Flag handling & escalation", status: "paused", trigger: { type: "flag_raised", channel: "comment" } },
    { name: "VIP fast-path", status: "draft", trigger: { type: "message_received", channel: "dm" } },
  ];

  const flows = samples.map((s, i) => buildDefaultFlow(seed + i * 17, s.name, s.status, s.trigger));

  if (rng() > 0.35) flows.push(buildDefaultFlow(seed + 99, "Follow-up nudges", "draft", { type: "message_received" }));
  if (rng() > 0.55) flows.push(buildDefaultFlow(seed + 141, "Auto-tag leads", "enabled", { type: "message_received" }));

  return flows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export default function FlowsPage() {
  const [seedKey, setSeedKey] = useState<string>("nexus");
  const [state, setState] = useState<FlowsState>({ flows: [], selectedId: null });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FlowStatus | "all">("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [expandedOpen, setExpandedOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const configRef = useRef<HTMLDivElement | null>(null);
  const [createName, setCreateName] = useState("");
  const [createTrigger, setCreateTrigger] = useState<FlowTrigger>({ type: "message_received", channel: "inbox" });
  const [createStatus, setCreateStatus] = useState<FlowStatus>("draft");
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const expandedRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: { user: { email?: string } | null }) => {
        queueMicrotask(() => setSeedKey(data.user?.email ?? "nexus"));
      })
      .catch(() => {
        // ignore
      });
    const v2 = safeParse<FlowsState>(localStorage.getItem(STORAGE_KEY));
    const v1 = safeParse<unknown>(localStorage.getItem(STORAGE_KEY_V1));

    const hydrate = (raw: unknown): FlowsState | null => {
      const rec = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
      if (!rec) return null;
      const flowsRaw = rec.flows;
      const selectedRaw = rec.selectedId;
      if (!Array.isArray(flowsRaw) || flowsRaw.length === 0) return null;
      const flows = (flowsRaw as unknown[]).map((f) => migrateToCanvas(f));
      const selectedId =
        typeof selectedRaw === "string" && flows.some((f) => f.id === selectedRaw) ? selectedRaw : flows[0]?.id ?? null;
      return { flows, selectedId };
    };

    const hydrated = hydrate(v2) ?? hydrate(v1);
    if (hydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hydrated));
      queueMicrotask(() => setState(hydrated));
      return;
    }

    const flows = buildSeedFlows(seedKey);
    const next: FlowsState = { flows, selectedId: flows[0]?.id ?? null };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    queueMicrotask(() => setState(next));
  }, []);

  useEffect(() => {
    if (!state.flows.length) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!createOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCreateOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      const el = modalRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setCreateOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [createOpen]);

  useEffect(() => {
    if (!expandedOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      const el = expandedRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setExpandedOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [expandedOpen]);

  useEffect(() => {
    if (!configOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfigOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      const el = configRef.current;
      if (!el) return;
      if (!el.contains(t)) setConfigOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [configOpen]);

  useEffect(() => {
    if (!triggerOpen && !statusOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTriggerOpen(false);
        setStatusOpen(false);
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (triggerRef.current && triggerRef.current.contains(t)) return;
      if (statusRef.current && statusRef.current.contains(t)) return;
      setTriggerOpen(false);
      setStatusOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [triggerOpen, statusOpen]);

  const ease = useMemo(() => cubicBezier(0.22, 1, 0.36, 1), []);

  const selected = useMemo(
    () => state.flows.find((f) => f.id === state.selectedId) ?? null,
    [state.flows, state.selectedId]
  );

  useEffect(() => {
    if (!selected) return;
    queueMicrotask(() => {
      setSelectedNodeId(selected.nodes[0]?.id ?? null);
    });
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.flows.filter((f) => {
      if (filter !== "all" && f.status !== filter) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        triggerLabel(f.trigger).toLowerCase().includes(q) ||
        f.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [state.flows, query, filter]);

  const counts = useMemo(() => {
    const base = { all: 0, enabled: 0, paused: 0, draft: 0 };
    for (const f of state.flows) {
      base.all++;
      base[f.status]++;
    }
    return base;
  }, [state.flows]);

  const selectFlow = (id: string) => {
    setState((prev) => ({ ...prev, selectedId: id }));
  };

  const updateFlow = (id: string, updater: (f: Flow) => Flow) => {
    setState((prev) => {
      const flows = prev.flows.map((f) => (f.id === id ? updater(f) : f));
      return { ...prev, flows };
    });
  };

  const addNode = (kind: Exclude<FlowNodeKind, "trigger">) => {
    if (!selected) return;
    
    // Safety check: ensure flow has a trigger
    const hasTrigger = selected.nodes.some((n) => n.kind === "trigger");
    if (!hasTrigger) {
      toast.error("❌ Erro: Flow sem trigger! Use o botão EMERGENCY RESET primeiro.");
      return;
    }
    
    // Safety check: prevent too many nodes
    if (selected.nodes.length >= 50) {
      toast.error("❌ Limite de 50 nodes atingido! Use o botão EMERGENCY RESET para limpar.");
      return;
    }
    
    const now = Date.now();
    const id = `${selected.id}_n_${kind}_${now}`;
    const label = kind === "condition" ? "New condition" : kind === "guardrail" ? "New guardrail" : "New action";

    updateFlow(selected.id, (f) => {
      const last = f.nodes.filter((n) => n.kind !== "trigger").slice(-1)[0] ?? f.nodes[0];
      const node: FlowNode = { id, kind, label, x: (last?.x ?? 80) + 280, y: last?.y ?? 160 };
      const edge: FlowEdge = { id: `${selected.id}_e_${now}`, from: last.id, to: node.id, label: "" };
      return { ...f, nodes: [...f.nodes, node], edges: [...f.edges, edge], updatedAt: Date.now() };
    });

    setSelectedNodeId(id);
    toast.success(`✅ ${label} added! (${selected.nodes.length + 1} nodes total)`);
  };

  const deleteSelectedNode = () => {
    if (!selected || !selectedNodeId) return;
    const node = selected.nodes.find((n) => n.id === selectedNodeId);
    if (!node || node.kind === "trigger") return;
    updateFlow(selected.id, (f) => {
      const nodes = f.nodes.filter((n) => n.id !== selectedNodeId);
      const edges = f.edges.filter((e) => e.from !== selectedNodeId && e.to !== selectedNodeId);
      return { ...f, nodes, edges, updatedAt: Date.now() };
    });
    setSelectedNodeId(selected.nodes[0]?.id ?? null);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (createOpen) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const el = document.activeElement;
      if (el instanceof HTMLElement) {
        const tag = el.tagName.toLowerCase();
        const typing =
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          el.isContentEditable;
        if (typing) return;
      }
      if (!selected || !selectedNodeId) return;
      const node = selected.nodes.find((n) => n.id === selectedNodeId);
      if (!node || node.kind === "trigger") return;
      e.preventDefault();
      deleteSelectedNode();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, deleteSelectedNode, selected, selectedNodeId]);

  const toggleStatus = (id: string) => {
    setState((prev) => {
      const flows = prev.flows.map((f) => {
        if (f.id !== id) return f;
        const next: FlowStatus = f.status === "enabled" ? "paused" : "enabled";
        return { ...f, status: next, updatedAt: Date.now() };
      });
      return { ...prev, flows };
    });
  };

  const duplicateFlow = (id: string) => {
    setState((prev) => {
      const src = prev.flows.find((f) => f.id === id);
      if (!src) return prev;
      const now = Date.now();
      const copy: Flow = {
        ...src,
        id: `flow_copy_${now}`,
        name: `${src.name} (copy)`,
        status: "draft",
        updatedAt: now,
        runs7d: 0,
      };
      return { ...prev, flows: [copy, ...prev.flows], selectedId: copy.id };
    });
    toast.success("Flow duplicated.");
  };

  const deleteFlow = (id: string) => {
    setState((prev) => {
      const flows = prev.flows.filter((f) => f.id !== id);
      const selectedId = prev.selectedId === id ? flows[0]?.id ?? null : prev.selectedId;
      return { ...prev, flows, selectedId };
    });
    toast.success("Flow deleted.");
  };

  const createFlow = () => {
    const name = createName.trim();
    if (!name) return;
    const seed = seedFromString(`${seedKey}:${name}:${Date.now()}`);
    const flow = buildDefaultFlow(seed, name, createStatus, createTrigger);
    setState((prev) => ({ ...prev, flows: [flow, ...prev.flows], selectedId: flow.id }));
    setCreateName("");
    setCreateStatus("draft");
    setCreateTrigger({ type: "message_received", channel: "inbox" });
    setCreateOpen(false);
    toast.success("Flow created.");
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
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex h-full min-h-0 flex-col gap-6 overflow-hidden"
    >
      <motion.div variants={item} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Flows</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Build, enable, and iterate on automation flows that orchestrate your community operations.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => (window.location.href = "/dashboard/automations/simulator")}
          >
            Open simulator
            <ArrowUpRight size={14} />
          </Button>
          <Button className="cursor-pointer" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            New flow
          </Button>
        </div>
      </motion.div>

      <motion.div variants={item} className="grid flex-1 min-h-0 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4 flex min-h-0 flex-col">
          <CardHeader className="shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Workflow size={16} className="text-zinc-900" />
                  Flows
                </CardTitle>
                <CardDescription>Scroll here without moving the page.</CardDescription>
              </div>
              <Badge variant="default">{filtered.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0">
            <div className="px-5 pb-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search flows..."
                  className="pl-9"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    { key: "all" as const, label: "All", count: counts.all },
                    { key: "enabled" as const, label: "Enabled", count: counts.enabled },
                    { key: "paused" as const, label: "Paused", count: counts.paused },
                    { key: "draft" as const, label: "Draft", count: counts.draft },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setFilter(t.key)}
                    className={cn(
                      "cursor-pointer inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      filter === t.key
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                    )}
                  >
                    <span>{t.label}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px]",
                        filter === t.key ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-600"
                      )}
                    >
                      {t.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <Separator />
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <div className="px-5 py-5">
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-center">
                    <div className="text-sm font-semibold text-zinc-900">No matches</div>
                    <div className="mt-1 text-xs text-zinc-500">Try a different search or filter.</div>
                  </div>
                </div>
              ) : (
                filtered.map((f, idx) => {
                  const isActive = f.id === state.selectedId;
                  const sb = statusBadge(f.status);
                  return (
                    <motion.button
                      key={f.id}
                      type="button"
                      onClick={() => selectFlow(f.id)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.01 + idx * 0.015, duration: 0.22, ease }}
                      className={cn(
                        "w-full cursor-pointer text-left px-5 py-4 transition-colors",
                        isActive ? "bg-blue-50/60" : "hover:bg-zinc-50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-sm font-semibold text-zinc-900">{f.name}</div>
                            <Badge variant={sb.variant}>{sb.label}</Badge>
                          </div>
                          <div className="mt-1 text-xs font-semibold text-zinc-500">{triggerLabel(f.trigger)}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {f.tags.slice(0, 2).map((t) => (
                              <span
                                key={t}
                                className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600"
                              >
                                {t}
                              </span>
                            ))}
                            {f.tags.length > 2 && (
                              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-700">
                                +{f.tags.length - 2}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs font-semibold text-zinc-500">{formatTime(f.updatedAt)}</div>
                          <div className="mt-2 rounded-full bg-blue-600/10 px-2 py-0.5 text-[11px] font-bold text-blue-700 inline-block">
                            {f.runs7d} runs
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-8 flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0 border-b border-zinc-200/70">
            {!selected ? (
              <div>
                <CardTitle>Flow</CardTitle>
                <CardDescription>Select a flow on the left to inspect it.</CardDescription>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-xl font-extrabold text-zinc-900">{selected.name}</div>
                    <Badge variant={statusBadge(selected.status).variant}>{statusBadge(selected.status).label}</Badge>
                  </div>
                </div>
                <div className="relative" ref={configRef}>
                  <button
                    type="button"
                    className="cursor-pointer inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50"
                    aria-label="Flow settings"
                    title="Settings"
                    onClick={() => setConfigOpen((v) => !v)}
                  >
                    <Settings size={16} />
                  </button>

                  {configOpen && (
                    <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
                      <button
                        type="button"
                        className="w-full cursor-pointer px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                        onClick={() => {
                          setConfigOpen(false);
                          toggleStatus(selected.id);
                        }}
                      >
                        {selected.status === "enabled" ? "Pause" : "Enable"}
                      </button>
                      <button
                        type="button"
                        className="w-full cursor-pointer px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                        onClick={() => {
                          setConfigOpen(false);
                          duplicateFlow(selected.id);
                        }}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="w-full cursor-pointer px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                        onClick={() => {
                          setConfigOpen(false);
                          if (!confirm("Reset this flow? This will remove all nodes and edges (except the trigger).")) return;
                          updateFlow(selected.id, (f) => {
                            const triggerNode = f.nodes.find((n) => n.kind === "trigger") ?? f.nodes[0];
                            return { ...f, nodes: triggerNode ? [triggerNode] : [], edges: [], updatedAt: Date.now() };
                          });
                          setSelectedNodeId(selected.nodes.find((n) => n.kind === "trigger")?.id ?? selected.nodes[0]?.id ?? null);
                          toast.success("Flow reset.");
                        }}
                      >
                        Reset flow
                      </button>
                      <div className="h-px bg-zinc-100" />
                      <button
                        type="button"
                        className="w-full cursor-pointer px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                        onClick={() => {
                          setConfigOpen(false);
                          if (!confirm("Delete this flow?")) return;
                          deleteFlow(selected.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardHeader>

          <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
            {!selected ? (
              <div className="flex h-full items-center justify-center px-5">
                <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white px-4 py-8 text-center">
                  <div className="text-sm font-semibold text-zinc-900">Select a flow</div>
                  <div className="mt-1 text-xs text-zinc-500">Pick one from the list to view steps and actions.</div>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <div className="shrink-0 border-b border-zinc-200/70 bg-white px-6 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default">{triggerLabel(selected.trigger)}</Badge>
                      {selected.tags.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600"
                        >
                          {t}
                        </span>
                      ))}
                      {selected.tags.length > 3 && (
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-700">
                          +{selected.tags.length - 3}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => (window.location.href = `/dashboard/automations/flows/editor?flowId=${encodeURIComponent(selected.id)}`)}
                      >
                        Expand
                        <ArrowUpRight size={14} />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => setExpandedOpen(true)}
                        aria-label="Expand flow in modal"
                        title="Expand"
                      >
                        <Maximize2 size={14} />
                      </Button>
                      <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => (window.location.href = "/dashboard/automations/simulator")}>
                        Run in simulator
                        <ArrowUpRight size={14} />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => setConfigOpen(true)}
                      >
                        <Trash2 size={14} />
                        Settings
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 text-xs font-semibold text-zinc-500">
                    Drag nodes to reposition. Use the mini controls to pan/zoom.
                  </div>
                </div>

                <FlowCanvasReactFlow
                  flow={selected}
                  selectedNodeId={selectedNodeId}
                  onSelectedNodeIdChange={setSelectedNodeId}
                  onFlowChange={(next) =>
                      updateFlow(selected.id, (f) => ({
                        ...f,
                      nodes: next.nodes as any,
                      edges: next.edges as any,
                        updatedAt: Date.now(),
                    }))
                  }
                  className="flex-1"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/30 backdrop-blur-sm cursor-pointer"
            onClick={() => setCreateOpen(false)}
            aria-label="Close create flow"
          />
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22, ease }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50/50">
                  <Workflow size={18} className="text-blue-700" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-zinc-900">New flow</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    Define trigger + status. You can refine the canvas after creation.
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="cursor-pointer rounded-xl border border-zinc-200 bg-white p-2 text-zinc-700 hover:bg-zinc-50"
                onClick={() => setCreateOpen(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <Separator />
            <div className="px-5 py-5 space-y-5">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Name</div>
                <div className="mt-2">
                  <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. VIP fast-path" />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Trigger</div>
                  <div className="mt-2">
                    <div ref={triggerRef} className="relative">
                      <button
                        type="button"
                        className="cursor-pointer flex h-10 w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
                        onClick={() => {
                          setTriggerOpen((v) => !v);
                          setStatusOpen(false);
                        }}
                        aria-expanded={triggerOpen}
                      >
                        <span>{triggerLabel({ type: createTrigger.type, channel: undefined })}</span>
                        <ChevronDown size={16} className={cn("text-zinc-500 transition-transform", triggerOpen ? "rotate-180" : "")} />
                      </button>

                      {triggerOpen && (
                        <div className="absolute left-0 top-[calc(100%+10px)] z-50 w-full rounded-2xl border border-zinc-200 bg-white shadow-2xl">
                          <div className="p-2">
                            {(
                              [
                                { value: "message_received" as const, label: "Message received" },
                                { value: "member_joined" as const, label: "Member joined" },
                                { value: "flag_raised" as const, label: "Flag raised" },
                              ] as const
                            ).map((opt) => {
                              const on = createTrigger.type === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  className={cn(
                                    "cursor-pointer flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                                    on ? "bg-blue-50 text-blue-700" : "text-zinc-900 hover:bg-zinc-50"
                                  )}
                                  onClick={() => {
                                    setCreateTrigger((p) => ({ ...p, type: opt.value }));
                                    setTriggerOpen(false);
                                  }}
                                >
                                  <span>{opt.label}</span>
                                  {on && <Check size={16} className="text-blue-700" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Status</div>
                  <div className="mt-2">
                    <div ref={statusRef} className="relative">
                      <button
                        type="button"
                        className="cursor-pointer flex h-10 w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
                        onClick={() => {
                          setStatusOpen((v) => !v);
                          setTriggerOpen(false);
                        }}
                        aria-expanded={statusOpen}
                      >
                        <span className="capitalize">{createStatus}</span>
                        <ChevronDown size={16} className={cn("text-zinc-500 transition-transform", statusOpen ? "rotate-180" : "")} />
                      </button>

                      {statusOpen && (
                        <div className="absolute left-0 top-[calc(100%+10px)] z-50 w-full rounded-2xl border border-zinc-200 bg-white shadow-2xl">
                          <div className="p-2">
                            {(
                              [
                                { value: "draft" as const, label: "Draft", hint: "Not active yet" },
                                { value: "enabled" as const, label: "Enabled", hint: "Runs automatically" },
                                { value: "paused" as const, label: "Paused", hint: "Stops executing" },
                              ] as const
                            ).map((opt) => {
                              const on = createStatus === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  className={cn(
                                    "cursor-pointer flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 transition-colors",
                                    on ? "bg-blue-50" : "hover:bg-zinc-50"
                                  )}
                                  onClick={() => {
                                    setCreateStatus(opt.value);
                                    setStatusOpen(false);
                                  }}
                                >
                                  <span className="min-w-0">
                                    <span className={cn("block text-sm font-semibold", on ? "text-blue-700" : "text-zinc-900")}>
                                      {opt.label}
                                    </span>
                                    <span className="mt-0.5 block text-xs font-semibold text-zinc-500">{opt.hint}</span>
                                  </span>
                                  {on && <Check size={16} className="mt-0.5 text-blue-700" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-zinc-900">Channel (optional)</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["inbox", "dm", "comment"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCreateTrigger((p) => ({ ...p, channel: p.channel === c ? undefined : c }))}
                      className={cn(
                        "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                        createTrigger.channel === c
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-end gap-3 px-5 py-4">
              <Button variant="outline" className="cursor-pointer" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button className="cursor-pointer" onClick={createFlow} disabled={!createName.trim()}>
                Create
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {expandedOpen && selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <motion.button
              type="button"
              aria-label="Close"
              className="absolute inset-0 cursor-pointer bg-zinc-950/40 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease }}
              onClick={() => setExpandedOpen(false)}
            />

            <motion.div
              ref={expandedRef}
              initial={{ opacity: 0, y: 26, scale: 0.96, rotateX: -10 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
              exit={{ opacity: 0, y: 18, scale: 0.97, rotateX: -6 }}
              transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.8 }}
              style={{ transformPerspective: 1200 }}
              className="relative flex h-[calc(100vh-1.5rem)] w-[min(1400px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.85)]"
            >
              <div className="relative border-b border-zinc-200/80 bg-linear-to-r from-zinc-50 via-white to-zinc-50 px-4 py-3">
                <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.12),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(236,72,153,0.10),transparent_40%)]" />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-zinc-200 bg-white">
                      <Workflow size={16} className="text-zinc-900" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-zinc-900">{selected.name}</div>
                      <div className="truncate text-xs font-semibold text-zinc-500">Expanded canvas</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                      onClick={() =>
                        (window.location.href = `/dashboard/automations/flows/editor?flowId=${encodeURIComponent(selected.id)}`)
                      }
                    >
                      Full page
                      <ArrowUpRight size={14} />
                    </Button>
                    <button
                      type="button"
                      className="cursor-pointer rounded-2xl border border-zinc-200 bg-white p-2 text-zinc-700 hover:bg-zinc-50"
                      onClick={() => setExpandedOpen(false)}
                      aria-label="Close"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0 bg-zinc-50">
                <FlowCanvasReactFlow
                  flow={selected}
                  selectedNodeId={selectedNodeId}
                  onSelectedNodeIdChange={setSelectedNodeId}
                  onFlowChange={(next) =>
                    updateFlow(selected.id, (f) => ({
                      ...f,
                      nodes: next.nodes as any,
                      edges: next.edges as any,
                      updatedAt: Date.now(),
                    }))
                  }
                  className="h-full"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
