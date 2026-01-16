"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type EdgeTypes,
  type EdgeProps,
  type NodeTypes,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  MarkerType,
  ReactFlowProvider,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CheckCircle2, GitBranch, Grid3X3, Link2, LocateFixed, PencilLine, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

// ============================================================================
// TIPOS
// ============================================================================

export type FlowNodeKind = "trigger" | "condition" | "guardrail" | "action";

export type FlowNode = {
  id: string;
  kind: FlowNodeKind;
  label: string;
  x: number;
  y: number;
};

export type FlowEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

export type Flow = {
  id: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
};

// ============================================================================
// COMPONENTE DE NODE CUSTOMIZADO
// ============================================================================

type NodeData = {
  label: string;
  kind: FlowNodeKind;
  onLabelChange?: (nodeId: string, nextLabel: string) => void;
  onSelect?: (nodeId: string) => void;
};

function CustomNode({ id, data, selected }: { id: string; data: NodeData; selected: boolean }) {
  const colors = {
    trigger: { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
    condition: { bg: "#f3f4f6", border: "#6b7280", text: "#1f2937" },
    guardrail: { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
    action: { bg: "#d1fae5", border: "#10b981", text: "#065f46" },
  };

  const color = colors[data.kind];
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // auto-resize to content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, 24)}px`;
  }, [data.label]);

  return (
    <div
      onPointerDown={() => data.onSelect?.(id)}
      style={{
        padding: "12px 16px",
        borderRadius: "10px",
        background: color.bg,
        border: `2px solid ${selected ? color.border : "#e5e7eb"}`,
        minWidth: "200px",
        boxShadow: selected ? `0 0 0 3px ${color.border}33` : "0 1px 3px rgba(0,0,0,0.12)",
        position: "relative",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{
          width: 10,
          height: 10,
          background: "#fff",
          border: `2px solid ${color.border}`,
          left: -6,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{
          width: 10,
          height: 10,
          background: "#fff",
          border: `2px solid ${color.border}`,
          right: -6,
        }}
      />

      <div style={{ fontSize: "10px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginBottom: 6 }}>
        {data.kind}
      </div>
      <textarea
        ref={textareaRef}
        className="nodrag nopan"
        value={data.label}
        onFocus={() => data.onSelect?.(id)}
        onChange={(e) => data.onLabelChange?.(id, e.target.value)}
        placeholder="Escreve a mensagem..."
        rows={1}
        style={{
          width: "100%",
          resize: "none",
          overflow: "hidden",
          background: "transparent",
          border: "none",
          outline: "none",
          padding: 0,
          margin: 0,
          fontSize: 14,
          fontWeight: 700,
          color: color.text,
          lineHeight: 1.25,
        }}
      />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

type EditableEdgeData = {
  label?: string;
  editable?: boolean;
  onLabelChange?: (edgeId: string, nextLabel: string) => void;
};

function EditableEdge(props: EdgeProps<Edge<EditableEdgeData>>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected } = props;
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data?.label ?? "");

  useEffect(() => {
    if (!editing) setDraft(data?.label ?? "");
  }, [data?.label, editing]);

  const commit = () => {
    setEditing(false);
    data?.onLabelChange?.(id, draft.trim());
  };

  const canEdit = Boolean(data?.editable);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? "rgba(37,99,235,0.7)" : "rgba(24,24,27,0.28)",
          strokeWidth: selected ? 2.5 : 2,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          onDoubleClick={(e) => {
            if (!canEdit) return;
            e.preventDefault();
            e.stopPropagation();
            setEditing(true);
          }}
        >
          {canEdit && editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder="Escreve a condição..."
              style={{
                width: 220,
                maxWidth: 260,
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(37,99,235,0.35)",
                outline: "none",
                background: "white",
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              }}
            />
          ) : (
            canEdit ? (
              <div
                title="Duplo-clique para editar"
                style={{
                  fontSize: 12,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: selected ? "1px solid rgba(37,99,235,0.5)" : "1px solid rgba(0,0,0,0.12)",
                  background: selected ? "rgba(239,246,255,0.95)" : "rgba(255,255,255,0.92)",
                  color: "rgba(24,24,27,0.82)",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.10)",
                  userSelect: "none",
                  maxWidth: 280,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {(data?.label ?? "").trim() || "Duplo-clique para escrever…"}
              </div>
            ) : null
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes: EdgeTypes = {
  editable: EditableEdge,
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

function FlowCanvasInner(props: {
  flow: Flow;
  selectedNodeId: string | null;
  onSelectedNodeIdChange: (id: string | null) => void;
  onFlowChange: (next: Flow) => void;
  paletteVariant: "sidebar" | "toolbar";
}) {
  const { flow, selectedNodeId, onSelectedNodeIdChange, onFlowChange, paletteVariant } = props;
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const onSelectNode = useCallback(
    (nodeId: string) => {
      onSelectedNodeIdChange(nodeId);
    },
    [onSelectedNodeIdChange]
  );

  // Converter para formato React Flow (estado inicial)
  const initialNodes: Node[] = flow.nodes.map((n) => ({
    id: n.id,
    type: "custom",
    position: { x: n.x, y: n.y },
    data: { label: n.label, kind: n.kind, onSelect: onSelectNode } satisfies NodeData,
  }));

  const initialEdges: Edge<EditableEdgeData>[] = flow.edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: "editable",
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "rgba(24,24,27,0.35)" },
    data: { label: e.label ?? "", editable: false } satisfies EditableEdgeData,
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sincronizar mudanças de volta (agora nodes/edges já existem)
  const syncToFlow = useCallback(
    (nextNodes?: Node[], nextEdges?: Edge<EditableEdgeData>[]) => {
      const nlist = nextNodes ?? nodes;
      const elist = nextEdges ?? (edges as Edge<EditableEdgeData>[]);

      const updatedNodes: FlowNode[] = nlist.map((n) => ({
        id: n.id,
        kind: (n.data as any).kind,
        label: (n.data as any).label,
        x: n.position.x,
        y: n.position.y,
      }));

      const updatedEdges: FlowEdge[] = elist.map((e) => ({
        id: e.id,
        from: e.source,
        to: e.target,
        label: String(((e.data as EditableEdgeData | undefined)?.label ?? "") || ""),
      }));

      onFlowChange({ ...flow, nodes: updatedNodes, edges: updatedEdges });
    },
    [flow, onFlowChange, nodes, edges]
  );

  const onNodeLabelChange = useCallback(
    (nodeId: string, nextLabel: string) => {
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? ({ ...n, data: { ...(n.data as any), label: nextLabel } } as any) : n)));
      setTimeout(() => syncToFlow(), 0);
    },
    [setNodes, syncToFlow]
  );

  const onEdgeLabelChange = useCallback(
    (edgeId: string, nextLabel: string) => {
      setEdges((prev) =>
        prev.map((e) => (e.id === edgeId ? ({ ...e, data: { ...(e.data as EditableEdgeData), label: nextLabel } } as any) : e))
      );
      setTimeout(syncToFlow, 0);
    },
    [setEdges, syncToFlow]
  );

  // Atualizar quando flow muda externamente (ex.: troca de flow selecionado)
  useEffect(() => {
    const newNodes: Node[] = flow.nodes.map((n) => ({
      id: n.id,
      type: "custom",
      position: { x: n.x, y: n.y },
      data: { label: n.label, kind: n.kind, onLabelChange: onNodeLabelChange, onSelect: onSelectNode } satisfies NodeData,
    }));
    const newEdges: Edge<EditableEdgeData>[] = flow.edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      type: "editable",
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "rgba(24,24,27,0.35)" },
      data: { label: e.label ?? "", onLabelChange: onEdgeLabelChange, editable: false },
    }));
    setNodes(newNodes);
    setEdges(newEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.id]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const sourceKind = (sourceNode?.data as any)?.kind as FlowNodeKind | undefined;
      const editable = sourceKind === "condition";

      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: editable ? "editable" : "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "rgba(24,24,27,0.35)" },
            data: editable ? ({ label: "", onLabelChange: onEdgeLabelChange, editable: true } as EditableEdgeData) : undefined,
          } as any,
          eds
        )
      );
      setTimeout(syncToFlow, 0);
      toast.success("Connection created!");
    },
    [setEdges, syncToFlow, onEdgeLabelChange, nodes]
  );

  const onNodesChangeHandler = useCallback(
    (changes: any) => {
      onNodesChange(changes);
      setTimeout(syncToFlow, 0);
    },
    [onNodesChange, syncToFlow]
  );

  const onEdgesChangeHandler = useCallback(
    (changes: any) => {
      onEdgesChange(changes);
      setTimeout(syncToFlow, 0);
    },
    [onEdgesChange, syncToFlow]
  );

  const addNode = useCallback(
    (kind: Exclude<FlowNodeKind, "trigger">) => {
      const labels = {
        condition: "New Condition",
        guardrail: "New Guardrail",
        action: "New Action",
      };

      // Encontrar última posição
      const lastNode = nodes[nodes.length - 1];
      const newX = lastNode ? lastNode.position.x + 250 : 250;
      const newY = lastNode ? lastNode.position.y : 100;

      const newNode: Node = {
        id: `node_${Date.now()}`,
        type: "custom",
        position: { x: newX, y: newY },
        data: { label: labels[kind], kind, onLabelChange: onNodeLabelChange, onSelect: onSelectNode } satisfies NodeData,
      };

      setNodes((nds) => [...nds, newNode]);
      setTimeout(syncToFlow, 0);
      toast.success(`${labels[kind]} added!`);
    },
    [nodes, setNodes, syncToFlow]
  );

  const deleteSelected = useCallback(() => {
    if (!selectedNodeId) return;
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (node && (node.data as any).kind === "trigger") {
      toast.error("Cannot delete trigger node!");
      return;
    }

    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    onSelectedNodeIdChange(null);
    setTimeout(syncToFlow, 0);
    toast.success("Node deleted!");
  }, [selectedNodeId, nodes, setNodes, setEdges, onSelectedNodeIdChange, syncToFlow]);

  return (
    <div ref={reactFlowWrapper} style={{ width: "100%", height: "100%", minHeight: "600px" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChangeHandler}
        onEdgesChange={onEdgesChangeHandler}
        onConnect={onConnect}
        onSelectionChange={(params) => {
          const selectedNode = params.nodes[0];
          onSelectedNodeIdChange(selectedNode ? selectedNode.id : null);
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "rgba(24,24,27,0.35)" },
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={2}
      >
        <Background />
        <Controls />
        <MiniMap />

        {paletteVariant === "toolbar" ? (
          <Panel position="top-left">
            <div
              style={{
                display: "flex",
                gap: "8px",
                background: "white",
                padding: "12px",
                borderRadius: "10px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.10)",
                border: "1px solid rgba(0,0,0,0.06)",
              }}
            >
              <button
                type="button"
                onClick={() => addNode("condition")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "rgba(24,24,27,0.04)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                <GitBranch size={16} /> Condition
              </button>
              <button
                type="button"
                onClick={() => addNode("guardrail")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "rgba(24,24,27,0.04)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                <SlidersHorizontal size={16} /> Guardrail
              </button>
              <button
                type="button"
                onClick={() => addNode("action")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "rgba(24,24,27,0.04)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                <CheckCircle2 size={16} /> Action
              </button>
            </div>
          </Panel>
        ) : (
          <Panel position="top-left">
            <div
              className="pointer-events-auto"
              style={{
                marginTop: 6,
                marginLeft: 6,
                width: 72,
                borderRadius: 28,
                background: "rgba(255,255,255,0.95)",
                border: "1px solid rgba(0,0,0,0.06)",
                boxShadow: "0 18px 60px rgba(0,0,0,0.18)",
                padding: "10px 10px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {[
                { key: "condition", title: "Condition", Icon: GitBranch, onClick: () => addNode("condition") },
                { key: "guardrail", title: "Guardrail", Icon: SlidersHorizontal, onClick: () => addNode("guardrail") },
                { key: "action", title: "Action", Icon: CheckCircle2, onClick: () => addNode("action") },
              ].map(({ key, title, Icon, onClick }) => (
                <button
                  key={key}
                  type="button"
                  title={title}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClick();
                  }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 999,
                      display: "grid",
                      placeItems: "center",
                      background: key === "condition" ? "rgba(236, 72, 153, 0.16)" : "transparent",
                      border: key === "condition" ? "1px solid rgba(236, 72, 153, 0.35)" : "1px solid transparent",
                    }}
                  >
                    <Icon size={20} color={key === "condition" ? "#db2777" : "rgba(24,24,27,0.85)"} />
                  </div>
                </button>
              ))}

              <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "4px 10px" }} />

              {[
                {
                  key: "fit",
                  title: "Fit to view",
                  Icon: LocateFixed,
                  onClick: () => {
                    // this works because ReactFlow Controls are available anyway
                    // but we can also hint users
                    toast.message("Dica: usa os controles de zoom + FitView");
                  },
                },
                { key: "connect", title: "Connect", Icon: Link2, onClick: () => toast.message("Arrasta dos handles para conectar") },
                { key: "edit", title: "Edit", Icon: PencilLine, onClick: () => toast.message("Edita texto dentro do node") },
                { key: "grid", title: "Grid", Icon: Grid3X3, onClick: () => toast.message("Zoom/Pan com o rato ou Controls") },
              ].map(({ key, title, Icon, onClick }) => (
                <button
                  key={key}
                  type="button"
                  title={title}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClick();
                  }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    opacity: 0.9,
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <Icon size={20} color={"rgba(24,24,27,0.75)"} />
                </button>
              ))}
            </div>
          </Panel>
        )}

        <Panel position="bottom-right">
          <div style={{ background: "white", padding: "8px 12px", borderRadius: "6px", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", fontSize: "12px", fontWeight: "600" }}>
            {nodes.length} nodes • {edges.length} connections
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function FlowCanvasReactFlow(props: {
  flow: Flow;
  selectedNodeId: string | null;
  onSelectedNodeIdChange: (id: string | null) => void;
  onFlowChange: (next: Flow) => void;
  className?: string;
  paletteVariant?: "sidebar" | "toolbar";
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} paletteVariant={props.paletteVariant ?? "toolbar"} />
    </ReactFlowProvider>
  );
}
