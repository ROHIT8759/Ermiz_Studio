"use client";

import React from "react";
import Image from "next/image";
import {
  HEADER_MENU_TEXT,
  tabLabel,
  WorkspaceTab,
} from "@/components/studio/config";

export type StudioUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  identities?: Array<{ identity_data?: Record<string, unknown> | null }> | null;
};

type HeaderAction = {
  id: "save" | "gen" | "commit" | "reset";
  label: string;
  onClick: () => void;
  title?: string;
  highlighted?: boolean;
};

type HeaderTabsProps = {
  activeTab: WorkspaceTab;
  isCompactViewport: boolean;
  setActiveTab: (tab: WorkspaceTab) => void;
};

function HeaderTabs({
  activeTab,
  isCompactViewport,
  setActiveTab,
}: HeaderTabsProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: isCompactViewport ? 8 : 14,
        minWidth: 0,
        flex: 1,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-poetic)",
          fontWeight: 700,
          fontSize: isCompactViewport ? 20 : 26,
          letterSpacing: "0.025em",
          lineHeight: 1,
          color: "color-mix(in srgb, var(--foreground) 94%, #ffffff 6%)",
          whiteSpace: "nowrap",
        }}
      >
        Ermiz Studio
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginLeft: isCompactViewport ? 0 : 80,
          borderRadius: 12,
          padding: 4,
          overflowX: "auto",
          minWidth: 0,
        }}
      >
        {(Object.keys(tabLabel) as WorkspaceTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              border: "none",
              borderRadius: 9,
              padding: "7px 11px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              background:
                activeTab === tab
                  ? "color-mix(in srgb, var(--panel) 85%, #111826 15%)"
                  : "transparent",
              color: activeTab === tab ? "var(--foreground)" : "var(--muted)",
              boxShadow:
                activeTab === tab ? "inset 0 0 0 1px var(--border)" : "none",
            }}
          >
            {tabLabel[tab]}
          </button>
        ))}
      </div>
    </div>
  );
}

type HeaderActionButtonsProps = {
  actions: HeaderAction[];
  variant: "desktop" | "menu";
};

function HeaderActionButtons({ actions, variant }: HeaderActionButtonsProps) {
  return actions.map((action) => (
    <button
      key={action.id}
      type="button"
      onClick={action.onClick}
      title={action.title}
      style={
        variant === "desktop"
          ? {
              border: "1px solid var(--border)",
              background: action.highlighted
                ? "color-mix(in srgb, var(--primary) 20%, var(--panel) 80%)"
                : "var(--floating)",
              color: "var(--foreground)",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }
          : {
              width: "100%",
              textAlign: "left",
              border: "1px solid var(--border)",
              background: action.highlighted
                ? "color-mix(in srgb, var(--primary) 18%, var(--panel) 82%)"
                : "var(--floating)",
              color: "var(--foreground)",
              padding: "7px 8px",
              fontSize: 12,
              cursor: "pointer",
            }
      }
    >
      {action.label}
    </button>
  ));
}

type ProfileButtonProps = {
  avatarUrl: string;
  avatarFailed: boolean;
  displayName: string;
  initials: string;
  isProfileOpen: boolean;
  setIsProfileOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setAvatarFailed: React.Dispatch<React.SetStateAction<boolean>>;
};

function ProfileButton({
  avatarUrl,
  avatarFailed,
  displayName,
  initials,
  isProfileOpen,
  setIsProfileOpen,
  setAvatarFailed,
}: ProfileButtonProps) {
  return (
    <button
      type="button"
      onClick={() => setIsProfileOpen((prev) => !prev)}
      aria-label="Open profile menu"
      aria-haspopup="menu"
      aria-expanded={isProfileOpen}
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
          onError={() => setAvatarFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span style={{ fontSize: 12, fontWeight: 700 }}>{initials}</span>
      )}
    </button>
  );
}

type ProfileMenuProps = {
  displayName: string;
  displayEmail: string;
  creditUsed: number;
  creditLimit: number;
  creditUsedPercent: number;
  headerActions: HeaderAction[];
  handleNewProject: () => void;
  handleLogout: () => void;
  handleBuyPro: () => void;
};

function ProfileMenu({
  displayName,
  displayEmail,
  creditUsed,
  creditLimit,
  creditUsedPercent,
  headerActions,
  handleNewProject,
  handleLogout,
  handleBuyPro,
}: ProfileMenuProps) {
  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        top: "calc(100% + 8px)",
        width: 260,
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "color-mix(in srgb, var(--panel) 95%, #0a1018 5%)",
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
        <div style={{ fontSize: 12, fontWeight: 600 }}>{displayName}</div>
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
        onClick={handleNewProject}
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
        {HEADER_MENU_TEXT.newProject}
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
        <HeaderActionButtons actions={headerActions} variant="menu" />
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
        {HEADER_MENU_TEXT.logout}
      </button>

      <button
        type="button"
        onClick={handleBuyPro}
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
        {HEADER_MENU_TEXT.buyPro}
      </button>
    </div>
  );
}

