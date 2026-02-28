"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StudioHeader, StudioUser } from "@/components/studio/StudioHeader";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { StudioWorkspace } from "@/components/studio/StudioWorkspace";
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
      identities?: Array<{ identity_data?: Record<string, unknown> | null }> | null;
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
        const json = await res.json() as {
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

    const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });

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
      {/* Upgrade notice banner */}
      {showUpgradeNotice && (
        <div
          role="alert"
          style={{
            background: "color-mix(in srgb, var(--primary) 18%, var(--panel) 82%)",
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

      <StudioWorkspace activeTab={activeTab} resetLayoutSignal={resetLayoutSignal} />
    </StudioLayout>
  );
}


