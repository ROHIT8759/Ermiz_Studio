"use client";

import React, { ComponentType, useState, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  NodeTypes,
  EdgeTypes,
  DefaultEdgeOptions,
  NodeProps,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { Hand, MousePointer2 } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { useStore } from "@/store/useStore";
import { ProcessNode } from "./nodes/ProcessNode";
import { DatabaseNode } from "./nodes/DatabaseNode";
import { QueueNode } from "./nodes/QueueNode";
import { ApiBindingNode } from "./nodes/ApiBindingNode";
import { InfraNode } from "./nodes/InfraNode";
import { ServiceBoundaryNode } from "./nodes/ServiceBoundaryNode";
import { StepEdge } from "./edges/StepEdge";
import { ContextMenu } from "./ContextMenu";

const nodeTypes: NodeTypes = {
  process: ProcessNode as unknown as ComponentType<NodeProps>,
  database: DatabaseNode as unknown as ComponentType<NodeProps>,
  queue: QueueNode as unknown as ComponentType<NodeProps>,
  api_binding: ApiBindingNode as unknown as ComponentType<NodeProps>,
  infra: InfraNode as unknown as ComponentType<NodeProps>,
  service_boundary: ServiceBoundaryNode as unknown as ComponentType<NodeProps>,
};

const edgeTypes: EdgeTypes = {
  step: StepEdge,
};

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: "step",
  animated: false,
};

interface ContextMenuState {
  x: number;
  y: number;
  flowPosition: { x: number; y: number };
}

function FlowCanvasInner() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode } =
    useStore();
  const { screenToFlowPosition } = useReactFlow();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [interactionMode, setInteractionMode] = useState<"select" | "pan">(
    "select",
  );
  const [showMiniMap, setShowMiniMap] = useState(false);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const flowPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        flowPosition,
      });
    },
    [screenToFlowPosition],
  );

  const handleAddNode = useCallback(
    (kind: string, position: { x: number; y: number }) => {
      addNode(kind as Parameters<typeof addNode>[0], position);
    },
    [addNode],
  );

  return (
    <div
      className="h-full w-full"
      onContextMenu={handleContextMenu}
      style={{ position: "relative" }}
    >
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: 4,
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--floating)",
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <button
          type="button"
          onClick={() => setInteractionMode("select")}
          title="Select blocks"
          aria-label="Select mode"
          style={{
            border: "none",
            borderRadius: 8,
            width: 32,
            height: 32,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 0,
            cursor: "pointer",
            background:
              interactionMode === "select" ? "var(--panel)" : "transparent",
            color:
              interactionMode === "select" ? "var(--foreground)" : "var(--muted)",
          }}
        >
          <MousePointer2 size={15} style={{ display: "block" }} />
        </button>
        <button
          type="button"
          onClick={() => setInteractionMode("pan")}
          title="Pan canvas"
          aria-label="Pan mode"
          style={{
            border: "none",
            borderRadius: 8,
            width: 32,
            height: 32,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 0,
            cursor: "pointer",
            background:
              interactionMode === "pan" ? "var(--panel)" : "transparent",
            color:
              interactionMode === "pan" ? "var(--foreground)" : "var(--muted)",
          }}
        >
          <Hand size={15} style={{ display: "block" }} />
        </button>
        <button
          type="button"
          onClick={() => setShowMiniMap((prev) => !prev)}
          title={showMiniMap ? "Hide minimap" : "Show minimap"}
          aria-label={showMiniMap ? "Hide minimap" : "Show minimap"}
          style={{
            border: "none",
            borderRadius: 8,
            width: 32,
            height: 32,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 0,
            cursor: "pointer",
            background: showMiniMap ? "var(--panel)" : "transparent",
            color: showMiniMap ? "var(--foreground)" : "var(--muted)",
          }}
        >
          {showMiniMap ? (
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ display: "block" }}
              aria-hidden="true"
            >
              <rect
                x="2"
                y="3"
                width="12"
                height="10"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <rect
                x="5.4"
                y="5.4"
                width="4.2"
                height="3.6"
                rx="0.8"
                stroke="currentColor"
                strokeWidth="1.1"
              />
            </svg>
          ) : (
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ display: "block" }}
              aria-hidden="true"
            >
              <rect
                x="2"
                y="3"
                width="12"
                height="10"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <rect
                x="5.4"
                y="5.4"
                width="4.2"
                height="3.6"
                rx="0.8"
                stroke="currentColor"
                strokeWidth="1.1"
              />
              <path
                d="M3 13L13.5 3"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        colorMode="dark"
        snapToGrid={true}
        snapGrid={[20, 20]}
        deleteKeyCode={["Backspace", "Delete"]}
        selectionKeyCode={["Shift"]}
        selectionOnDrag={interactionMode === "select"}
        panOnDrag={interactionMode === "pan"}
        onPaneClick={() => setContextMenu(null)}
      >
        <Background
          gap={20}
          size={1}
          style={{ background: "var(--background)" }}
        />
        <Controls
          style={{
            background: "var(--floating)",
            borderColor: "var(--border)",
          }}
        />
        {showMiniMap && (
          <MiniMap
            style={{
              background: "var(--floating)",
              borderColor: "var(--border)",
            }}
            nodeColor={(node) => {
              if (node.data?.kind === "database") return "#336791";
              if (node.data?.kind === "queue") return "#facc15";
              if (node.data?.kind === "api_binding") return "#a78bfa";
              if (node.data?.kind === "service_boundary") return "#fb7185";
              if (node.data?.kind === "infra") {
                switch (node.data?.resourceType) {
                  case "ec2":
                    return "#60a5fa";
                  case "lambda":
                    return "#facc15";
                  case "eks":
                    return "#34d399";
                  case "vpc":
                    return "#a78bfa";
                  case "s3":
                    return "#f97316";
                  case "rds":
                    return "#3b82f6";
                  case "load_balancer":
                    return "#22d3ee";
                  case "hpc":
                    return "#f472b6";
                  default:
                    return "#7c6cff";
                }
              }
              return "#7c6cff";
            }}
          />
        )}
      </ReactFlow>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          flowPosition={contextMenu.flowPosition}
          onClose={() => setContextMenu(null)}
          onAddNode={handleAddNode}
        />
      )}
    </div>
  );
}

export default function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
