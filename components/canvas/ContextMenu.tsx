"use client";

import React, { useCallback, useEffect } from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAddNode: (kind: string, position: { x: number; y: number }) => void;
  flowPosition: { x: number; y: number };
}

export function ContextMenu({
  x,
  y,
  onClose,
  onAddNode,
  flowPosition,
}: ContextMenuProps) {
  const handleClick = useCallback(
    (kind: string) => {
      onAddNode(kind, flowPosition);
      onClose();
    },
    [flowPosition, onAddNode, onClose],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClickOutside = () => onClose();
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [onClose]);

  const itemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 8px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
    color: "var(--secondary)",
  };

  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
        padding: 6,
        minWidth: 140,
        zIndex: 1000,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Main Options */}
      {[
        {
          kind: "process",
          label: "Function Block",
          icon: "⚙️",
          color: "#a78bfa",
        },
        { kind: "database", label: "Database", icon: "🗄️", color: "#4ade80" },
        { kind: "queue", label: "Queue", icon: "📬", color: "#facc15" },
        {
          kind: "api_rest",
          label: "REST Interface",
          icon: "🔗",
          color: "#60a5fa",
        },
        {
          kind: "api_ws",
          label: "WebSocket Interface",
          icon: "🛰️",
          color: "#22d3ee",
        },
        {
          kind: "api_socketio",
          label: "Socket.IO Interface",
          icon: "🧩",
          color: "#38bdf8",
        },
        {
          kind: "api_webrtc",
          label: "WebRTC Interface",
          icon: "📹",
          color: "#f472b6",
        },
        {
          kind: "api_graphql",
          label: "GraphQL Interface",
          icon: "🕸️",
          color: "#c084fc",
        },
        {
          kind: "api_grpc",
          label: "gRPC Interface",
          icon: "📡",
          color: "#34d399",
        },
        {
          kind: "api_sse",
          label: "SSE Interface",
          icon: "📣",
          color: "#f59e0b",
        },
        {
          kind: "api_webhook",
          label: "Webhook Interface",
          icon: "🪝",
          color: "#fb7185",
        },
        {
          kind: "service_boundary",
          label: "Service Boundary",
          icon: "🧱",
          color: "#fb7185",
        },
      ].map((item) => (
        <div
          key={item.kind}
          style={itemStyle}
          onClick={() => handleClick(item.kind)}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "var(--floating)";
            e.currentTarget.style.color = item.color;
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--secondary)";
          }}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
