"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";

const templates = [
  "Auth system with JWT + refresh tokens",
  "Event-driven order pipeline",
  "Postgres schema for SaaS billing",
  "Deploy infra to edge",
];

type RecentItem = { label: string; meta: string };
type ProjectItem = { id: string; name: string; updatedAt: string; status: string };

export default function MasterPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(
    "Payments API with Stripe + webhook retries",
  );
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [user, setUser] = useState<{
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
    identities?: Array<{ identity_data?: Record<string, unknown> | null }> | null;
  } | null>(null);
  const [creditLimit, setCreditLimit] = useState(1000);
  const [creditUsed, setCreditUsed] = useState(0);
  const creditUsedPercent = Math.min(
    100,
    creditLimit > 0 ? Math.round((creditUsed / creditLimit) * 100) : 0,
  );

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(event.target as Node)) {
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
          setUser(null);
          setIsProfileOpen(false);
          return;
        }
        setUser(data.user ?? null);
        if (data.user) {
          setIsLoginOpen(false);
        } else {
          setIsProfileOpen(false);
        }
      } catch {
        if (!isMounted) return;
        setUser(null);
        setIsProfileOpen(false);
      }
    };

    loadUser();

    const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsLoginOpen(false);
      } else {
        setIsProfileOpen(false);
      }
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Fetch credits and recent documents whenever the user changes
  useEffect(() => {
    if (!user) {
      setRecent([]);
      setProjects([]);
      setCreditUsed(0);
      setCreditLimit(1000);
      return;
    }

    const fetchData = async () => {
      try {
        const [creditsRes, docsRes] = await Promise.all([
          fetch("/api/credits"),
          fetch("/api/documents"),
        ]);

        if (creditsRes.ok) {
          const creditsJson = await creditsRes.json() as {
            balance?: { availableCredits?: number; monthlyFreeCredits?: number };
          };
          if (creditsJson.balance) {
            const monthly = creditsJson.balance.monthlyFreeCredits ?? 1000;
            const available = creditsJson.balance.availableCredits ?? monthly;
            setCreditLimit(monthly);
            setCreditUsed(Math.max(0, monthly - available));
          }
        }

        if (docsRes.ok) {
          const docsJson = await docsRes.json() as {
            documents?: Array<{
              id: string;
              title: string;
              tab: string;
              updatedAt: string;
            }>;
          };
          const docs = docsJson.documents ?? [];
          const recentDocs: RecentItem[] = docs.slice(0, 3).map((d) => ({
            label: d.title,
            meta: `${d.tab} · ${new Date(d.updatedAt).toLocaleString()}`,
          }));
          const projectDocs: ProjectItem[] = docs.slice(0, 6).map((d) => ({
            id: d.id,
            name: d.title,
            updatedAt: new Date(d.updatedAt).toLocaleDateString(),
            status: d.tab,
          }));
          setRecent(recentDocs);
          setProjects(projectDocs);
        }
      } catch {
        // ignore network errors
      }
    };

    fetchData();
  }, [user]);

  const handleSaveChanges = () => {
    router.push("/studio");
  };

  const handleCommitChanges = () => {
    router.push("/studio");
  };

  const handleResetLayout = () => {
    router.push("/studio");
  };

  const handleLogin = async () => {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/")}`;
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
    setUser(null);
    router.push("/");
    router.refresh();
  };

  const userMetadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const identityData =
    (user?.identities?.[0]?.identity_data ?? {}) as Record<string, unknown>;
  const displayName =
    (typeof userMetadata.full_name === "string" && userMetadata.full_name) ||
    (typeof userMetadata.name === "string" && userMetadata.name) ||
    (typeof identityData.full_name === "string" && identityData.full_name) ||
    (typeof identityData.name === "string" && identityData.name) ||
    user?.email ||
    "Profile";
  const displayEmail = user?.email ?? "";
  const avatarUrl =
    (typeof userMetadata.avatar_url === "string" && userMetadata.avatar_url) ||
    (typeof userMetadata.picture === "string" && userMetadata.picture) ||
    (typeof identityData.avatar_url === "string" && identityData.avatar_url) ||
    (typeof identityData.picture === "string" && identityData.picture) ||
    "";
  const avatarFailed = Boolean(avatarUrl) && failedAvatarUrl === avatarUrl;
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";

  return (
    <main
      className="min-h-screen text-white relative"
      style={{
        background:
          "radial-gradient(1200px 600px at 100% -10%, rgba(135, 163, 255, 0.2), transparent 55%), radial-gradient(900px 500px at -10% 120%, rgba(94, 130, 255, 0.18), transparent 55%), #0b1020",
      }}
    >
      <div className="max-w-5xl mx-auto px-6 pt-8 pb-10 space-y-6">
        <div
          ref={profileRef}
          className="absolute right-6 top-6"
          style={{
            position: "absolute",
          }}
        >
          <div style={{ position: "relative" }}>
            {user ? (
              <button
                type="button"
                onClick={() => setIsProfileOpen((prev) => !prev)}
                aria-label="Open profile menu"
                style={{
                  width: 34,
                  height: 34,
                  border: "1px solid var(--border)",
                  background: "var(--floating)",
                  color: "var(--foreground)",
                  borderRadius: "50%",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  overflow: "hidden",
                }}
              >
                {avatarUrl && !avatarFailed ? (
                  <Image
                    src={avatarUrl}
                    alt={displayName}
                    width={34}
                    height={34}
                    unoptimized
                    onError={() => setFailedAvatarUrl(avatarUrl)}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 700 }}>
                    {initials}
                  </span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsLoginOpen((prev) => !prev)}
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--floating)",
                  color: "var(--foreground)",
                  borderRadius: 999,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Sign in
              </button>
            )}

            {isProfileOpen && user && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 8px)",
                  width: 260,
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  background:
                    "color-mix(in srgb, var(--panel) 95%, #0a1018 5%)",
                  boxShadow: "var(--shadow-float)",
                  padding: 10,
                  zIndex: 20,
                }}
              >
                <div
                  style={{
                    padding: "4px 6px 10px 6px",
                    borderBottom: "1px solid var(--border)",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    {displayName}
                  </div>
                  {displayEmail ? (
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {displayEmail}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      Not signed in
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => router.push("/studio")}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "1px solid var(--border)",
                    background: "var(--floating)",
                    color: "var(--foreground)",
                    padding: "8px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                    marginBottom: 8,
                  }}
                >
                  + New Project
                </button>
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: 8,
                    marginBottom: 8,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <button
                    type="button"
                    onClick={handleSaveChanges}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "1px solid var(--border)",
                      background: "var(--floating)",
                      color: "var(--foreground)",
                      padding: "7px 8px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={handleCommitChanges}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "1px solid var(--border)",
                      background:
                        "color-mix(in srgb, var(--primary) 18%, var(--panel) 82%)",
                      color: "var(--foreground)",
                      padding: "7px 8px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Commit Changes
                  </button>
                  <button
                    type="button"
                    onClick={handleResetLayout}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "1px solid var(--border)",
                      background: "var(--floating)",
                      color: "var(--foreground)",
                      padding: "7px 8px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Reset Layout
                  </button>
                </div>

                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    Credit Limit View
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {creditUsed} / {creditLimit} credits used
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      width: "100%",
                      height: 6,
                      background: "var(--background)",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${creditUsedPercent}%`,
                        height: "100%",
                        background: "var(--primary)",
                      }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "1px solid var(--border)",
                    background: "var(--floating)",
                    color: "var(--foreground)",
                    padding: "8px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    marginBottom: 8,
                  }}
                >
                  Log out
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    window.alert("Upgrade flow can be connected here.");
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "1px solid var(--border)",
                    background:
                      "color-mix(in srgb, var(--primary) 22%, var(--panel) 78%)",
                    color: "var(--foreground)",
                    padding: "8px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Buy Pro
                </button>
              </div>
            )}

            {isLoginOpen && !user && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 8px)",
                  width: 260,
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  background:
                    "color-mix(in srgb, var(--panel) 95%, #0a1018 5%)",
                  boxShadow: "var(--shadow-float)",
                  padding: 12,
                  zIndex: 20,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  Sign in
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    marginBottom: 10,
                  }}
                >
                  Continue with Google to access your workspace.
                </div>
                <button
                  onClick={handleLogin}
                  style={{
                    width: "100%",
                    border: "1px solid var(--border)",
                    background: "var(--foreground)",
                    color: "#0a0a0a",
                    borderRadius: 8,
                    padding: "7px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Sign in with Google
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="text-center my-20">
          <span
            style={{
              fontFamily: "var(--font-poetic)",
              fontWeight: 700,
              fontSize: 80,
              letterSpacing: "0.03em",
              lineHeight: 1,
              color: "transparent",
              background:
                "linear-gradient(120deg, #9fb5ff 0%, #7aa2ff 45%, #c9d7ff 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
            }}
          >
            Ermiz Studio
          </span>
        </div>

        {/* Primary command surface */}
        <section className="space-y-3">
          <div className="rounded-xl border border-white/14 bg-black/45 px-3 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.35)] focus-within:border-white/28 transition">
            <div className="flex items-center gap-3">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Payments API with Stripe + webhook retries"
                className="no-focus-ring flex-1 bg-transparent outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-white text-base py-2"
                style={{ border: "none" }}
              />
              <button
                onClick={() =>
                  router.push(`/studio?prompt=${encodeURIComponent(prompt)}`)
                }
                className="flex items-center gap-2 rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:bg-gray-200 transition focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                aria-label="Generate"
              >
                Generate →
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t}
                onClick={() => setPrompt(t)}
                className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[11px] text-gray-200 hover:border-white/25 transition"
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        {/* Recent work (log-like) */}
        <section className="space-y-2 mt-36">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent work</h2>
            <span className="text-xs text-gray-500">Latest generations</span>
          </div>
          <div className="divide-y divide-white/10 border border-white/10 rounded-md bg-black/25">
            {recent.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between px-3 py-2"
              >
                <span className="text-sm">{item.label}</span>
                <span className="text-[11px] text-gray-500">{item.meta}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Projects (compact grid) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Projects</h2>
            <button
              onClick={() => router.push("/studio")}
              className="text-xs text-gray-300 hover:text-white"
            >
              View all →
            </button>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => router.push(`/studio?project=${p.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  e.key === "Enter" && router.push(`/studio?project=${p.id}`)
                }
                className="group cursor-pointer text-left rounded-md border border-white/12 bg-black/35 px-3 py-3 transition hover:-translate-y-1 hover:border-white/28 hover:bg-white/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-medium">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.updatedAt}</p>
                  </div>
                  <span className="text-[11px] text-gray-400 group-hover:text-white">
                    →
                  </span>
                </div>
                <span className="mt-2 inline-block text-[10px] px-2 py-1 rounded-sm border border-white/15 bg-white/10">
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
