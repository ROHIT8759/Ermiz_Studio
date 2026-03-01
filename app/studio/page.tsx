"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StudioHeader, StudioUser } from "@/components/studio/StudioHeader";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { StudioWorkspace } from "@/components/studio/StudioWorkspace";
import { TestPanel } from "@/components/studio/TestPanel";
import { validateArchitecture, ValidationResult } from "@/lib/validate-architecture";
import {
  STORAGE_KEYS,
  STATUS_TEXT_BY_TAB,
  WorkspaceTab,
} from "@/components/studio/config";
import { supabaseClient } from "@/lib/supabase/client";
import { useStore } from "@/store/useStore";

export default function Home() {
  const router = useRouter();
  const setActiveWorkspaceTab = useStore((state) => state.setActiveTab);
  const loadGraphPreset = useStore((state) => state.loadGraphPreset);
  const exportGraphs = useStore((state) => state.exportGraphs);
  const importGraphs = useStore((state) => state.importGraphs);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("api");
  const [resetLayoutSignal, setResetLayoutSignal] = useState(0);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [showUpgradeNotice, setShowUpgradeNotice] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const retryCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [genStats, setGenStats] = useState<{ requests: number; files: number; time: string } | null>(null);
  const [isTestOpen, setIsTestOpen] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [commitStatus, setCommitStatus] = useState("Uncommitted changes");
  const [saveState, setSaveState] = useState("Unsaved");
  const profileRef = useRef<HTMLDivElement | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [user, setUser] = useState<StudioUser | null>(null);
  const [creditLimit, setCreditLimit] = useState(1000);
  const [creditUsed, setCreditUsed] = useState(0);
  const applyUser = (
    nextUser: {
      email?: string | null;
      user_metadata?: Record<string, unknown> | null;
      identities?: Array<{
        identity_data?: Record<string, unknown> | null;
      }> | null;
    } | null,
  ) => {
    setAvatarFailed(false);
    if (!nextUser) {
      setIsProfileOpen(false);
    } else {
      setIsLoginOpen(false);
    }
    setUser(nextUser);
  };
  const creditUsedPercent = Math.min(
    100,
    creditLimit > 0 ? Math.round((creditUsed / creditLimit) * 100) : 0,
  );

  const statusText = STATUS_TEXT_BY_TAB[activeTab];

  // Load persisted graphs from localStorage on first mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.graphs);
      if (saved) {
        importGraphs(JSON.parse(saved));
      }
    } catch {
      // ignore storage errors
    }
    // importGraphs is stable (zustand action)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch real credit balance when user is authenticated
  useEffect(() => {
    if (!user) return;
    const fetchCredits = async () => {
      try {
        const res = await fetch("/api/credits");
        if (!res.ok) return;
        const json = (await res.json()) as {
          balance?: { availableCredits?: number; monthlyFreeCredits?: number };
        };
        if (json.balance) {
          const monthly = json.balance.monthlyFreeCredits ?? 1000;
          const available = json.balance.availableCredits ?? monthly;
          setCreditLimit(monthly);
          setCreditUsed(Math.max(0, monthly - available));
        }
      } catch {
        // ignore network errors – show last known value
      }
    };
    fetchCredits();
  }, [user]);

  useEffect(() => {
    // Load saved tab from localStorage after mount to avoid hydration mismatch
    if (typeof window !== "undefined") {
      const savedTab = localStorage.getItem(STORAGE_KEYS.activeTab);
      if (
        savedTab === "api" ||
        savedTab === "database" ||
        savedTab === "functions" ||
        savedTab === "agent"
      ) {
        const frame = window.requestAnimationFrame(() => {
          setActiveTab(savedTab);
        });
        return () => {
          window.cancelAnimationFrame(frame);
        };
      }
    }
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        profileRef.current &&
        event.target instanceof Node &&
        !profileRef.current.contains(event.target)
      ) {
        setIsProfileOpen(false);
        setIsLoginOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadUser = async () => {
      try {
        const { data, error } = await supabaseClient.auth.getUser();
        if (!isMounted) return;
        if (error) {
          applyUser(null);
          return;
        }
        applyUser(data.user ?? null);
      } catch {
        if (!isMounted) return;
        applyUser(null);
      }
    };

    loadUser();

    const { data } = supabaseClient.auth.onAuthStateChange(
      (_event, session) => {
        applyUser(session?.user ?? null);
      },
    );

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.activeTab, activeTab);
    } catch {
      // ignore storage errors
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 1100px)");
    const updateViewport = (event?: MediaQueryListEvent) => {
      const isCompact = event ? event.matches : mediaQuery.matches;
      setIsCompactViewport(isCompact);
    };
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => {
      mediaQuery.removeEventListener("change", updateViewport);
    };
  }, []);

  useEffect(() => {
    setActiveWorkspaceTab(activeTab);
  }, [activeTab, setActiveWorkspaceTab]);

  // Keep a stable ref so the countdown interval can call handleGenerateCode
  // without capturing a stale closure.
  const handleGenerateCodeRef = useRef<() => Promise<void>>(async () => { });

  // Auto-retry when the countdown reaches null after expiring (not after dismiss).
  const isCountingDown = useRef(false);
  useEffect(() => {
    if (retryCountdown !== null) {
      isCountingDown.current = true;
    } else if (isCountingDown.current) {
      isCountingDown.current = false;
      // countdown expired naturally → auto retry
      handleGenerateCodeRef.current();
    }
  }, [retryCountdown]);

  // Validate-then-prompt: runs checks, shows picker if valid.
  const handleGenerateCodeClick = useCallback(() => {
    const graphs = exportGraphs();
    const result = validateArchitecture(graphs);
    setValidationResult(result);

    if (!result.ok) {
      // Errors found — don't show picker, the validation modal will appear
      return;
    }
    // Passed (maybe with warnings) — show language picker
    setShowLanguagePicker(true);
  }, [exportGraphs]);

  const handleGenerateCode = async (language: "javascript" | "python" = "javascript") => {
    setShowLanguagePicker(false);
    setValidationResult(null);
    setGenError(null);
    setRetryCountdown(null);
    if (retryCountdownRef.current) {
      clearInterval(retryCountdownRef.current);
      retryCountdownRef.current = null;
    }
    setIsGenerating(true);
    try {
      console.log("🔹 Starting code generation...");

      const graphs = exportGraphs();
      console.log("📦 Exported graphs:", graphs);

      // Merge all tabs into single graph
      const allNodes = Object.values(graphs).flatMap((g) => g.nodes);
      const alleges = Object.values(graphs).flatMap((g) => g.edges);

      console.log("🧩 Total Nodes:", allNodes.length);
      console.log("🔗 Total Edges:", alleges.length);

      const isJs = language === "javascript";

      // Tech stack + metadata adapted to chosen language
      const techStack = {
        frontend: "none",
        backend: isJs ? "node" : "python",
        database: "postgresql",
        deployment: "docker",
      };

      const metadata = {
        language: isJs ? "javascript" : "python",
        framework: isJs ? "express" : "fastapi",
        architectureStyle: "monolithic",
        generatedBy: "ermiz-studio",
      };

      console.log("🛠 Tech Stack:", techStack);
      console.log("🧾 Metadata:", metadata);

      const requestPayload = {
        nodes: allNodes,
        edges: alleges,
        techStack,
        metadata,
        language,
      };

      console.log("JSON PAYLOAD EXPORT:\n" + JSON.stringify(requestPayload, null, 2));

      console.log("🚀 Sending request to /api/gen...");

      const res = await fetch("/api/gen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });

      console.log("📡 Response received. Status:", res.status);

      if (!res.ok) {
        let userMessage = "Code generation failed. Please try again.";
        let quotaRetryAfter: number | null = null;
        try {
          const body = await res.json();
          if (res.status === 429) {
            quotaRetryAfter = typeof body.retryAfter === "number" ? body.retryAfter : 60;
            userMessage =
              "Gemini free-tier quota exhausted. Retrying automatically in {SECS}s, " +
              "or upgrade at ai.google.dev for unlimited usage.";
          } else if (body.error) {
            userMessage = body.error;
          }
        } catch {
          // keep default message
        }
        setGenError(userMessage);
        if (quotaRetryAfter !== null) {
          setRetryCountdown(quotaRetryAfter);
          retryCountdownRef.current = setInterval(() => {
            setRetryCountdown((prev) => {
              if (prev === null || prev <= 1) {
                if (retryCountdownRef.current) {
                  clearInterval(retryCountdownRef.current);
                  retryCountdownRef.current = null;
                }
                return null;
              }
              return prev - 1;
            });
          }, 1000);
        }
        return;
      }

      console.log("📦 Receiving ZIP blob...");
      const geminiRequests = Number(res.headers.get("X-Gemini-Requests") ?? 0);
      const generatedFiles = Number(res.headers.get("X-Generated-Files") ?? 0);
      const blob = await res.blob();
      console.log("✅ Blob size (bytes):", blob.size);

      const url = window.URL.createObjectURL(blob);
      console.log("🔗 Created download URL");

      const a = document.createElement("a");
      a.href = url;
      a.download = "generated-project.zip";
      document.body.appendChild(a);

      console.log("⬇️ Triggering download...");
      a.click();

      a.remove();
      window.URL.revokeObjectURL(url);

      setGenStats({
        requests: geminiRequests,
        files: generatedFiles,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      console.log(`🎉 Generation complete. Gemini requests: ${geminiRequests}, files: ${generatedFiles}.`);
    } catch (error) {
      console.error("🔥 Unexpected error during generation:", error);
      setGenError("An unexpected error occurred. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };
  // Keep the ref always pointing to the latest version so the interval can call it.
  handleGenerateCodeRef.current = () => handleGenerateCode();

  const handleRunTest = () => setIsTestOpen(true);

  const handleSaveChanges = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.graphs, JSON.stringify(exportGraphs()));
    } catch {
      // ignore storage errors
    }
    setSaveState("Saved");
  };

  const handleCommitChanges = () => {
    handleSaveChanges();
    setCommitStatus("Committed");
  };

  const handleResetLayout = () => {
    setResetLayoutSignal((prev) => prev + 1);
  };

  const handleLogin = async () => {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      "/studio",
    )}`;
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      // keep the modal open so the user can retry
      // optional: surface error in UI later
    }
  };

  const handleLogout = async () => {
    try {
      await supabaseClient.auth.signOut();
    } catch {
      // ignore auth errors
    }
    try {
      await fetch("/auth/logout", { method: "POST" });
    } catch {
      // ignore network errors
    }
    setIsProfileOpen(false);
    applyUser(null);
    router.push("/");
    router.refresh();
  };

  return (
    <StudioLayout
      isCompactViewport={isCompactViewport}
      statusText={statusText}
      creditUsedPercent={creditUsedPercent}
      saveState={saveState}
      commitStatus={commitStatus}
    >
      {/* Generation stats banner */}
      {genStats && !genError && (
        <div
          style={{
            background: "color-mix(in srgb, #22c55e 10%, var(--panel) 90%)",
            borderBottom: "1px solid color-mix(in srgb, #22c55e 30%, transparent)",
            padding: "7px 18px",
            fontSize: 11,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
            color: "var(--muted)",
          }}
        >
          <span>
            ✓ Last generation at {genStats.time} ·
            <strong style={{ color: "var(--foreground)" }}>{genStats.requests}</strong> Gemini request{genStats.requests !== 1 ? "s" : ""} ·
            <strong style={{ color: "var(--foreground)" }}>{genStats.files}</strong> file{genStats.files !== 1 ? "s" : ""} generated
          </span>
          <button
            type="button"
            onClick={() => setGenStats(null)}
            aria-label="Dismiss"
            style={{
              border: "none",
              background: "transparent",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              padding: "0 2px",
            }}
          >
            ×
          </button>
        </div>
      )}
      {/* Generation error banner */}
      {genError && (
        <div
          role="alert"
          style={{
            background:
              retryCountdown !== null
                ? "color-mix(in srgb, #f59e0b 12%, var(--panel) 88%)"
                : "color-mix(in srgb, #ef4444 14%, var(--panel) 86%)",
            borderBottom:
              retryCountdown !== null
                ? "1px solid color-mix(in srgb, #f59e0b 40%, transparent)"
                : "1px solid color-mix(in srgb, #ef4444 40%, transparent)",
            padding: "10px 18px",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <span>
            {retryCountdown !== null
              ? genError.replace("{SECS}", String(retryCountdown))
              : genError}
          </span>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {retryCountdown !== null && (
              <button
                type="button"
                onClick={() => {
                  isCountingDown.current = false; // prevent duplicate auto-retry
                  if (retryCountdownRef.current) {
                    clearInterval(retryCountdownRef.current);
                    retryCountdownRef.current = null;
                  }
                  setRetryCountdown(null);
                  setGenError(null);
                  handleGenerateCode();
                }}
                style={{
                  border: "1px solid #f59e0b",
                  background: "color-mix(in srgb, #f59e0b 20%, var(--floating))",
                  color: "var(--foreground)",
                  borderRadius: 8,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Retry Now
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                isCountingDown.current = false; // prevent auto-retry
                if (retryCountdownRef.current) {
                  clearInterval(retryCountdownRef.current);
                  retryCountdownRef.current = null;
                }
                setRetryCountdown(null);
                setGenError(null);
              }}
              aria-label="Dismiss"
              style={{
                border: "1px solid var(--border)",
                background: "var(--floating)",
                color: "var(--foreground)",
                borderRadius: 8,
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {/* Upgrade notice banner */}
      {showUpgradeNotice && (
        <div
          role="alert"
          style={{
            background:
              "color-mix(in srgb, var(--primary) 18%, var(--panel) 82%)",
            borderBottom: "1px solid var(--border)",
            padding: "10px 18px",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <span>
            <strong>Pro plan coming soon.</strong> Unlimited generations, team
            workspaces, and priority support — stay tuned.
          </span>
          <button
            type="button"
            onClick={() => setShowUpgradeNotice(false)}
            aria-label="Dismiss"
            style={{
              border: "1px solid var(--border)",
              background: "var(--floating)",
              color: "var(--foreground)",
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {/* Top Bar */}
      <StudioHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isCompactViewport={isCompactViewport}
        profileRef={profileRef}
        user={user}
        isProfileOpen={isProfileOpen}
        setIsProfileOpen={setIsProfileOpen}
        isLoginOpen={isLoginOpen}
        setIsLoginOpen={setIsLoginOpen}
        avatarFailed={avatarFailed}
        setAvatarFailed={setAvatarFailed}
        creditUsed={creditUsed}
        creditLimit={creditLimit}
        creditUsedPercent={creditUsedPercent}
        isGenerating={isGenerating}
        handleGenerateCode={handleGenerateCodeClick}
        handleRunTest={handleRunTest}
        handleSaveChanges={handleSaveChanges}
        handleCommitChanges={handleCommitChanges}
        handleResetLayout={handleResetLayout}
        handleLogout={handleLogout}
        handleLogin={handleLogin}
        handleNewProject={() => {
          setIsProfileOpen(false);
          loadGraphPreset("empty");
          setSaveState("Unsaved");
          setCommitStatus("Uncommitted changes");
        }}
        handleBuyPro={() => {
          setIsProfileOpen(false);
          setShowUpgradeNotice(true);
        }}
      />

      <StudioWorkspace
        activeTab={activeTab}
        resetLayoutSignal={resetLayoutSignal}
      />

      <TestPanel
        isOpen={isTestOpen}
        onClose={() => setIsTestOpen(false)}
      />

      {/* ── Validation Issues Modal ──────────────────────────────────── */}
      {validationResult && !validationResult.ok && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "grid",
            placeItems: "center",
            background: "rgba(0,0,0,0.55)",
          }}
          onClick={() => setValidationResult(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "22px 24px",
              maxWidth: 520,
              width: "90vw",
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#ef4444" }}>
              ⚠ Architecture Validation Failed
            </h3>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 14px" }}>
              Fix these issues before generating code:
            </p>
            {validationResult.errors.map((issue, i) => (
              <div
                key={`err-${i}`}
                style={{
                  background: "color-mix(in srgb, #ef4444 8%, var(--floating) 92%)",
                  border: "1px solid color-mix(in srgb, #ef4444 25%, var(--border) 75%)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  marginBottom: 6,
                  fontSize: 12,
                }}
              >
                <strong style={{ color: "#ef4444" }}>✕</strong> {issue.title}
                {issue.detail && (
                  <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 3 }}>{issue.detail}</div>
                )}
              </div>
            ))}
            {validationResult.warnings.length > 0 && (
              <>
                <p style={{ fontSize: 12, color: "var(--muted)", margin: "12px 0 8px" }}>Warnings:</p>
                {validationResult.warnings.map((issue, i) => (
                  <div
                    key={`warn-${i}`}
                    style={{
                      background: "color-mix(in srgb, #f59e0b 6%, var(--floating) 94%)",
                      border: "1px solid color-mix(in srgb, #f59e0b 20%, var(--border) 80%)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      marginBottom: 6,
                      fontSize: 12,
                    }}
                  >
                    <strong style={{ color: "#f59e0b" }}>⚡</strong> {issue.title}
                    {issue.detail && (
                      <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 3 }}>{issue.detail}</div>
                    )}
                  </div>
                ))}
              </>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setValidationResult(null)}
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--floating)",
                  color: "var(--foreground)",
                  borderRadius: 8,
                  padding: "7px 16px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Language Picker Modal ────────────────────────────────────── */}
      {showLanguagePicker && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "grid",
            placeItems: "center",
            background: "rgba(0,0,0,0.55)",
          }}
          onClick={() => setShowLanguagePicker(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "24px 28px",
              maxWidth: 420,
              width: "88vw",
              boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
            }}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>Generate Code</h3>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 16px" }}>
              Choose the language for your generated project:
            </p>
            {/* Show warnings inline if any */}
            {validationResult && validationResult.warnings.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {validationResult.warnings.map((w, i) => (
                  <div
                    key={i}
                    style={{
                      background: "color-mix(in srgb, #f59e0b 6%, var(--floating) 94%)",
                      border: "1px solid color-mix(in srgb, #f59e0b 20%, var(--border) 80%)",
                      borderRadius: 8,
                      padding: "6px 10px",
                      marginBottom: 4,
                      fontSize: 11,
                      color: "var(--muted)",
                    }}
                  >
                    <strong style={{ color: "#f59e0b" }}>⚡</strong> {w.title}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => handleGenerateCode("javascript")}
                style={{
                  flex: 1,
                  border: "1px solid var(--border)",
                  background: "color-mix(in srgb, #f7df1e 10%, var(--floating) 90%)",
                  color: "var(--foreground)",
                  borderRadius: 10,
                  padding: "14px 10px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 28 }}>🟨</span>
                JavaScript
                <span style={{ fontSize: 10, fontWeight: 400, color: "var(--muted)" }}>Node.js + Express</span>
              </button>
              <button
                type="button"
                onClick={() => handleGenerateCode("python")}
                style={{
                  flex: 1,
                  border: "1px solid var(--border)",
                  background: "color-mix(in srgb, #3776ab 10%, var(--floating) 90%)",
                  color: "var(--foreground)",
                  borderRadius: 10,
                  padding: "14px 10px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 28 }}>🐍</span>
                Python
                <span style={{ fontSize: 10, fontWeight: 400, color: "var(--muted)" }}>FastAPI</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowLanguagePicker(false)}
              style={{
                width: "100%",
                marginTop: 10,
                border: "none",
                background: "transparent",
                color: "var(--muted)",
                fontSize: 11,
                cursor: "pointer",
                padding: "6px 0",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </StudioLayout>
  );
}
