"use client";
import React, { useMemo, useState } from "react";
import { analyzeDesignSystem, GraphCollection } from "@/lib/runtime/architecture";
import { useStore } from "@/store/useStore";

type RuntimeExecutionNode = {
  id: string;
  kind: string;
  label: string;
};

type RuntimeLogEntry = {
  id: string;
  event: string;
  message: string;
};

const parseSseEvent = (
  rawEvent: string,
): { event: string; data: Record<string, unknown> } | null => {
  const lines = rawEvent.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  if (dataLines.length === 0) return null;

  try {
    return {
      event,
      data: JSON.parse(dataLines.join("\n")) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
};

export function DeployWorkspace() {
  const graphs = useStore((state) => state.graphs);
  const [platform, setPlatform] = useState("vercel");
  const [credentialType, setCredentialType] = useState("oauth");
  const [billingMode, setBillingMode] = useState("platform");
  const [environment, setEnvironment] = useState("production");
  const [isStartingRuntime, setIsStartingRuntime] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [executionOrder, setExecutionOrder] = useState<RuntimeExecutionNode[]>([]);
  const [runtimeLogs, setRuntimeLogs] = useState<RuntimeLogEntry[]>([]);
  const architecture = useMemo(
    () => analyzeDesignSystem(graphs as unknown as GraphCollection),
    [graphs],
  );
  const deployBlocked = !architecture.deploy.ready;

  const handleStartRuntime = async () => {
    setIsStartingRuntime(true);
    setRuntimeError(null);
    setExecutionOrder([]);
    setRuntimeLogs([]);

    try {
      const response = await fetch("/api/runtime/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graphs }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setRuntimeError(payload.error || "runtime_start_failed");
        return;
      }

      if (!response.body) {
        setRuntimeError("runtime_stream_unavailable");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let boundaryIndex = buffer.indexOf("\n\n");
        while (boundaryIndex !== -1) {
          const raw = buffer.slice(0, boundaryIndex).trim();
          buffer = buffer.slice(boundaryIndex + 2);
          boundaryIndex = buffer.indexOf("\n\n");

          if (!raw) continue;
          const parsedEvent = parseSseEvent(raw);
          if (!parsedEvent) continue;

          const message = String(parsedEvent.data.message ?? parsedEvent.event);
          setRuntimeLogs((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              event: parsedEvent.event,
              message,
            },
          ]);

          if (parsedEvent.event === "complete") {
            const streamedOrder = parsedEvent.data.executionOrder;
            if (Array.isArray(streamedOrder)) {
              setExecutionOrder(streamedOrder as RuntimeExecutionNode[]);
            }
          }

          if (parsedEvent.event === "error") {
            setRuntimeError(String(parsedEvent.data.error ?? "runtime_start_failed"));
          }
        }
      }
    } catch {
      setRuntimeError("runtime_start_failed");
    } finally {
      setIsStartingRuntime(false);
    }
  };

  const platforms = [
    {
      id: "vercel",
      name: "Vercel",
      desc: "Next.js native, global edge + preview deploys",
    },
    {
      id: "aws",
      name: "AWS",
      desc: "ECS / Lambda with private networking controls",
    },
    {
      id: "gcp",
      name: "Google Cloud",
      desc: "Cloud Run + Artifact Registry pipelines",
    },
    {
      id: "render",
      name: "Render",
      desc: "Simple builds with managed Postgres",
    },
    {
      id: "fly",
      name: "Fly.io",
      desc: "Global regions with instant scaling",
    },
    {
      id: "railway",
      name: "Railway",
      desc: "Quick services with team billing",
    },
  ];

  const actionButtonStyle: React.CSSProperties = {
    border: "1px solid var(--border)",
    background: "var(--floating)",
    color: "var(--foreground)",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <main
      style={{
        flex: 1,
        padding: "18px 20px 28px",
        background: "var(--background)",
        overflow: "auto",
      }}
    >
      <div
        style={{
          width: "min(1200px, 100%)",
          margin: "0 auto",
          display: "grid",
          gap: 16,
        }}
      >
        <section
          style={{
            border: "1px solid var(--border)",
            background: "color-mix(in srgb, var(--panel) 92%, #0a0f16 8%)",
            borderRadius: 14,
            padding: "18px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Deployment</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Configure the platform, credentials, billing, and release pipeline.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={actionButtonStyle}>
              Validate ({architecture.deploy.errorCount} errors)
            </button>
            <button
              type="button"
              onClick={handleStartRuntime}
              disabled={isStartingRuntime}
              style={{
                ...actionButtonStyle,
                background:
                  "color-mix(in srgb, var(--primary) 20%, var(--panel) 80%)",
                opacity: isStartingRuntime ? 0.75 : 1,
                cursor: isStartingRuntime ? "not-allowed" : "pointer",
              }}
            >
              {isStartingRuntime ? "Running Runtime..." : "Build"}
            </button>
            <button
              type="button"
              disabled={deployBlocked}
              style={{
                ...actionButtonStyle,
                background:
                  deployBlocked
                    ? "color-mix(in srgb, var(--floating) 95%, #111111 5%)"
                    : "color-mix(in srgb, var(--secondary) 18%, var(--panel) 82%)",
                opacity: deployBlocked ? 0.6 : 1,
                cursor: deployBlocked ? "not-allowed" : "pointer",
              }}
            >
              {deployBlocked ? "Deploy Blocked" : "Deploy"}
            </button>
            <button type="button" style={actionButtonStyle}>
              Rollback
            </button>
          </div>
        </section>

        <section
          style={{
            border: "1px solid var(--border)",
            background: "var(--panel)",
            borderRadius: 14,
            padding: 16,
            display: "grid",
            gap: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              Runtime Architecture Model
            </div>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 11,
                color: architecture.deploy.ready ? "#4ade80" : "#f87171",
              }}
            >
              {architecture.deploy.ready ? "Deploy Ready" : "Not Deployable"}
            </div>
          </div>

          <div
            style={{
              fontSize: 12,
              color: "var(--muted)",
              display: "grid",
              gap: 4,
            }}
          >
            <div>
              Dependency direction: {architecture.runtimeModel.dependencyDirection}
            </div>
            <div>Hosting: {architecture.runtimeModel.hostingLayer}</div>
            <div>
              Layers: API {architecture.runtimeModel.layerCounts.api} | Functional{" "}
              {architecture.runtimeModel.layerCounts.functional} | Data{" "}
              {architecture.runtimeModel.layerCounts.data} | Infra{" "}
              {architecture.runtimeModel.layerCounts.infra}
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600 }}>Design Workflow Model</div>
          <div style={{ display: "grid", gap: 8 }}>
            {architecture.workflowModel.stages.map((stage) => (
              <div
                key={stage.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "var(--floating)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{stage.title}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    {stage.detail}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color:
                      stage.status === "complete"
                        ? "#4ade80"
                        : stage.status === "blocked"
                          ? "#f87171"
                          : "#facc15",
                    textTransform: "uppercase",
                    fontWeight: 700,
                  }}
                >
                  {stage.status}
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 600 }}>Runtime Execution</div>
          <div style={{ display: "grid", gap: 8 }}>
            {runtimeError && (
              <div
                style={{
                  border: "1px solid color-mix(in srgb, #ef4444 40%, var(--border) 60%)",
                  borderRadius: 8,
                  padding: "7px 9px",
                  fontSize: 11,
                  color: "#fda4af",
                  background: "color-mix(in srgb, #ef4444 12%, var(--panel) 88%)",
                }}
              >
                Failed to start runtime: {runtimeError}
              </div>
            )}

            {!runtimeError && executionOrder.length === 0 && (
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                No runtime execution yet. Click Build to run `RuntimeEngine.start()`.
              </div>
            )}

            {executionOrder.length > 0 && (
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "var(--floating)",
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  Last execution order ({executionOrder.length} nodes):
                </div>
                {executionOrder.map((node, index) => (
                  <div key={`${node.id}-${index}`} style={{ fontSize: 12 }}>
                    {index + 1}. {node.kind} · {node.label} ({node.id})
                  </div>
                ))}
              </div>
            )}

            {runtimeLogs.length > 0 && (
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "var(--floating)",
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  Live runtime logs:
                </div>
                {runtimeLogs.slice(-20).map((log) => (
                  <div key={log.id} style={{ fontSize: 11, color: "var(--muted)" }}>
                    [{log.event}] {log.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ fontSize: 13, fontWeight: 600 }}>Service Boundary Rules</div>
          <div style={{ display: "grid", gap: 8 }}>
            {architecture.serviceModel.rules.map((rule) => (
              <div key={rule} style={{ fontSize: 12, color: "var(--muted)" }}>
                • {rule}
              </div>
            ))}
          </div>

          {(architecture.runtimeModel.issues.length > 0 ||
            architecture.serviceModel.issues.length > 0) && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Blocking Issues</div>
              {[...architecture.runtimeModel.issues, ...architecture.serviceModel.issues]
                .filter((issue) => issue.severity === "error")
                .slice(0, 12)
                .map((issue, index) => (
                  <div
                    key={`${issue.code}-${index}`}
                    style={{
                      border: "1px solid color-mix(in srgb, #ef4444 40%, var(--border) 60%)",
                      borderRadius: 8,
                      padding: "7px 9px",
                      fontSize: 11,
                      color: "#fda4af",
                      background: "color-mix(in srgb, #ef4444 12%, var(--panel) 88%)",
                    }}
                  >
                    {issue.message}
                  </div>
                ))}
            </div>
          )}
        </section>

        <section
          style={{
            border: "1px solid var(--border)",
            background: "var(--panel)",
            borderRadius: 14,
            padding: 16,
            display: "grid",
            gap: 14,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600 }}>Choose Platform</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 10,
            }}
          >
            {platforms.map((item) => {
              const isActive = platform === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPlatform(item.id)}
                  style={{
                    border: "1px solid var(--border)",
                    background: isActive
                      ? "color-mix(in srgb, var(--primary) 18%, var(--panel) 82%)"
                      : "color-mix(in srgb, var(--floating) 94%, #0b0f16 6%)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    textAlign: "left",
                    cursor: "pointer",
                    boxShadow: isActive ? "var(--shadow-soft)" : "none",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                    {item.desc}
                  </div>
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                background: "var(--floating)",
              }}
            >
              <div style={{ fontSize: 12, marginBottom: 8 }}>Environment</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["production", "staging", "preview"].map((env) => (
                  <button
                    key={env}
                    type="button"
                    onClick={() => setEnvironment(env)}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 999,
                      padding: "5px 10px",
                      fontSize: 11,
                      cursor: "pointer",
                      background:
                        environment === env
                          ? "color-mix(in srgb, var(--panel) 80%, #141a24 20%)"
                          : "transparent",
                      color:
                        environment === env
                          ? "var(--foreground)"
                          : "var(--muted)",
                    }}
                  >
                    {env}
                  </button>
                ))}
              </div>
            </div>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                background: "var(--floating)",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12 }}>Region & Runtime</div>
              <select
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "6px 8px",
                  background: "var(--panel)",
                  color: "var(--foreground)",
                  fontSize: 12,
                }}
                defaultValue="iad"
              >
                <option value="iad">US East (IAD)</option>
                <option value="sfo">US West (SFO)</option>
                <option value="lon">EU West (LON)</option>
                <option value="sin">Asia Pacific (SIN)</option>
              </select>
              <select
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "6px 8px",
                  background: "var(--panel)",
                  color: "var(--foreground)",
                  fontSize: 12,
                }}
                defaultValue="node"
              >
                <option value="node">Node.js 20</option>
                <option value="edge">Edge Runtime</option>
                <option value="docker">Docker Container</option>
              </select>
            </div>
          </div>
        </section>

        <section
          style={{
            border: "1px solid var(--border)",
            background: "var(--panel)",
            borderRadius: 14,
            padding: 16,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            Credentials & Billing
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { id: "oauth", label: "OAuth Connection" },
              { id: "api_key", label: "API Key" },
              { id: "service_account", label: "Service Account" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCredentialType(item.id)}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 999,
                  padding: "6px 12px",
                  fontSize: 11,
                  cursor: "pointer",
                  background:
                    credentialType === item.id
                      ? "color-mix(in srgb, var(--primary) 18%, var(--panel) 82%)"
                      : "transparent",
                  color:
                    credentialType === item.id
                      ? "var(--foreground)"
                      : "var(--muted)",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {credentialType === "oauth" && (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                background: "var(--floating)",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12 }}>
                Connect {platforms.find((item) => item.id === platform)?.name}
              </div>
              <button
                type="button"
                style={{
                  ...actionButtonStyle,
                  width: "fit-content",
                }}
              >
                Authorize Workspace
              </button>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                Last sync: not connected
              </div>
            </div>
          )}

          {credentialType === "api_key" && (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                background: "var(--floating)",
                display: "grid",
                gap: 8,
              }}
            >
              <input
                placeholder="API Key"
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "6px 8px",
                  background: "var(--panel)",
                  color: "var(--foreground)",
                  fontSize: 12,
                }}
              />
              <input
                placeholder="Account ID"
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "6px 8px",
                  background: "var(--panel)",
                  color: "var(--foreground)",
                  fontSize: 12,
                }}
              />
              <input
                placeholder="Project ID"
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "6px 8px",
                  background: "var(--panel)",
                  color: "var(--foreground)",
                  fontSize: 12,
                }}
              />
            </div>
          )}

          {credentialType === "service_account" && (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                background: "var(--floating)",
                display: "grid",
                gap: 8,
              }}
            >
              <textarea
                placeholder="Paste service account JSON"
                rows={4}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "8px",
                  background: "var(--panel)",
                  color: "var(--foreground)",
                  fontSize: 12,
                  resize: "vertical",
                }}
              />
              <input
                placeholder="Project / Org"
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "6px 8px",
                  background: "var(--panel)",
                  color: "var(--foreground)",
                  fontSize: 12,
                }}
              />
            </div>
          )}

          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: 12,
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600 }}>Billing</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { id: "platform", label: "Use Platform Billing" },
                { id: "card", label: "Add Card" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setBillingMode(item.id)}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 999,
                    padding: "6px 12px",
                    fontSize: 11,
                    cursor: "pointer",
                    background:
                      billingMode === item.id
                        ? "color-mix(in srgb, var(--secondary) 18%, var(--panel) 82%)"
                        : "transparent",
                    color:
                      billingMode === item.id
                        ? "var(--foreground)"
                        : "var(--muted)",
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {billingMode === "card" && (
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 12,
                  background: "var(--floating)",
                  display: "grid",
                  gap: 8,
                }}
              >
                <input
                  placeholder="Cardholder Name"
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "6px 8px",
                    background: "var(--panel)",
                    color: "var(--foreground)",
                    fontSize: 12,
                  }}
                />
                <input
                  placeholder="Card Number"
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "6px 8px",
                    background: "var(--panel)",
                    color: "var(--foreground)",
                    fontSize: 12,
                  }}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    placeholder="MM / YY"
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "6px 8px",
                      background: "var(--panel)",
                      color: "var(--foreground)",
                      fontSize: 12,
                    }}
                  />
                  <input
                    placeholder="CVC"
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "6px 8px",
                      background: "var(--panel)",
                      color: "var(--foreground)",
                      fontSize: 12,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        <section
          style={{
            border: "1px solid var(--border)",
            background: "var(--panel)",
            borderRadius: 14,
            padding: 16,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600 }}>Deployment Pipeline</div>
          <div style={{ display: "grid", gap: 8 }}>
            {[
              "Generate OpenAPI / AsyncAPI",
              "Compile runtime artifacts",
              "Run database migrations",
              "Seed reference data",
              "Upload build to artifact registry",
              "Notify team on release",
            ].map((item) => (
              <label
                key={item}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--muted)",
                }}
              >
                <input type="checkbox" defaultChecked />
                <span>{item}</span>
              </label>
            ))}
          </div>
          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: 12,
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600 }}>Release Controls</div>
            <div style={{ display: "grid", gap: 8 }}>
              {[
                "Zero-downtime deployment",
                "Auto rollback on failed health check",
                "Canary release (10% traffic)",
                "Enable preview deployments",
              ].map((item) => (
                <label
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "var(--muted)",
                  }}
                >
                  <input type="checkbox" />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            border: "1px solid var(--border)",
            background: "var(--panel)",
            borderRadius: 14,
            padding: 16,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            Secrets, Domains, and Observability
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                background: "var(--floating)",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600 }}>Secrets</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                DATABASE_URL, SUPABASE_KEY, STRIPE_SECRET
              </div>
              <button type="button" style={actionButtonStyle}>
                Add Secret
              </button>
            </div>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                background: "var(--floating)",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600 }}>Custom Domain</div>
              <input
                placeholder="api.yourdomain.com"
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "6px 8px",
                  background: "var(--panel)",
                  color: "var(--foreground)",
                  fontSize: 12,
                }}
              />
              <button type="button" style={actionButtonStyle}>
                Verify DNS
              </button>
            </div>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                background: "var(--floating)",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                Observability
              </div>
              <label style={{ display: "flex", gap: 8, fontSize: 12 }}>
                <input type="checkbox" defaultChecked />
                Stream logs to dashboard
              </label>
              <label style={{ display: "flex", gap: 8, fontSize: 12 }}>
                <input type="checkbox" />
                Enable traces & metrics
              </label>
              <label style={{ display: "flex", gap: 8, fontSize: 12 }}>
                <input type="checkbox" />
                Alert on error spikes
              </label>
            </div>
          </div>
        </section>

        <section
          style={{
            border: "1px solid var(--border)",
            background: "var(--panel)",
            borderRadius: 14,
            padding: 16,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600 }}>Recent Deployments</div>
          <div style={{ display: "grid", gap: 8 }}>
            {[
              {
                id: "rel-322",
                status: "Live",
                meta: "Production · US East · 2m ago",
              },
              {
                id: "rel-321",
                status: "Rolled back",
                meta: "Production · EU West · 1d ago",
              },
              {
                id: "rel-320",
                status: "Preview",
                meta: "Staging · US West · 2d ago",
              },
            ].map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "var(--floating)",
                }}
              >
                <div style={{ fontSize: 12 }}>
                  {item.id} · {item.status}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {item.meta}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