type LoginMenuProps = {
  handleLogin: () => void;
};

function LoginMenu({ handleLogin }: LoginMenuProps) {
  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        top: "calc(100% + 8px)",
        width: 260,
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "color-mix(in srgb, var(--panel) 95%, #0a1018 5%)",
        boxShadow: "var(--shadow-float)",
        padding: 12,
        zIndex: 20,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
        {HEADER_MENU_TEXT.signIn}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--muted)",
          marginBottom: 10,
        }}
      >
        {HEADER_MENU_TEXT.loginHint}
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
        {HEADER_MENU_TEXT.signInWithGoogle}
      </button>
    </div>
  );
}

type StudioHeaderProps = {
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;
  isCompactViewport: boolean;
  profileRef: React.RefObject<HTMLDivElement | null>;
  user: StudioUser | null;
  isProfileOpen: boolean;
  setIsProfileOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isLoginOpen: boolean;
  setIsLoginOpen: React.Dispatch<React.SetStateAction<boolean>>;
  avatarFailed: boolean;
  setAvatarFailed: React.Dispatch<React.SetStateAction<boolean>>;
  creditUsed: number;
  creditLimit: number;
  creditUsedPercent: number;
  handleGenerateCode: () => void;
  handleSaveChanges: () => void;
  handleCommitChanges: () => void;
  handleResetLayout: () => void;
  handleLogout: () => void;
  handleLogin: () => void;
  handleNewProject: () => void;
  handleBuyPro: () => void;
};

export function StudioHeader({
  activeTab,
  setActiveTab,
  isCompactViewport,
  profileRef,
  user,
  isProfileOpen,
  setIsProfileOpen,
  isLoginOpen,
  setIsLoginOpen,
  avatarFailed,
  setAvatarFailed,
  creditUsed,
  creditLimit,
  creditUsedPercent,
  handleGenerateCode,
  handleSaveChanges,
  handleCommitChanges,
  handleResetLayout,
  handleLogout,
  handleLogin,
  handleNewProject,
  handleBuyPro,
}: StudioHeaderProps) {
  const userMetadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const identityData = (user?.identities?.[0]?.identity_data ?? {}) as Record<
    string,
    unknown
  >;
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
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";

  const headerActions: HeaderAction[] = [
    {
      id: "gen",
      label: HEADER_MENU_TEXT.genCode,
      onClick: handleGenerateCode,
    },

    {
      id: "save",
      label: HEADER_MENU_TEXT.saveChanges,
      onClick: handleSaveChanges,
    },
    {
      id: "commit",
      label: HEADER_MENU_TEXT.commit,
      onClick: handleCommitChanges,
      highlighted: true,
    },
    {
      id: "reset",
      label: HEADER_MENU_TEXT.resetLayout,
      onClick: handleResetLayout,
      title: "Reset panel layout (Ctrl/Cmd+0)",
    },
  ];

  return (
    <header
      style={{
        display: "flex",
        minHeight: 48,
        alignItems: isCompactViewport ? "stretch" : "center",
        justifyContent: "space-between",
        flexWrap: isCompactViewport ? "wrap" : "nowrap",
        borderBottom: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--panel) 94%, #0c111a 6%)",
        padding: isCompactViewport ? "8px 10px" : "0 18px",
        flexShrink: 0,
        gap: isCompactViewport ? 8 : 12,
      }}
    >
      <HeaderTabs
        activeTab={activeTab}
        isCompactViewport={isCompactViewport}
        setActiveTab={setActiveTab}
      />
      <div
        ref={profileRef}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: isCompactViewport ? 6 : 10,
          marginLeft: isCompactViewport ? "auto" : 0,
        }}
      >
        {!isCompactViewport && (
          <HeaderActionButtons actions={headerActions} variant="desktop" />
        )}
        {user ? (
          <ProfileButton
            avatarUrl={avatarUrl}
            avatarFailed={avatarFailed}
            displayName={displayName}
            initials={initials}
            isProfileOpen={isProfileOpen}
            setIsProfileOpen={setIsProfileOpen}
            setAvatarFailed={setAvatarFailed}
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsLoginOpen((prev) => !prev)}
            aria-haspopup="dialog"
            aria-expanded={isLoginOpen}
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
            {HEADER_MENU_TEXT.signIn}
          </button>
        )}

        {isProfileOpen && user && (
          <ProfileMenu
            displayName={displayName}
            displayEmail={displayEmail}
            creditUsed={creditUsed}
            creditLimit={creditLimit}
            creditUsedPercent={creditUsedPercent}
            headerActions={[
              ...headerActions.slice(0, 1),
              { ...headerActions[1], label: HEADER_MENU_TEXT.commitChanges },
              ...headerActions.slice(2),
            ]}
            handleNewProject={handleNewProject}
            handleLogout={handleLogout}
            handleBuyPro={handleBuyPro}
          />
        )}

        {isLoginOpen && !user && <LoginMenu handleLogin={handleLogin} />}
      </div>
    </header>
  );
}
