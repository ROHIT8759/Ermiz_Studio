"use client";

import React from "react";
import { StudioFooter } from "@/components/studio/StudioFooter";

type StudioLayoutProps = {
  isCompactViewport: boolean;
  statusText: string;
  creditUsedPercent: number;
  saveState: string;
  commitStatus: string;
  children: React.ReactNode;
};

export function StudioLayout({
  isCompactViewport,
  statusText,
  creditUsedPercent,
  saveState,
  commitStatus,
  children,
}: StudioLayoutProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        background: "var(--background)",
        color: "var(--foreground)",
        overflow: "hidden",
      }}
    >
      {children}
      <StudioFooter
        isCompactViewport={isCompactViewport}
        statusText={statusText}
        creditUsedPercent={creditUsedPercent}
        saveState={saveState}
        commitStatus={commitStatus}
      />
    </div>
  );
}
