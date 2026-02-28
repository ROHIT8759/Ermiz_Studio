import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { ApiBinding, InputField, OutputField } from "@/lib/schema/node";

export const ApiBindingNode = memo(({ data, selected }: NodeProps) => {
  const apiData = data as unknown as ApiBinding;
  const protocol =
    apiData.protocol ?? (apiData.apiType === "asyncapi" ? "ws" : "rest");
  const isRestProtocol = protocol === "rest";
  const isWsProtocol = protocol === "ws";
  const isSocketIOProtocol = protocol === "socket.io";
  const isWebRtcProtocol = protocol === "webrtc";
  const isGraphqlProtocol = protocol === "graphql";
  const isGrpcProtocol = protocol === "grpc";
  const isSseProtocol = protocol === "sse";
  const isWebhookProtocol = protocol === "webhook";

  const methodColors: Record<string, string> = {
    GET: "#60a5fa",
    POST: "#4ade80",
    PUT: "#facc15",
    DELETE: "#ef4444",
    PATCH: "#a78bfa",
  };
  const interfaceColor = isRestProtocol
    ? methodColors[apiData.method || "GET"] || "#60a5fa"
    : isWsProtocol
      ? "#22d3ee"
      : isSocketIOProtocol
        ? "#38bdf8"
        : isWebRtcProtocol
          ? "#f472b6"
          : isGraphqlProtocol
            ? "#c084fc"
            : isGrpcProtocol
              ? "#34d399"
              : isSseProtocol
                ? "#f59e0b"
                : isWebhookProtocol
                  ? "#fb7185"
                  : "#60a5fa";
  const instanceConfig = apiData.instance?.config as
    | {
      endpoint?: string;
      pingIntervalSec?: number;
      pingTimeoutSec?: number;
      maxMessageSizeKb?: number;
      maxConnections?: number;
      namespaces?: string[];
      rooms?: string[];
      events?: string[];
      ackTimeoutMs?: number;
      signalingTransportRef?: string;
      stunServers?: string[];
      turnServers?: string[];
      peerLimit?: number;
      topology?: string;
      schemaSDL?: string;
      operations?: {
        queries?: boolean;
        mutations?: boolean;
        subscriptions?: boolean;
      };
      protobufDefinition?: string;
      service?: string;
      rpcMethods?: Array<{ name?: string; type?: string }>;
      eventName?: string;
      retryMs?: number;
      heartbeatSec?: number;
      direction?: string;
      signatureVerification?: {
        enabled?: boolean;
        headerName?: string;
        secretRef?: string;
      };
      retryPolicy?: {
        enabled?: boolean;
        maxAttempts?: number;
        backoff?: string;
      };
      auth?: { type?: string };
      rateLimit?: { enabled?: boolean; requests?: number; window?: string };
    }
    | undefined;

  const securityIcons: Record<string, string> = {
    none: "🔓",
    api_key: "🔑",
    bearer: "🎫",
    oauth2: "🔐",
    basic: "👤",
  };

  const hasRequestBody = Boolean(apiData.request?.body?.schema?.length);
  const hasQueryParams = Boolean(apiData.request?.queryParams?.length);
  const hasPathParams = Boolean(apiData.request?.pathParams?.length);
  const securityType = isRestProtocol
    ? apiData.security?.type || "none"
    : instanceConfig?.auth?.type || "none";
  const realtimeRateLimit =
    !isRestProtocol && (isWsProtocol || isSocketIOProtocol)
      ? instanceConfig?.rateLimit
      : undefined;

  return (
    <div
      style={{
        background: "var(--panel)",
        borderStyle: "solid",
        borderTopWidth: selected ? 2 : 1,
        borderRightWidth: selected ? 2 : 1,
        borderBottomWidth: selected ? 2 : 1,
        borderLeftWidth: 4,
        borderTopColor: selected ? "var(--primary)" : "var(--border)",
        borderRightColor: selected ? "var(--primary)" : "var(--border)",
        borderBottomColor: selected ? "var(--primary)" : "var(--border)",
        borderLeftColor: interfaceColor,
        borderRadius: 8,
        minWidth: 280,
        boxShadow: selected
          ? "0 0 0 2px rgba(124, 108, 255, 0.2)"
          : "0 4px 12px rgba(0, 0, 0, 0.3)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--floating)",
          borderRadius: "4px 8px 0 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>🔗</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--muted)",
              textTransform: "uppercase",
            }}
          >
            {protocol === "socket.io" ? "SOCKET.IO" : protocol.toUpperCase()}
          </span>
          <span style={{ fontSize: 10, color: "var(--muted)" }}>
            {apiData.version}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12 }}>{securityIcons[securityType]}</span>
          {apiData.deprecated && (
            <span
              style={{
                fontSize: 9,
                padding: "2px 4px",
                background: "#ef4444",
                borderRadius: 3,
                color: "white",
              }}
            >
              DEPRECATED
            </span>
          )}
        </div>
      </div>

      {/* Interface Definition */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: interfaceColor,
              padding: "2px 6px",
              background: "var(--background)",
              borderRadius: 3,
            }}
          >
            {isRestProtocol
              ? apiData.method
              : isWsProtocol
                ? "WS"
                : isSocketIOProtocol
                  ? "SOCKET.IO"
                  : isWebRtcProtocol
                    ? "WEBRTC"
                    : isGraphqlProtocol
                      ? "GRAPHQL"
                      : isGrpcProtocol
                        ? "GRPC"
                        : isSseProtocol
                          ? "SSE"
                          : "WEBHOOK"}
          </span>
          <span
            style={{
              fontSize: 13,
              fontFamily: "monospace",
              color: "var(--foreground)",
            }}
          >
            {isRestProtocol
              ? apiData.route
              : isWsProtocol || isSocketIOProtocol
                ? instanceConfig?.endpoint || "(endpoint)"
                : isWebRtcProtocol
                  ? instanceConfig?.signalingTransportRef || "(signaling ref)"
                  : isGrpcProtocol
                    ? instanceConfig?.service || "(service)"
                    : instanceConfig?.endpoint || "(endpoint)"}
          </span>
        </div>
        {apiData.label && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            {apiData.label}
          </div>
        )}
      </div>

      {/* REST Request Section */}
      {isRestProtocol && (hasPathParams || hasQueryParams || hasRequestBody) && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--muted)",
              marginBottom: 6,
              textTransform: "uppercase",
            }}
          >
            Request
          </div>

          {hasPathParams && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: "#60a5fa" }}>Path: </span>
              {(apiData.request?.pathParams || []).map((p: InputField, i: number) => (
                <span
                  key={i}
                  style={{
                    fontSize: 10,
                    color: "var(--secondary)",
                    marginRight: 6,
                  }}
                >
                  :{p.name}
                </span>
              ))}
            </div>
          )}

          {hasQueryParams && !isWsProtocol && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: "#facc15" }}>Query: </span>
              {(apiData.request?.queryParams || []).map((q: InputField, i: number) => (
                <span
                  key={i}
                  style={{
                    fontSize: 10,
                    color: "var(--secondary)",
                    marginRight: 6,
                  }}
                >
                  ?{q.name}
                </span>
              ))}
            </div>
          )}

          {hasRequestBody && (
            <div>
              <span style={{ fontSize: 9, color: "#4ade80" }}>Body: </span>
              {(apiData.request?.body?.schema || []).map((f: InputField, i: number) => (
                <span
                  key={i}
                  style={{
                    fontSize: 10,
                    color: "var(--secondary)",
                    marginRight: 6,
                  }}
                >
                  {f.name}: {f.type}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* REST Response Section */}
      {isRestProtocol &&
        ((apiData.responses?.success?.schema?.length ?? 0) > 0 ||
          (apiData.responses?.error?.schema?.length ?? 0) > 0) && (
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "var(--muted)",
                marginBottom: 6,
                textTransform: "uppercase",
              }}
            >
              Response
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div>
                <span
                  style={{
                    fontSize: 9,
                    color: "#4ade80",
                    padding: "1px 4px",
                    background: "rgba(74,222,128,0.1)",
                    borderRadius: 3,
                    display: "inline-block",
                    marginBottom: 3,
                  }}
                >
                  {apiData.responses?.success?.statusCode || 200}
                </span>
                {(apiData.responses?.success?.schema || []).map(
                  (f: OutputField, i: number) => (
                    <div
                      key={i}
                      style={{ fontSize: 10, color: "var(--secondary)" }}
                    >
                      {f.name}
                    </div>
                  ),
                )}
              </div>

              <div>
                <span
                  style={{
                    fontSize: 9,
                    color: "#ef4444",
                    padding: "1px 4px",
                    background: "rgba(239,68,68,0.1)",
                    borderRadius: 3,
                    display: "inline-block",
                    marginBottom: 3,
                  }}
                >
                  {apiData.responses?.error?.statusCode || 400}
                </span>
                {(apiData.responses?.error?.schema || []).map(
                  (f: OutputField, i: number) => (
                    <div
                      key={i}
                      style={{ fontSize: 10, color: "var(--secondary)" }}
                    >
                      {f.name}
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        )}

      {/* Protocol Config Summary */}
      {!isRestProtocol && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
            fontSize: 10,
            color: "var(--secondary)",
            display: "grid",
            gap: 4,
          }}
        >
          {isWsProtocol && (
            <>
              <div>
                endpoint:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {instanceConfig?.endpoint || "(unset)"}
                </span>
              </div>
              <div>
                ping:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {instanceConfig?.pingIntervalSec || 0}s /{" "}
                  {instanceConfig?.pingTimeoutSec || 0}s
                </span>
              </div>
              <div>
                limits:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {instanceConfig?.maxMessageSizeKb || 0}KB,{" "}
                  {instanceConfig?.maxConnections || 0} conns
                </span>
              </div>
            </>
          )}
          {isSocketIOProtocol && (
            <>
              <div>
                endpoint:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {instanceConfig?.endpoint || "(unset)"}
                </span>
              </div>
              <div>
                namespaces:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {(instanceConfig?.namespaces || []).length}
                </span>
              </div>
              <div>
                rooms/events:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {(instanceConfig?.rooms || []).length}/
                  {(instanceConfig?.events || []).length}
                </span>
              </div>
            </>
          )}
          {isWebRtcProtocol && (
            <>
              <div>
                signaling:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {instanceConfig?.signalingTransportRef || "(required)"}
                </span>
              </div>
              <div>
                stun/turn:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {(instanceConfig?.stunServers || []).length}/
                  {(instanceConfig?.turnServers || []).length}
                </span>
              </div>
              <div>
                peers/topology:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {instanceConfig?.peerLimit || 0}/{instanceConfig?.topology || "p2p"}
                </span>
              </div>
            </>
          )}
          {isGraphqlProtocol && (
            <>
              <div>
                endpoint:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {instanceConfig?.endpoint || "(unset)"}
                </span>
              </div>
              <div>
                operations:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {instanceConfig?.operations?.queries ? "Q" : "-"}
                  {instanceConfig?.operations?.mutations ? "M" : "-"}
                  {instanceConfig?.operations?.subscriptions ? "S" : "-"}
                </span>
              </div>
              <div>
                schema:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {(instanceConfig?.schemaSDL || "").split("\n").filter(Boolean).length} lines
                </span>
              </div>
            </>
          )}
          {isGrpcProtocol && (
            <>
              <div>
                service:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {instanceConfig?.service || "(unset)"}
                </span>
              </div>
              <div>
                methods:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {(instanceConfig?.rpcMethods || []).length}
                </span>
              </div>
              <div>
                streaming:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {(instanceConfig?.rpcMethods || []).filter(
                    (method) => method?.type && method.type !== "unary",
                  ).length}
                </span>
              </div>
            </>
          )}
          {isSseProtocol && (
            <>
              <div>
                endpoint:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {instanceConfig?.endpoint || "(unset)"}
                </span>
              </div>
              <div>
                event/retry:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {instanceConfig?.eventName || "(event)"}/{instanceConfig?.retryMs || 0}ms
                </span>
              </div>
              <div>
                direction:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {instanceConfig?.direction || "server_to_client"}
                </span>
              </div>
            </>
          )}
          {isWebhookProtocol && (
            <>
              <div>
                endpoint:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {instanceConfig?.endpoint || "(unset)"}
                </span>
              </div>
              <div>
                signature:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {instanceConfig?.signatureVerification?.enabled ? "enabled" : "disabled"}
                </span>
              </div>
              <div>
                retry:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {instanceConfig?.retryPolicy?.enabled
                    ? `${instanceConfig?.retryPolicy?.maxAttempts || 0} ${instanceConfig?.retryPolicy?.backoff || "fixed"}`
                    : "disabled"}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Rate Limit & Security Info */}
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          gap: 12,
          fontSize: 10,
          flexWrap: "wrap",
        }}
      >
        {isRestProtocol && apiData.rateLimit?.enabled && (
          <div style={{ color: "var(--muted)" }}>
            ⚡ {apiData.rateLimit.requests}/{apiData.rateLimit.window}
          </div>
        )}
        {!isRestProtocol && realtimeRateLimit?.enabled && (
          <div style={{ color: "var(--muted)" }}>
            ⚡ {realtimeRateLimit.requests}/{realtimeRateLimit.window}
          </div>
        )}
        {securityType !== "none" && (
          <div style={{ color: "var(--muted)" }}>
            {securityIcons[securityType]} {securityType}
          </div>
        )}
        {isRestProtocol && apiData.cors?.enabled && (
          <div
            style={{
              color: "#4ade80",
              padding: "1px 4px",
              background: "rgba(74,222,128,0.1)",
              border: "1px solid rgba(74,222,128,0.3)",
              borderRadius: 3,
            }}
          >
            CORS ✓
          </div>
        )}
      </div>

      {/* Function Block Reference */}
      <div
        style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}
      >
        <div
          style={{
            fontSize: 10,
            color: "var(--muted)",
            marginBottom: 4,
            textTransform: "uppercase",
          }}
        >
          Invokes Function Block
        </div>
        <div
          style={{
            fontSize: 12,
            fontFamily: "monospace",
            color: apiData.processRef ? "#a78bfa" : "var(--muted)",
            padding: "4px 8px",
            background: "var(--background)",
            borderRadius: 4,
          }}
        >
          {apiData.processRef || "(not connected)"}
        </div>
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 10,
          height: 10,
          background: interfaceColor,
          border: "2px solid var(--panel)",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 10,
          height: 10,
          background: "#a78bfa",
          border: "2px solid var(--panel)",
        }}
      />
    </div>
  );
});

ApiBindingNode.displayName = "ApiBindingNode";
