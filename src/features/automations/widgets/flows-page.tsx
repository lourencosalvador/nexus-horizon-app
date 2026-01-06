"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cubicBezier, motion } from "framer-motion";
import {
  ArrowUpRight,
  CheckCircle2,
  Check,
  Copy,
  ChevronDown,
  Filter,
  GitBranch,
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
  const [viewport, setViewport] = useState<{ x: number; y: number; scale: number }>({ x: 0, y: 0, scale: 1 });
  const [panning, setPanning] = useState(false);
  const [dragging, setDragging] = useState<{ id: string; dx: number; dy: number } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createTrigger, setCreateTrigger] = useState<FlowTrigger>({ type: "message_received", channel: "inbox" });
  const [createStatus, setCreateStatus] = useState<FlowStatus>("draft");
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);

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
      setViewport({ x: 0, y: 0, scale: 1 });
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

  const zoomTo = (nextScale: number) => {
    setViewport((v) => ({ ...v, scale: clamp(nextScale, 0.55, 1.8) }));
  };

  const resetView = () => setViewport({ x: 0, y: 0, scale: 1 });

  const fitToFlow = () => {
    if (!selected || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const pad = 90;
    const xs = selected.nodes.map((n) => n.x);
    const ys = selected.nodes.map((n) => n.y);
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + 240 + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + 120 + pad;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const s = clamp(Math.min(rect.width / w, rect.height / h), 0.6, 1.25);
    const cx = minX + w / 2;
    const cy = minY + h / 2;
    setViewport({ scale: s, x: rect.width / 2 - cx * s, y: rect.height / 2 - cy * s });
  };

  const addNode = (kind: Exclude<FlowNodeKind, "trigger">) => {
    if (!selected) return;
    const now = Date.now();
    const id = `${selected.id}_n_${kind}_${now}`;
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = rect ? (rect.width / 2 - viewport.x) / viewport.scale : 420;
    const cy = rect ? (rect.height / 2 - viewport.y) / viewport.scale : 200;
    const label = kind === "condition" ? "New condition" : kind === "guardrail" ? "New guardrail" : "New action";

    updateFlow(selected.id, (f) => {
      const node: FlowNode = { id, kind, label, x: Math.round(cx + 80), y: Math.round(cy) };
      const last = f.nodes.filter((n) => n.kind !== "trigger").slice(-1)[0] ?? f.nodes[0];
      const edge: FlowEdge = { id: `${selected.id}_e_${now}`, from: last.id, to: node.id };
      return { ...f, nodes: [...f.nodes, node], edges: [...f.edges, edge], updatedAt: Date.now() };
    });

    setSelectedNodeId(id);
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
    <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col gap-6">
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
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-700">
                      {selected.runs7d} runs / 7d
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-zinc-600">
                    Trigger: <span className="font-semibold text-zinc-900">{triggerLabel(selected.trigger)}</span>
                  </div>
                  <div className="mt-2 text-xs font-semibold text-zinc-500">Last updated: {formatTime(selected.updatedAt)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => selected && toggleStatus(selected.id)}
                  >
                    <Filter size={14} />
                    {selected.status === "enabled" ? "Pause" : "Enable"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => selected && duplicateFlow(selected.id)}
                  >
                    <Copy size={14} />
                    Duplicate
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => selected && deleteFlow(selected.id)}
                  >
                    <Trash2 size={14} />
                    Delete
                  </Button>
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
                        onClick={() => addNode("condition")}
                      >
                        <GitBranch size={14} />
                        Condition
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => addNode("guardrail")}
                      >
                        <SlidersHorizontal size={14} />
                        Guardrail
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => addNode("action")}
                      >
                        <CheckCircle2 size={14} />
                        Action
                      </Button>
                      <Separator className="hidden sm:block mx-1 h-8" />
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => zoomTo(viewport.scale - 0.1)}
                      >
                        <ZoomOut size={14} />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => zoomTo(viewport.scale + 0.1)}
                      >
                        <ZoomIn size={14} />
                      </Button>
                      <Button variant="outline" size="sm" className="cursor-pointer" onClick={resetView}>
                        Reset
                      </Button>
                      <Button variant="outline" size="sm" className="cursor-pointer" onClick={fitToFlow}>
                        <LocateFixed size={14} />
                        Fit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => (window.location.href = "/dashboard/automations/simulator")}
                      >
                        Run in simulator
                        <ArrowUpRight size={14} />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="cursor-pointer"
                        onClick={deleteSelectedNode}
                        disabled={!selectedNodeId || selected.nodes.find((n) => n.id === selectedNodeId)?.kind === "trigger"}
                      >
                        <Trash2 size={14} />
                        Delete node
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 text-xs font-semibold text-zinc-500">
                    Drag nodes to reposition. Drag empty space to pan. Scroll to zoom.
                  </div>
                </div>

                <div
                  ref={canvasRef}
                  className={cn(
                    "relative flex-1 min-h-0 overflow-hidden bg-[#F7F8FA] select-none",
                    panning ? "cursor-grabbing" : "cursor-grab"
                  )}
                  onWheel={(e) => {
                    if (!canvasRef.current) return;
                    e.preventDefault();
                    const rect = canvasRef.current.getBoundingClientRect();
                    const mx = e.clientX - rect.left;
                    const my = e.clientY - rect.top;
                    const delta = e.deltaY > 0 ? -0.08 : 0.08;
                    const nextScale = clamp(viewport.scale + delta, 0.55, 1.8);
                    const wx = (mx - viewport.x) / viewport.scale;
                    const wy = (my - viewport.y) / viewport.scale;
                    const nx = mx - wx * nextScale;
                    const ny = my - wy * nextScale;
                    setViewport({ scale: nextScale, x: nx, y: ny });
                  }}
                  onPointerDown={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("[data-node]")) return;
                    setPanning(true);
                    panRef.current = { sx: e.clientX, sy: e.clientY, vx: viewport.x, vy: viewport.y };
                  }}
                  onPointerMove={(e) => {
                    if (dragging && selected) {
                      const rect = canvasRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      const cx = (e.clientX - rect.left - viewport.x) / viewport.scale;
                      const cy = (e.clientY - rect.top - viewport.y) / viewport.scale;
                      const nx = cx - dragging.dx;
                      const ny = cy - dragging.dy;
                      updateFlow(selected.id, (f) => ({
                        ...f,
                        nodes: f.nodes.map((n) => (n.id === dragging.id ? { ...n, x: nx, y: ny } : n)),
                        updatedAt: Date.now(),
                      }));
                      return;
                    }

                    if (!panning || !panRef.current) return;
                    const dx = e.clientX - panRef.current.sx;
                    const dy = e.clientY - panRef.current.sy;
                    setViewport((v) => ({ ...v, x: panRef.current!.vx + dx, y: panRef.current!.vy + dy }));
                  }}
                  onPointerUp={() => {
                    setPanning(false);
                    panRef.current = null;
                    setDragging(null);
                  }}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-70"
                    style={{
                      backgroundImage:
                        "linear-gradient(rgba(24,24,27,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(24,24,27,0.06) 1px, transparent 1px)",
                      backgroundSize: "28px 28px",
                      backgroundPosition: `${viewport.x % 28}px ${viewport.y % 28}px`,
                    }}
                  />

                  <div
                    className="absolute inset-0"
                    style={{
                      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                      transformOrigin: "0 0",
                    }}
                  >
                    <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
                      <defs>
                        <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                          <path d="M0,0 L9,3 L0,6 Z" fill="rgba(24,24,27,0.35)" />
                        </marker>
                      </defs>
                      {selected.edges.map((e) => {
                        const from = selected.nodes.find((n) => n.id === e.from);
                        const to = selected.nodes.find((n) => n.id === e.to);
                        if (!from || !to) return null;
                        const x1 = from.x + 240;
                        const y1 = from.y + 34;
                        const x2 = to.x;
                        const y2 = to.y + 34;
                        const c1 = x1 + 80;
                        const c2 = x2 - 80;
                        const d = `M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`;
                        return <path key={e.id} d={d} fill="none" stroke="rgba(24,24,27,0.22)" strokeWidth="2" markerEnd="url(#arrow)" />;
                      })}
                    </svg>

                    {selected.nodes.map((n) => {
                      const Icon = nodeIcon(n.kind);
                      const isActive = n.id === selectedNodeId;
                      const isDragging = dragging?.id === n.id;
                      return (
                        <div
                          key={n.id}
                          data-node
                          className={cn(
                            "absolute w-[240px] rounded-2xl border bg-white shadow-sm transition-colors touch-none",
                            nodeTone(n.kind),
                            isActive ? "ring-2 ring-blue-600/20" : "hover:bg-white",
                            isDragging ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing"
                          )}
                          style={{ left: n.x, top: n.y }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (!canvasRef.current) return;
                            const rect = canvasRef.current.getBoundingClientRect();
                            const cx = (e.clientX - rect.left - viewport.x) / viewport.scale;
                            const cy = (e.clientY - rect.top - viewport.y) / viewport.scale;
                            setDragging({ id: n.id, dx: cx - n.x, dy: cy - n.y });
                            setSelectedNodeId(n.id);
                          }}
                          onClick={() => setSelectedNodeId(n.id)}
                        >
                          <div className="flex items-start gap-3 px-4 py-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white">
                              <Icon size={16} className="text-zinc-900" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                                  {nodeLabel(n.kind)}
                                </span>
                                <span className="text-[11px] font-bold text-zinc-600">Drag</span>
                              </div>
                              <div className="mt-1 truncate text-sm font-semibold text-zinc-900">{n.label}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
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
    </motion.div>
  );
}
