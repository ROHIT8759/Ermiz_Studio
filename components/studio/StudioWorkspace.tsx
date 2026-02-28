"use client";

import React from "react";
import { AgentWorkspace } from "@/components/studio/AgentWorkspace";
import { DeployWorkspace } from "@/components/studio/DeployWorkspace";
import { WorkspaceCanvas } from "@/components/studio/WorkspaceCanvas";
import {
  WorkspaceTab,
  apiSections,
  databaseSections,
  functionSections,
  infraSections,
} from "@/components/studio/config";

type StudioWorkspaceProps = {
  activeTab: WorkspaceTab;
  resetLayoutSignal: number;
};

export function StudioWorkspace({ activeTab, resetLayoutSignal }: StudioWorkspaceProps) {
  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, height: "100%", overflow: "hidden" }}>
      {activeTab === "agent" ? (
        <AgentWorkspace />
      ) : activeTab === "deploy" ? (
        <DeployWorkspace />
      ) : (
        <WorkspaceCanvas
          key={`workspace-${activeTab}-${resetLayoutSignal}`}
          sections={
            activeTab === "api"
              ? apiSections
              : activeTab === "infra"
                ? infraSections
                : activeTab === "database"
                  ? databaseSections
                  : functionSections
          }
          flatList={activeTab === "api"}
          showSearch={activeTab === "api"}
          isDatabaseWorkspace={activeTab === "database"}
        />
      )}
    </div>
  );
}
