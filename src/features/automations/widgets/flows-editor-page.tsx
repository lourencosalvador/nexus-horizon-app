"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Trash2 } from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { FlowCanvasReactFlow } from "@/features/automations/widgets/flow-canvas-reactflow";
import { Avatar } from "@/shared/ui/avatar";
import { getStoredUser } from "@/shared/stores/userStore";
import { toast } from "sonner";

type FlowStatus = "enabled" | "paused" | "draft";
type FlowTrigger = { type: "message_received" | "member_joined" | "flag_raised"; channel?: "inbox" | "dm" | "comment" };
type FlowNodeKind = "trigger" | "condition" | "guardrail" | "action";
type FlowNode = { id: string; kind: FlowNodeKind; label: string; x: number; y: number };
type FlowEdge = { id: string; from: string; to: string; label?: string };
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
type FlowsState = { flows: Flow[]; selectedId: string | null };

const STORAGE_KEY = "nexus_demo_flows_v2";

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function triggerLabel(t: FlowTrigger) {
  const base =
    t.type === "message_received" ? "Message received" : t.type === "member_joined" ? "Member joined" : "Flag raised";
  if (!t.channel) return base;
  return `${base} · ${t.channel}`;
}

export default function FlowsEditorPage() {
  const sp = useSearchParams();
  const flowIdFromUrl = (sp.get("flowId") ?? "").trim();

  const [state, setState] = useState<FlowsState>({ flows: [], selectedId: null });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const me = useMemo(() => getStoredUser(), []);
  const meName = (me?.name ?? me?.email ?? "You").trim();
  const meAvatar = me?.pictureUrl || me?.photoDataUrl || undefined;

  useEffect(() => {
    const hydrated = safeParse<FlowsState>(window.localStorage.getItem(STORAGE_KEY));
    if (hydrated?.flows?.length) {
      setState({
        flows: hydrated.flows,
        selectedId:
          flowIdFromUrl && hydrated.flows.some((f) => f.id === flowIdFromUrl)
            ? flowIdFromUrl
            : hydrated.selectedId ?? hydrated.flows[0]?.id ?? null,
      });
      return;
    }
    // fallback: go back if no flows
    setState({ flows: [], selectedId: null });
  }, [flowIdFromUrl]);

  useEffect(() => {
    if (!state.flows.length) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const selected = useMemo(() => state.flows.find((f) => f.id === state.selectedId) ?? null, [state.flows, state.selectedId]);

  useEffect(() => {
    if (!selected) return;
    setSelectedNodeId(selected.nodes[0]?.id ?? null);
  }, [selected?.id]);

  const updateFlow = (id: string, updater: (f: Flow) => Flow) => {
    setState((prev) => ({ ...prev, flows: prev.flows.map((f) => (f.id === id ? updater(f) : f)) }));
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

  if (!selected) {
    return (
      <div className="flex h-[calc(100vh-0px)] items-center justify-center bg-[#F7F8FA]">
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 text-sm font-semibold text-zinc-900">
          No flow selected.
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-0px)] w-full bg-[#F7F8FA]">
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-zinc-200/70 bg-linear-to-r from-zinc-50 via-white to-zinc-50 px-6 py-4">
          <div className="mx-auto w-full max-w-[1400px]">
            <div className="relative flex items-center justify-between gap-3">
              {/* Left */}
              <div className="flex items-center gap-4 min-w-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => (window.location.href = "/dashboard/automations/flows")}
                >
                  <ArrowLeft size={14} />
                  Back
                </Button>

                <div className="min-w-0">
                  <div className="truncate text-[20px] font-extrabold tracking-tight text-zinc-900">{selected.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12px] font-bold text-zinc-700 shadow-sm">
                      {triggerLabel(selected.trigger)}
                    </span>
                    {selected.tags.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12px] font-bold text-zinc-700 shadow-sm"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Center (always centered, independent of left/right widths) */}
              <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
                <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-3 py-2 shadow-sm">
                  <Avatar name={meName} src={meAvatar} size="sm" showOnline={false} />
                  <div className="text-sm font-extrabold text-zinc-900">{meName}</div>
                </div>
              </div>

              {/* Right */}
              <div className="flex items-center justify-end gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => (window.location.href = "/dashboard/automations/simulator")}
                >
                  Run in simulator
                  <ArrowUpRight size={14} />
                </Button>
                <div className="hidden sm:block h-9 w-px bg-zinc-200/80" aria-hidden="true" />
                <Button
                  variant="destructive"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => {
                    if (!selectedNodeId) {
                      toast.message("Seleciona um node para apagar.");
                      return;
                    }
                    const node = selected.nodes.find((n) => n.id === selectedNodeId);
                    if (!node) return;
                    if (node.kind === "trigger") {
                      toast.error("O Trigger não pode ser apagado.");
                      return;
                    }
                    deleteSelectedNode();
                  }}
                >
                  <Trash2 size={14} />
                  Delete node
                </Button>
              </div>
            </div>
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
          paletteVariant="sidebar"
        />
      </div>
    </div>
  );
}

