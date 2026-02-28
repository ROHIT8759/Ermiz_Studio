"use client";

import React, { useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { useShallow } from "zustand/react/shallow";
import {
  NodeData,
  ProcessDefinition,
  DatabaseBlock,
  DatabaseEnvironmentsSchema,
  DatabaseRelationshipSchema,
  DatabaseSchemaHistoryEntry,
  DatabaseSchemaHistoryEntrySchema,
  DatabaseSeedSchema,
  DatabaseTableSchema,
  DatabaseTable,
  DatabaseTableField,
  QueueBlock,
  ServiceBoundaryBlock,
  InfraBlock,
  InfraResourceType,
  ApiBinding,
  InputField,
  OutputField,
} from "@/lib/schema/node";
import { analyzeDBConnections } from "@/lib/schema/graph";
import { TypeSchemaEditor } from "./TypeSchemaEditor";
import { QueryEditor } from "./QueryEditor";
import {
  databaseTemplates,
  getDatabaseTemplateById,
} from "@/lib/templates/database-templates";
import {
  buildDatabaseExportPayload,
  buildDatabaseSchemaDDL,
} from "@/lib/database/schema-tools";
import { DatabaseERDViewer } from "./DatabaseERDViewer";
import { DataSeedingSection } from "./database/DataSeedingSection";
import { EnvironmentsSection } from "./database/EnvironmentsSection";
import { PerformanceSection } from "./database/PerformanceSection";
import { BackupSection } from "./database/BackupSection";
import { SecuritySection } from "./database/SecuritySection";
import { MonitoringSection } from "./database/MonitoringSection";
import { ConnectedProcessesSection } from "./database/ConnectedProcessesSection";
import { MigrationsSection } from "./database/MigrationsSection";
import { ChangeHistorySection } from "./database/ChangeHistorySection";
import { HealthCheckSection } from "./database/HealthCheckSection";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--background)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 12,
  color: "var(--foreground)",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--muted)",
  textTransform: "uppercase",
  marginBottom: 4,
};

const sectionStyle: React.CSSProperties = {
  borderTop: "1px solid var(--border)",
  paddingTop: 12,
  marginTop: 8,
};

const CODE_SNIPPETS: { label: string; title: string; code: string }[] = [
  {
    label: "fetch",
    title: "Async HTTP fetch with error handling",
    code: `const response = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
const data = await response.json();`,
  },
  {
    label: "try/catch",
    title: "Try/catch returning a structured error",
    code: `try {
  // your code
} catch (err) {
  const message = err instanceof Error ? err.message : "Unknown error";
  return { success: false, error: message };
}`,
  },
  {
    label: "return ok",
    title: "Return a success result",
    code: `return { success: true, data: result };`,
  },
  {
    label: "return err",
    title: "Return an error result",
    code: `return { success: false, error: "Something went wrong" };`,
  },
  {
    label: "validate",
    title: "Zod schema validation with early return",
    code: `const schema = z.object({
  field: z.string().min(1),
});
const parsed = schema.safeParse(inputs);
if (!parsed.success) return { success: false, error: parsed.error.format() };
const { field } = parsed.data;`,
  },
  {
    label: "env var",
    title: "Read an environment variable",
    code: `const value = process.env.MY_ENV_VAR ?? "";`,
  },
  {
    label: "log",
    title: "Debug log with JSON formatting",
    code: `console.log(JSON.stringify({ tag: "debug", data: inputs }, null, 2));`,
  },
  {
    label: "map array",
    title: "Transform an array with map",
    code: `const result = items.map((item) => ({
  ...item,
  // transformed fields
}));`,
  },
];

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const buildSchemaHistoryEntries = (
  previousTables: DatabaseTable[],
  nextTables: DatabaseTable[],
  timestamp: string,
): DatabaseSchemaHistoryEntry[] => {
  const entries: DatabaseSchemaHistoryEntry[] = [];
  const previousMap = new Map(previousTables.map((table, index) => [table.id || `${table.name}_${index}`, table]));
  const nextMap = new Map(nextTables.map((table, index) => [table.id || `${table.name}_${index}`, table]));

  nextMap.forEach((table, key) => {
    if (!previousMap.has(key)) {
      entries.push({
        timestamp,
        changeType: "table_added",
        target: table.name,
        details: { before: undefined, after: table },
      });
    }
  });

  previousMap.forEach((table, key) => {
    if (!nextMap.has(key)) {
      entries.push({
        timestamp,
        changeType: "table_removed",
        target: table.name,
        details: { before: table, after: undefined },
      });
    }
  });

  previousMap.forEach((previousTable, key) => {
    const nextTable = nextMap.get(key);
    if (!nextTable) return;

    const previousFieldMap = new Map(
      (previousTable.fields || []).map((field, index) => [field.id || `${field.name}_${index}`, field]),
    );
    const nextFieldMap = new Map(
      (nextTable.fields || []).map((field, index) => [field.id || `${field.name}_${index}`, field]),
    );

    nextFieldMap.forEach((field, fieldKey) => {
      if (!previousFieldMap.has(fieldKey)) {
        entries.push({
          timestamp,
          changeType: "field_added",
          target: `${nextTable.name}.${field.name}`,
          details: { before: undefined, after: field },
        });
      }
    });

    previousFieldMap.forEach((field, fieldKey) => {
      if (!nextFieldMap.has(fieldKey)) {
        entries.push({
          timestamp,
          changeType: "field_removed",
          target: `${previousTable.name}.${field.name}`,
          details: { before: field, after: undefined },
        });
      }
    });

    previousFieldMap.forEach((previousField, fieldKey) => {
      const nextField = nextFieldMap.get(fieldKey);
      if (!nextField) return;
      if (stableStringify(previousField) === stableStringify(nextField)) return;
      entries.push({
        timestamp,
        changeType: "field_modified",
        target: `${nextTable.name}.${nextField.name}`,
        details: {
          before: previousField,
          after: nextField,
        },
      });
    });
  });

  return entries;
};

const infraFieldSets: Record<
  InfraResourceType,
  {
    title: string;
    fields: Array<{
      key: string;
      label: string;
      type: "text" | "number" | "boolean" | "select";
      placeholder?: string;
      options?: string[];
    }>;
  }
> = {
  ec2: {
    title: "EC2 Configuration",
    fields: [
      { key: "instanceType", label: "Instance type", type: "text" },
      { key: "ami", label: "AMI", type: "text" },
      { key: "count", label: "Instance count", type: "number" },
      { key: "subnetIds", label: "Subnet IDs", type: "text" },
      { key: "securityGroups", label: "Security groups", type: "text" },
      { key: "diskGb", label: "Root disk (GB)", type: "number" },
      { key: "autoscalingMin", label: "Autoscaling min", type: "number" },
      { key: "autoscalingMax", label: "Autoscaling max", type: "number" },
    ],
  },
  lambda: {
    title: "Lambda Configuration",
    fields: [
      { key: "runtime", label: "Runtime", type: "text" },
      { key: "memoryMb", label: "Memory (MB)", type: "number" },
      { key: "timeoutSec", label: "Timeout (sec)", type: "number" },
      { key: "handler", label: "Handler", type: "text" },
      { key: "source", label: "Source", type: "text" },
      { key: "trigger", label: "Trigger", type: "text" },
      { key: "environmentVars", label: "Environment vars", type: "text" },
    ],
  },
  eks: {
    title: "EKS Configuration",
    fields: [
      { key: "version", label: "K8s version", type: "text" },
      { key: "nodeType", label: "Node type", type: "text" },
      { key: "nodeCount", label: "Node count", type: "number" },
      { key: "minNodes", label: "Min nodes", type: "number" },
      { key: "maxNodes", label: "Max nodes", type: "number" },
      { key: "vpcId", label: "VPC ID", type: "text" },
      { key: "privateSubnets", label: "Private subnets", type: "text" },
      { key: "clusterLogs", label: "Cluster logs", type: "text" },
    ],
  },
  vpc: {
    title: "VPC Configuration",
    fields: [
      { key: "cidr", label: "CIDR block", type: "text" },
      { key: "publicSubnets", label: "Public subnets", type: "text" },
      { key: "privateSubnets", label: "Private subnets", type: "text" },
      { key: "natGateways", label: "NAT gateways", type: "number" },
      { key: "flowLogs", label: "Enable flow logs", type: "boolean" },
    ],
  },
  s3: {
    title: "S3 Configuration",
    fields: [
      { key: "bucketName", label: "Bucket name", type: "text" },
      { key: "versioning", label: "Versioning", type: "boolean" },
      { key: "encryption", label: "Encryption", type: "text" },
      { key: "lifecycle", label: "Lifecycle policy", type: "text" },
      { key: "publicAccess", label: "Public access", type: "text" },
    ],
  },
  rds: {
    title: "RDS Configuration",
    fields: [
      { key: "engine", label: "Engine", type: "text" },
      { key: "engineVersion", label: "Engine version", type: "text" },
      { key: "instanceClass", label: "Instance class", type: "text" },
      { key: "storageGb", label: "Storage (GB)", type: "number" },
      { key: "multiAz", label: "Multi-AZ", type: "boolean" },
      { key: "backupRetentionDays", label: "Backup retention (days)", type: "number" },
      { key: "subnetGroup", label: "Subnet group", type: "text" },
    ],
  },
  load_balancer: {
    title: "Load Balancer Configuration",
    fields: [
      {
        key: "lbType",
        label: "Type",
        type: "select",
        options: ["ALB", "NLB", "GLB"],
      },
      {
        key: "scheme",
        label: "Scheme",
        type: "select",
        options: ["internet-facing", "internal"],
      },
      { key: "listeners", label: "Listeners", type: "text" },
      { key: "targetGroup", label: "Target group", type: "text" },
      { key: "healthCheckPath", label: "Health check path", type: "text" },
      { key: "tlsCertArn", label: "TLS cert ARN", type: "text" },
    ],
  },
  hpc: {
    title: "HPC Configuration",
    fields: [
      { key: "scheduler", label: "Scheduler", type: "text" },
      { key: "instanceType", label: "Instance type", type: "text" },
      { key: "nodeCount", label: "Node count", type: "number" },
      { key: "maxNodes", label: "Max nodes", type: "number" },
      { key: "sharedStorage", label: "Shared storage", type: "text" },
      { key: "queue", label: "Queue", type: "text" },
    ],
  },
};

export function PropertyInspector({ width = 320 }: { width?: number }) {
  const {
    nodes,
    edges,
    activeTab,
    graphs,
    updateNodeData,
    deleteNode,
    addInput,
    removeInput,
    updateInput,
    addOutput,
    removeOutput,
  } = useStore(
    useShallow((state) => ({
      nodes: state.nodes,
      edges: state.edges,
      activeTab: state.activeTab,
      graphs: state.graphs,
      updateNodeData: state.updateNodeData,
      deleteNode: state.deleteNode,
      addInput: state.addInput,
      removeInput: state.removeInput,
      updateInput: state.updateInput,
      addOutput: state.addOutput,
      removeOutput: state.removeOutput,
    })),
  );

  const [newInputName, setNewInputName] = useState("");
  const [newOutputName, setNewOutputName] = useState("");
  const [expandedTables, setExpandedTables] = useState<Record<number, boolean>>(
    {},
  );
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [isSchemaDesignerExpanded, setIsSchemaDesignerExpanded] = useState(true);
  const [showERD, setShowERD] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    databaseTemplates[0]?.id || "",
  );
  const [schemaToastMessage, setSchemaToastMessage] = useState("");
  const [schemaToastType, setSchemaToastType] = useState<"success" | "error">(
    "success",
  );
  const schemaImportInputRef = useRef<HTMLInputElement | null>(null);
  const [requestTab, setRequestTab] = useState<"body" | "headers" | "query">(
    "body",
  );
  const [newDepName, setNewDepName] = useState("");
  const [logicCopied, setLogicCopied] = useState(false);
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [wrapLines, setWrapLines] = useState(false);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [newErrorOutputName, setNewErrorOutputName] = useState("");
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [editorFontSize, setEditorFontSize] = useState(12);

  const selectedNode = nodes.find((n) => n.selected);

  const panelStyle: React.CSSProperties = {
    width,
    height: "100%",
    minHeight: 0,
    flexShrink: 0,
    borderLeft: "1px solid var(--border)",
    background: "var(--panel)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    overflowX: "hidden",
    scrollbarGutter: "stable",
  };

  if (!selectedNode) {
    return (
      <aside className="sidebar-scroll" style={panelStyle}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--muted)",
            textTransform: "uppercase",
          }}
        >
          Properties
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--muted)",
            textAlign: "center",
            marginTop: 32,
          }}
        >
          Select a node to edit its properties
        </div>
      </aside>
    );
  }

  const nodeData = selectedNode.data as NodeData;
  const kind = nodeData.kind;
  const apiNode = kind === "api_binding" ? (nodeData as ApiBinding) : null;
  const apiProtocol =
    apiNode?.protocol ?? (apiNode?.apiType === "asyncapi" ? "ws" : "rest");
  const isRestProtocol = apiProtocol === "rest";
  const isWsProtocol = apiProtocol === "ws";
  const isSocketIOProtocol = apiProtocol === "socket.io";
  const isWebRtcProtocol = apiProtocol === "webrtc";
  const isGraphqlProtocol = apiProtocol === "graphql";
  const isGrpcProtocol = apiProtocol === "grpc";
  const isSseProtocol = apiProtocol === "sse";
  const isWebhookProtocol = apiProtocol === "webhook";
  const functionDefinitions = (graphs.functions?.nodes || [])
    .map((node) => node.data as NodeData)
    .filter((data): data is ProcessDefinition => data.kind === "process")
    .map((process) => ({
      id: process.id,
      label: process.label || process.id,
    }));
  const importedFunctionIds =
    kind === "process" && activeTab === "api"
      ? (nodeData as ProcessDefinition).steps
        .filter((step) => step.kind === "ref" && Boolean(step.ref))
        .map((step) => step.ref as string)
      : [];
  const allApiIds = Object.values(graphs)
    .flatMap((graph) => graph.nodes || [])
    .map((node) => node.data as NodeData)
    .filter((data): data is ApiBinding => data.kind === "api_binding")
    .map((api) => ({ id: api.id, label: api.label || api.id }));
  const allFunctionIds = Object.values(graphs)
    .flatMap((graph) => graph.nodes || [])
    .map((node) => node.data as NodeData)
    .filter((data): data is ProcessDefinition => data.kind === "process")
    .map((fn) => ({ id: fn.id, label: fn.label || fn.id }));
  const allDataIds = Object.values(graphs)
    .flatMap((graph) => graph.nodes || [])
    .map((node) => node.data as NodeData)
    .filter((data): data is DatabaseBlock => data.kind === "database")
    .map((db) => ({ id: db.id, label: db.label || db.id }));
  const computeInfraIds = Object.values(graphs)
    .flatMap((graph) => graph.nodes || [])
    .map((node) => node.data as NodeData)
    .filter(
      (data): data is InfraBlock =>
        data.kind === "infra" &&
        ["ec2", "lambda", "eks", "hpc"].includes(data.resourceType),
    )
    .map((infra) => ({ id: infra.id, label: infra.label || infra.id }));

  const handleUpdate = (updates: Partial<NodeData>) => {
    updateNodeData(selectedNode.id, updates);
  };

  const databaseNodeData =
    kind === "database" ? (nodeData as DatabaseBlock) : null;
  const dbConnectionSummary =
    kind === "database"
      ? analyzeDBConnections({
        nodes: nodes as Array<{
          id: string;
          type?: string;
          data?: Record<string, unknown>;
        }>,
        edges: edges as Array<{ source: string; target: string }>,
      })[selectedNode.id] || null
      : null;

  const updateDatabaseTables = (
    tables: DatabaseTable[],
    extraUpdates: Partial<DatabaseBlock> = {},
  ) => {
    if (!databaseNodeData) return;
    const previousTables = databaseNodeData.tables || [];
    const now = new Date().toISOString();
    const changeEntries = buildSchemaHistoryEntries(previousTables, tables, now);
    const baseHistory = extraUpdates.schemaHistory || databaseNodeData.schemaHistory || [];
    handleUpdate({
      ...extraUpdates,
      tables,
      schemas: tables.map((table) => table.name).filter(Boolean),
      schemaHistory: [...baseHistory, ...changeEntries],
    } as Partial<DatabaseBlock>);
  };

  const addTable = () => {
    if (!databaseNodeData) return;
    const tables = databaseNodeData.tables || [];
    updateDatabaseTables([
      ...tables,
      {
        name: `table_${tables.length + 1}`,
        fields: [],
        indexes: [],
      },
    ]);
  };

  const loadDatabaseTemplate = () => {
    if (!databaseNodeData) return;
    const template = getDatabaseTemplateById(selectedTemplateId);
    if (!template) return;

    const stamp = `${selectedTemplateId}_template`;
    const tableIdMap = new Map<string, string>();
    const fieldIdMap = new Map<string, string>();

    const clonedTables = template.tables.map((table) => {
      const nextTableId = `${table.id || table.name}_${stamp}`;
      if (table.id) {
        tableIdMap.set(table.id, nextTableId);
      }
      const fields = (table.fields || []).map((field) => {
        const nextFieldId = `${field.id || `${table.name}_${field.name}`}_${stamp}`;
        if (field.id) {
          fieldIdMap.set(field.id, nextFieldId);
        }
        return {
          ...field,
          id: nextFieldId,
        };
      });
      return {
        ...table,
        id: nextTableId,
        fields,
      };
    });

    const clonedRelationships = (template.relationships || []).map((relationship) => ({
      ...relationship,
      id: `${relationship.id}_${stamp}`,
      fromTableId: tableIdMap.get(relationship.fromTableId) || relationship.fromTableId,
      toTableId: tableIdMap.get(relationship.toTableId) || relationship.toTableId,
      fromFieldId: relationship.fromFieldId
        ? fieldIdMap.get(relationship.fromFieldId) || relationship.fromFieldId
        : undefined,
      toFieldId: relationship.toFieldId
        ? fieldIdMap.get(relationship.toFieldId) || relationship.toFieldId
        : undefined,
    }));

    updateDatabaseTables(clonedTables, {
      relationships: clonedRelationships,
      loadedTemplate: template.label,
    } as Partial<DatabaseBlock>);
    setIsTemplatePickerOpen(false);
  };


  const showSchemaToast = (message: string, type: "success" | "error") => {
    setSchemaToastMessage(message);
    setSchemaToastType(type);
    if (typeof window !== "undefined") {
      window.setTimeout(() => setSchemaToastMessage(""), 2200);
    }
  };

  const triggerSchemaExport = () => {
    if (!databaseNodeData || typeof window === "undefined") return;
    const payload = buildDatabaseExportPayload(databaseNodeData);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${databaseNodeData.label || "database"}-schema.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showSchemaToast("Schema exported.", "success");
  };

  const triggerDDLExport = () => {
    if (!databaseNodeData || typeof window === "undefined") return;
    const ddl = buildDatabaseSchemaDDL(databaseNodeData);

    const blob = new Blob([ddl.output], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${databaseNodeData.label || "database"}-${ddl.extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
    showSchemaToast("Schema exported as DDL.", "success");
  };

  const handleSchemaImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = String(reader.result || "");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const tablesCandidate = parsed.tables;
        const relationshipsCandidate = parsed.relationships;
        const seedsCandidate = parsed.seeds;
        const environmentsCandidate = parsed.environments;
        const schemaHistoryCandidate = parsed.schemaHistory;
        const defaultEnvironmentsCandidate = {
          dev: {
            connectionString: "",
            provider: {
              region: "",
            },
            performanceTier: "small",
            overrides: { enabled: false },
          },
          staging: {
            connectionString: "",
            provider: {
              region: "",
            },
            performanceTier: "medium",
            overrides: { enabled: false },
          },
          production: {
            connectionString: "",
            provider: {
              region: "",
            },
            performanceTier: "large",
            overrides: { enabled: false },
          },
        };
        const normalizeEnvironmentCandidate = (
          envRaw: unknown,
          fallback: (typeof defaultEnvironmentsCandidate)["dev"],
        ) => {
          const envRecord = (envRaw || {}) as Record<string, unknown>;
          const provider = (envRecord.provider || {}) as Record<string, unknown>;
          return {
            connectionString:
              typeof envRecord.connectionString === "string"
                ? envRecord.connectionString
                : fallback.connectionString,
            provider: {
              region:
                typeof provider.region === "string"
                  ? provider.region
                  : typeof envRecord.region === "string"
                    ? envRecord.region
                    : fallback.provider.region,
            },
            performanceTier:
              envRecord.performanceTier === "small" ||
                envRecord.performanceTier === "medium" ||
                envRecord.performanceTier === "large"
                ? envRecord.performanceTier
                : fallback.performanceTier,
            overrides:
              typeof envRecord.overrides === "object" && envRecord.overrides
                ? envRecord.overrides
                : fallback.overrides,
          };
        };
        const normalizedEnvironmentsCandidate = {
          dev: normalizeEnvironmentCandidate(
            (environmentsCandidate as Record<string, unknown> | undefined)?.dev,
            defaultEnvironmentsCandidate.dev,
          ),
          staging: normalizeEnvironmentCandidate(
            (environmentsCandidate as Record<string, unknown> | undefined)
              ?.staging,
            defaultEnvironmentsCandidate.staging,
          ),
          production: normalizeEnvironmentCandidate(
            (environmentsCandidate as Record<string, unknown> | undefined)
              ?.production,
            defaultEnvironmentsCandidate.production,
          ),
        };
        const tableValidation = DatabaseTableSchema.array().safeParse(
          tablesCandidate,
        );
        if (!tableValidation.success) {
          showSchemaToast("Invalid schema: tables validation failed.", "error");
          return;
        }
        const relationshipValidation = DatabaseRelationshipSchema.array().safeParse(
          relationshipsCandidate || [],
        );
        if (!relationshipValidation.success) {
          showSchemaToast(
            "Invalid schema: relationships validation failed.",
            "error",
          );
          return;
        }
        const seedValidation = DatabaseSeedSchema.array().safeParse(
          seedsCandidate || [],
        );
        if (!seedValidation.success) {
          showSchemaToast("Invalid schema: seeds validation failed.", "error");
          return;
        }
        const environmentValidation = DatabaseEnvironmentsSchema.safeParse(
          normalizedEnvironmentsCandidate,
        );
        if (!environmentValidation.success) {
          showSchemaToast("Invalid schema: environments validation failed.", "error");
          return;
        }
        const schemaHistoryValidation = DatabaseSchemaHistoryEntrySchema.array().safeParse(
          schemaHistoryCandidate || [],
        );
        if (!schemaHistoryValidation.success) {
          showSchemaToast("Invalid schema: schema history validation failed.", "error");
          return;
        }
        updateDatabaseTables(tableValidation.data, {
          relationships: relationshipValidation.data,
          seeds: seedValidation.data,
          environments: environmentValidation.data,
          schemaHistory: schemaHistoryValidation.data,
        } as Partial<DatabaseBlock>);
        showSchemaToast("Schema imported.", "success");
      } catch {
        showSchemaToast("Invalid JSON file.", "error");
      }
    };
    reader.readAsText(file);
  };

  // Computed values for the Function Logic editor
  const processNodeForLogic = kind === "process" ? (nodeData as ProcessDefinition) : null;
  const funcInputNames =
    processNodeForLogic?.inputs?.map((i) => i.name).filter(Boolean) ?? [];
  const funcDefaultTemplate =
    funcInputNames.length > 0
      ? `async function ${processNodeForLogic?.id}({ ${funcInputNames.join(", ")} }: Record<string, unknown>) {\n  // TODO: implement logic\n  return {};\n}`
      : `async function ${processNodeForLogic?.id}(inputs: Record<string, unknown>) {\n  // TODO: implement logic\n  return {};\n}`;
  const funcLogicValue = processNodeForLogic?.logic ?? funcDefaultTemplate;
  const funcLineCount = funcLogicValue.split("\n").length;

  const insertSnippet = (code: string) => {
    const ta = editorTextareaRef.current;
    if (!ta) {
      handleUpdate({ logic: funcLogicValue + "\n" + code } as Partial<ProcessDefinition>);
      return;
    }
    const { selectionStart, selectionEnd } = ta;
    const next =
      funcLogicValue.slice(0, selectionStart) + code + funcLogicValue.slice(selectionEnd);
    handleUpdate({ logic: next } as Partial<ProcessDefinition>);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = selectionStart + code.length;
    });
  };

  return (
    <aside className="sidebar-scroll" style={panelStyle}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--muted)",
            textTransform: "uppercase",
          }}
        >
          {kind} Properties
        </div>
      </div>

      {/* Common: Label */}
      <div>
        <div style={labelStyle}>Label</div>
        <input
          type="text"
          value={nodeData.label || ""}
          onChange={(e) =>
            handleUpdate({ label: e.target.value } as Partial<NodeData>)
          }
          style={inputStyle}
        />
      </div>

      {/* Common: Description */}
      <div>
        <div style={labelStyle}>Description</div>
        <textarea
          value={nodeData.description || ""}
          onChange={(e) =>
            handleUpdate({ description: e.target.value } as Partial<NodeData>)
          }
          style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
        />
      </div>

      {/* Process-specific fields */}
      {kind === "process" && (
        <>
          <div style={sectionStyle}>
            <div style={labelStyle}>Process Type</div>
            <input
              type="text"
              value="Function Block"
              disabled
              style={{ ...inputStyle, opacity: 0.85, cursor: "not-allowed" }}
            />
          </div>

          <div>
            <div style={labelStyle}>Execution</div>
            <select
              value={(nodeData as ProcessDefinition).execution}
              onChange={(e) =>
                handleUpdate({
                  execution: e.target.value,
                } as Partial<ProcessDefinition>)
              }
              style={selectStyle}
            >
              <option value="sync">Sync</option>
              <option value="async">Async</option>
              <option value="scheduled">Scheduled</option>
              <option value="event_driven">Event Driven</option>
            </select>
          </div>

          {/* Scheduled: cron expression */}
          {(nodeData as ProcessDefinition).execution === "scheduled" && (
            <div>
              <div style={labelStyle}>Cron Schedule</div>
              <input
                type="text"
                value={(nodeData as ProcessDefinition).schedule ?? ""}
                onChange={(e) =>
                  handleUpdate({ schedule: e.target.value } as Partial<ProcessDefinition>)
                }
                placeholder="0 * * * *"
                style={{ ...inputStyle, fontFamily: "monospace" }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {[
                  { label: "Every min", value: "* * * * *" },
                  { label: "Hourly", value: "0 * * * *" },
                  { label: "Daily", value: "0 0 * * *" },
                  { label: "Weekly", value: "0 0 * * 0" },
                  { label: "Monthly", value: "0 0 1 * *" },
                ].map((preset) => {
                  const isActive = (nodeData as ProcessDefinition).schedule === preset.value;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        handleUpdate({ schedule: preset.value } as Partial<ProcessDefinition>)
                      }
                      style={{
                        border: "1px solid var(--border)",
                        background: isActive
                          ? "color-mix(in srgb, var(--primary) 18%, var(--floating) 82%)"
                          : "var(--floating)",
                        color: isActive ? "var(--primary)" : "var(--muted)",
                        borderRadius: 5,
                        padding: "3px 7px",
                        fontSize: 10,
                        cursor: "pointer",
                        fontFamily: "monospace",
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
                Standard cron format: minute hour day month weekday
              </div>
            </div>
          )}

          {/* Event-driven: queue + event name */}
          {(nodeData as ProcessDefinition).execution === "event_driven" && (
            <div style={{ display: "grid", gap: 8 }}>
              <div>
                <div style={labelStyle}>Queue Ref</div>
                <input
                  type="text"
                  value={(nodeData as ProcessDefinition).trigger?.queue ?? ""}
                  onChange={(e) =>
                    handleUpdate({
                      trigger: {
                        ...(nodeData as ProcessDefinition).trigger,
                        queue: e.target.value,
                      },
                    } as Partial<ProcessDefinition>)
                  }
                  placeholder="my-queue-name"
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={labelStyle}>Event Name</div>
                <input
                  type="text"
                  value={(nodeData as ProcessDefinition).trigger?.event ?? ""}
                  onChange={(e) =>
                    handleUpdate({
                      trigger: {
                        ...(nodeData as ProcessDefinition).trigger,
                        event: e.target.value,
                      },
                    } as Partial<ProcessDefinition>)
                  }
                  placeholder="user.created"
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {/* Runtime Config: timeout + retry policy */}
          <div style={sectionStyle}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Runtime Config</div>
            <div style={{ display: "grid", gap: 8 }}>
              {/* Timeout */}
              <div>
                <div style={labelStyle}>Timeout</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number"
                    min={0}
                    max={900}
                    value={(nodeData as ProcessDefinition).timeout ?? 0}
                    onChange={(e) =>
                      handleUpdate({ timeout: Number(e.target.value) } as Partial<ProcessDefinition>)
                    }
                    style={{ ...inputStyle, width: 72 }}
                  />
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    {(nodeData as ProcessDefinition).timeout
                      ? `${(nodeData as ProcessDefinition).timeout}s`
                      : "seconds  (0 = no limit)"}
                  </span>
                </div>
              </div>

              {/* Retry Policy — async / event_driven only */}
              {((nodeData as ProcessDefinition).execution === "async" ||
                (nodeData as ProcessDefinition).execution === "event_driven") && (
                <div>
                  <div style={{ ...labelStyle, marginBottom: 6 }}>Retry Policy</div>
                  <div style={{ display: "grid", gap: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, color: "var(--muted)", width: 88, flexShrink: 0 }}>
                        Max Attempts
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={(nodeData as ProcessDefinition).retryPolicy?.maxAttempts ?? 3}
                        onChange={(e) =>
                          handleUpdate({
                            retryPolicy: {
                              maxAttempts: Number(e.target.value),
                              backoff: (nodeData as ProcessDefinition).retryPolicy?.backoff ?? "linear",
                              delayMs: (nodeData as ProcessDefinition).retryPolicy?.delayMs ?? 1000,
                            },
                          } as Partial<ProcessDefinition>)
                        }
                        style={{ ...inputStyle, width: 64 }}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, color: "var(--muted)", width: 88, flexShrink: 0 }}>
                        Backoff
                      </span>
                      <select
                        value={(nodeData as ProcessDefinition).retryPolicy?.backoff ?? "linear"}
                        onChange={(e) =>
                          handleUpdate({
                            retryPolicy: {
                              maxAttempts: (nodeData as ProcessDefinition).retryPolicy?.maxAttempts ?? 3,
                              backoff: e.target.value as "fixed" | "linear" | "exponential",
                              delayMs: (nodeData as ProcessDefinition).retryPolicy?.delayMs ?? 1000,
                            },
                          } as Partial<ProcessDefinition>)
                        }
                        style={{ ...selectStyle, flex: 1 }}
                      >
                        <option value="fixed">Fixed</option>
                        <option value="linear">Linear</option>
                        <option value="exponential">Exponential</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, color: "var(--muted)", width: 88, flexShrink: 0 }}>
                        Initial Delay
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={(nodeData as ProcessDefinition).retryPolicy?.delayMs ?? 1000}
                        onChange={(e) =>
                          handleUpdate({
                            retryPolicy: {
                              maxAttempts: (nodeData as ProcessDefinition).retryPolicy?.maxAttempts ?? 3,
                              backoff: (nodeData as ProcessDefinition).retryPolicy?.backoff ?? "linear",
                              delayMs: Number(e.target.value),
                            },
                          } as Partial<ProcessDefinition>)
                        }
                        style={{ ...inputStyle, width: 72 }}
                      />
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>ms</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {activeTab === "api" && (
            <div style={sectionStyle}>
              <div
                style={{
                  ...labelStyle,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span>Imported Functions</span>
                <span style={{ color: "var(--secondary)" }}>
                  {importedFunctionIds.length}
                </span>
              </div>
              {functionDefinitions.length === 0 ? (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    fontStyle: "italic",
                  }}
                >
                  No functions found. Add function blocks in the Functions tab.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {functionDefinitions.map((fn) => {
                    const checked = importedFunctionIds.includes(fn.id);
                    return (
                      <label
                        key={fn.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          fontSize: 11,
                          color: "var(--secondary)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          padding: "6px 8px",
                          background: "var(--floating)",
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                          {fn.label}
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const currentRefs = new Set(importedFunctionIds);
                            if (event.target.checked) {
                              currentRefs.add(fn.id);
                            } else {
                              currentRefs.delete(fn.id);
                            }
                            const nextSteps = Array.from(currentRefs).map(
                              (ref, index) => ({
                                id: `import_${index + 1}_${ref}`,
                                kind: "ref" as const,
                                ref,
                                description: `Import ${ref}`,
                              }),
                            );
                            handleUpdate({
                              steps: nextSteps,
                            } as Partial<ProcessDefinition>);
                          }}
                          style={{ accentColor: "var(--primary)" }}
                        />
                      </label>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
                API Function Block imports reusable logic from Functions tab.
              </div>
            </div>
          )}

          {/* Inputs Section */}
          <div style={sectionStyle}>
            <div
              style={{
                ...labelStyle,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span>Inputs</span>
              <span style={{ color: "var(--secondary)" }}>
                {(nodeData as ProcessDefinition).inputs.length}
              </span>
            </div>

            {(nodeData as ProcessDefinition).inputs.map(
              (input: InputField, i: number) => (
                <TypeSchemaEditor
                  key={i}
                  field={input}
                  onChange={(updated) =>
                    updateInput(selectedNode.id, i, updated as InputField)
                  }
                  onRemove={() => removeInput(selectedNode.id, input.name)}
                />
              ),
            )}

            {/* Add Input */}
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              <input
                type="text"
                placeholder="field name"
                value={newInputName}
                onChange={(e) => setNewInputName(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => {
                  if (newInputName.trim()) {
                    addInput(selectedNode.id, {
                      name: newInputName.trim(),
                      type: "string",
                      required: true,
                    });
                    setNewInputName("");
                  }
                }}
                style={{
                  background: "var(--primary)",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 12px",
                  color: "white",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Add
              </button>
            </div>
          </div>

          {/* Outputs Section */}
          <div style={sectionStyle}>
            <div
              style={{
                ...labelStyle,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Success Outputs</span>
              <span style={{ color: "#4ade80" }}>
                {(nodeData as ProcessDefinition).outputs.success.length}
              </span>
            </div>

            {(nodeData as ProcessDefinition).outputs.success.map(
              (output: OutputField, i: number) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 8px",
                    background: "var(--background)",
                    borderRadius: 4,
                    marginBottom: 4,
                    fontSize: 11,
                    borderLeft: "2px solid #4ade80",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--foreground)" }}>
                      {output.name}
                    </span>
                    <span style={{ color: "var(--muted)", marginLeft: 6 }}>
                      : {output.type}
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      removeOutput(selectedNode.id, output.name, "success")
                    }
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    ×
                  </button>
                </div>
              ),
            )}

            {/* Add Output */}
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              <input
                type="text"
                placeholder="output name"
                value={newOutputName}
                onChange={(e) => setNewOutputName(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => {
                  if (newOutputName.trim()) {
                    addOutput(
                      selectedNode.id,
                      {
                        name: newOutputName.trim(),
                        type: "string",
                      },
                      "success",
                    );
                    setNewOutputName("");
                  }
                }}
                style={{
                  background: "#4ade80",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 12px",
                  color: "black",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Add
              </button>
            </div>
          </div>

          {/* Error Outputs Section */}
          <div style={sectionStyle}>
            <div
              style={{
                ...labelStyle,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Error Outputs</span>
              <span style={{ color: "var(--destructive)" }}>
                {(nodeData as ProcessDefinition).outputs.error.length}
              </span>
            </div>

            {(nodeData as ProcessDefinition).outputs.error.map(
              (output: OutputField, i: number) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 8px",
                    background: "var(--background)",
                    borderRadius: 4,
                    marginBottom: 4,
                    fontSize: 11,
                    borderLeft: "2px solid var(--destructive)",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--foreground)" }}>{output.name}</span>
                    <span style={{ color: "var(--muted)", marginLeft: 6 }}>
                      : {output.type}
                    </span>
                  </div>
                  <button
                    onClick={() => removeOutput(selectedNode.id, output.name, "error")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    ×
                  </button>
                </div>
              ),
            )}

            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              <input
                type="text"
                placeholder="error output name"
                value={newErrorOutputName}
                onChange={(e) => setNewErrorOutputName(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => {
                  if (newErrorOutputName.trim()) {
                    addOutput(
                      selectedNode.id,
                      { name: newErrorOutputName.trim(), type: "string" },
                      "error",
                    );
                    setNewErrorOutputName("");
                  }
                }}
                style={{
                  background: "color-mix(in srgb, var(--destructive) 55%, var(--floating) 45%)",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 12px",
                  color: "white",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Add
              </button>
            </div>
          </div>

          {/* Steps Preview */}
          <div style={sectionStyle}>
            <div
              style={{
                ...labelStyle,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Steps</span>
              <span style={{ color: "var(--secondary)" }}>
                {(nodeData as ProcessDefinition).steps.length}
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted)",
                fontStyle: "italic",
              }}
            >
              {activeTab === "api"
                ? "Imported functions are tracked as ref steps."
                : "Steps are defined in the visual graph"}
            </div>
          </div>

          {/* Function Logic Editor — shown on Functions tab */}
          {activeTab === "functions" && (
            <>
              {/* Function Signature Preview */}
              <div style={sectionStyle}>
                <div style={{ ...labelStyle, marginBottom: 6 }}>Function Signature</div>
                <div
                  style={{
                    fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                    fontSize: 11,
                    background: "#0d1117",
                    color: "#a5d6ff",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "7px 10px",
                    overflowX: "auto",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ color: "#ff7b72" }}>async</span>{" "}
                  <span style={{ color: "#d2a8ff" }}>function</span>{" "}
                  <span style={{ color: "#79c0ff" }}>{processNodeForLogic?.id}</span>
                  <span style={{ color: "#e6edf3" }}>(</span>
                  {funcInputNames.length > 0 ? (
                    <>
                      <span style={{ color: "#e6edf3" }}>{"{ "}</span>
                      {funcInputNames.map((name, i) => (
                        <span key={name}>
                          <span style={{ color: "#ffa657" }}>{name}</span>
                          {i < funcInputNames.length - 1 && (
                            <span style={{ color: "#e6edf3" }}>{", "}</span>
                          )}
                        </span>
                      ))}
                      <span style={{ color: "#e6edf3" }}>{" }"}</span>
                    </>
                  ) : (
                    <span style={{ color: "#ffa657" }}>inputs</span>
                  )}
                  <span style={{ color: "#e6edf3" }}>)</span>
                  <span style={{ color: "#e6edf3" }}>{": Promise<"}</span>
                  <span style={{ color: "#ffa657" }}>
                    {(nodeData as ProcessDefinition).returnType || "any"}
                  </span>
                  <span style={{ color: "#e6edf3" }}>{">"}</span>
                </div>
                {/* Return type editor */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>
                    Return type
                  </span>
                  <input
                    type="text"
                    value={(nodeData as ProcessDefinition).returnType ?? ""}
                    onChange={(e) =>
                      handleUpdate({ returnType: e.target.value } as Partial<ProcessDefinition>)
                    }
                    placeholder="any"
                    style={{
                      flex: 1,
                      background: "#0d1117",
                      border: "1px solid var(--border)",
                      borderRadius: 5,
                      padding: "3px 8px",
                      fontSize: 11,
                      color: "#ffa657",
                      fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                      outline: "none",
                      minWidth: 0,
                    }}
                  />
                </div>
              </div>

              {/* Available Inputs */}
              {funcInputNames.length > 0 && (
                <div>
                  <div style={{ ...labelStyle, marginBottom: 6 }}>Available Inputs</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
                    {funcInputNames.map((name) => (
                      <span
                        key={name}
                        style={{
                          fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                          fontSize: 11,
                          background: "rgba(99,102,241,0.12)",
                          color: "var(--primary)",
                          border: "1px solid rgba(99,102,241,0.35)",
                          borderRadius: 4,
                          padding: "2px 8px",
                        }}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>
                    Available as destructured parameters in the function body.
                  </div>
                </div>
              )}

              {/* Code Editor */}
              <div style={sectionStyle}>
                {/* Editor toolbar */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: snippetOpen ? 6 : 6,
                  }}
                >
                  <span style={{ ...labelStyle, marginBottom: 0 }}>Function Logic</span>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--muted)",
                        fontFamily: "monospace",
                        background: "var(--background)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        padding: "2px 6px",
                      }}
                    >
                      TypeScript
                    </span>
                    {/* Font size control */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      <button
                        type="button"
                        title="Decrease font size"
                        onClick={() => setEditorFontSize((s) => Math.max(10, s - 1))}
                        style={{
                          border: "none",
                          borderRight: "1px solid var(--border)",
                          background: "var(--floating)",
                          color: "var(--muted)",
                          padding: "2px 5px",
                          fontSize: 13,
                          lineHeight: 1,
                          cursor: "pointer",
                        }}
                      >
                        −
                      </button>
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--muted)",
                          minWidth: 22,
                          textAlign: "center",
                          fontFamily: "monospace",
                          background: "var(--floating)",
                          padding: "2px 0",
                        }}
                      >
                        {editorFontSize}
                      </span>
                      <button
                        type="button"
                        title="Increase font size"
                        onClick={() => setEditorFontSize((s) => Math.min(18, s + 1))}
                        style={{
                          border: "none",
                          borderLeft: "1px solid var(--border)",
                          background: "var(--floating)",
                          color: "var(--muted)",
                          padding: "2px 5px",
                          fontSize: 13,
                          lineHeight: 1,
                          cursor: "pointer",
                        }}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      title={snippetOpen ? "Close snippets" : "Insert a code snippet"}
                      onClick={() => setSnippetOpen((prev) => !prev)}
                      style={{
                        border: "1px solid var(--border)",
                        background: snippetOpen
                          ? "color-mix(in srgb, var(--primary) 18%, var(--floating) 82%)"
                          : "var(--floating)",
                        color: snippetOpen ? "var(--primary)" : "var(--muted)",
                        borderRadius: 4,
                        padding: "2px 7px",
                        fontSize: 11,
                        cursor: "pointer",
                        lineHeight: 1.5,
                      }}
                    >
                      ⚡ Snippets
                    </button>
                    <button
                      type="button"
                      title={wrapLines ? "Disable word wrap" : "Enable word wrap"}
                      onClick={() => setWrapLines((prev) => !prev)}
                      style={{
                        border: "1px solid var(--border)",
                        background: wrapLines
                          ? "color-mix(in srgb, var(--primary) 14%, var(--floating) 86%)"
                          : "var(--floating)",
                        color: wrapLines ? "var(--primary)" : "var(--muted)",
                        borderRadius: 4,
                        padding: "2px 7px",
                        fontSize: 12,
                        cursor: "pointer",
                        lineHeight: 1.4,
                      }}
                    >
                      ↩
                    </button>
                    <button
                      type="button"
                      title={isEditorExpanded ? "Collapse editor" : "Expand editor"}
                      onClick={() => setIsEditorExpanded((prev) => !prev)}
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--floating)",
                        color: "var(--muted)",
                        borderRadius: 4,
                        padding: "2px 7px",
                        fontSize: 12,
                        cursor: "pointer",
                        lineHeight: 1.4,
                      }}
                    >
                      {isEditorExpanded ? "↙" : "↗"}
                    </button>
                  </div>
                </div>

                {/* Snippet picker */}
                {snippetOpen && (
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      background: "var(--background)",
                      padding: 8,
                      marginBottom: 8,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 5,
                    }}
                  >
                    {CODE_SNIPPETS.map((snippet) => (
                      <button
                        key={snippet.label}
                        type="button"
                        title={snippet.title}
                        onClick={() => {
                          insertSnippet(snippet.code);
                          setSnippetOpen(false);
                        }}
                        style={{
                          border: "1px solid var(--border)",
                          background: "var(--floating)",
                          color: "var(--secondary)",
                          borderRadius: 5,
                          padding: "4px 9px",
                          fontSize: 11,
                          fontFamily: "monospace",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {snippet.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Editor container */}
                <div
                  style={{
                    position: "relative",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    overflow: "hidden",
                    background: "#0d1117",
                  }}
                >
                  {/* Scroll-synced line number gutter */}
                  <div
                    ref={gutterRef}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: 36,
                      background: "rgba(0,0,0,0.3)",
                      borderRight: "1px solid rgba(255,255,255,0.06)",
                      pointerEvents: "none",
                      zIndex: 1,
                      paddingTop: 10,
                      overflowY: "hidden",
                      userSelect: "none",
                    }}
                  >
                    {Array.from({ length: funcLineCount }, (_, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: 10,
                          lineHeight: "1.65em",
                          color: "rgba(139,148,158,0.55)",
                          textAlign: "right",
                          paddingRight: 6,
                          fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                        }}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>
                  <textarea
                    ref={editorTextareaRef}
                    value={funcLogicValue}
                    onChange={(e) =>
                      handleUpdate({ logic: e.target.value } as Partial<ProcessDefinition>)
                    }
                    onKeyDown={(e) => {
                      const ta = e.currentTarget;
                      const { selectionStart, selectionEnd, value } = ta;
                      if (e.key === "Tab") {
                        e.preventDefault();
                        const indent = "  ";
                        const next =
                          value.slice(0, selectionStart) + indent + value.slice(selectionEnd);
                        handleUpdate({ logic: next } as Partial<ProcessDefinition>);
                        requestAnimationFrame(() => {
                          ta.selectionStart = ta.selectionEnd = selectionStart + indent.length;
                        });
                        return;
                      }
                      const pairs: Record<string, string> = {
                        "{": "}", "(": ")", "[": "]", '"': '"', "'": "'", "`": "`",
                      };
                      if (pairs[e.key] && selectionStart === selectionEnd) {
                        e.preventDefault();
                        const closing = pairs[e.key];
                        const next =
                          value.slice(0, selectionStart) +
                          e.key +
                          closing +
                          value.slice(selectionEnd);
                        handleUpdate({ logic: next } as Partial<ProcessDefinition>);
                        requestAnimationFrame(() => {
                          ta.selectionStart = ta.selectionEnd = selectionStart + 1;
                        });
                      }
                    }}
                    onScroll={(e) => {
                      if (gutterRef.current) {
                        gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                      }
                    }}
                    spellCheck={false}
                    style={{
                      width: "100%",
                      minHeight: isEditorExpanded ? 420 : 220,
                      resize: "vertical",
                      background: "transparent",
                      color: "#e6edf3",
                      fontFamily:
                        "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
                      fontSize: editorFontSize,
                      lineHeight: 1.65,
                      padding: "10px 10px 10px 46px",
                      border: "none",
                      outline: "none",
                      caretColor: "#79c0ff",
                      whiteSpace: wrapLines ? "pre-wrap" : "pre",
                      overflowWrap: wrapLines ? "break-word" : "normal",
                      overflowX: wrapLines ? "hidden" : "auto",
                    }}
                  />
                  {/* Status bar */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "3px 10px 3px 46px",
                      background: "rgba(0,0,0,0.25)",
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                      fontSize: 10,
                      fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                      color: "rgba(139,148,158,0.6)",
                      userSelect: "none",
                    }}
                  >
                    <span>{funcLineCount} lines</span>
                    <span>{funcLogicValue.length} chars</span>
                  </div>
                </div>

                {/* Editor footer actions */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 6,
                    gap: 6,
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdate({
                        logic: funcDefaultTemplate,
                      } as Partial<ProcessDefinition>)
                    }
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--floating)",
                      color: "var(--muted)",
                      borderRadius: 6,
                      padding: "5px 10px",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(funcLogicValue).catch(() => {});
                      setLogicCopied(true);
                      setTimeout(() => setLogicCopied(false), 1500);
                    }}
                    style={{
                      border: "1px solid var(--border)",
                      background: logicCopied
                        ? "color-mix(in srgb, #4ade80 18%, var(--floating) 82%)"
                        : "var(--floating)",
                      color: logicCopied ? "#4ade80" : "var(--secondary)",
                      borderRadius: 6,
                      padding: "5px 10px",
                      fontSize: 11,
                      cursor: "pointer",
                      transition: "background 0.2s ease, color 0.2s ease",
                    }}
                  >
                    {logicCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Dependencies */}
              <div style={sectionStyle}>
                <div style={{ ...labelStyle, marginBottom: 8 }}>Dependencies</div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--muted)",
                    marginBottom: 8,
                    lineHeight: 1.5,
                  }}
                >
                  npm packages required by this function (e.g.{" "}
                  <code
                    style={{
                      fontFamily: "monospace",
                      background: "var(--background)",
                      padding: "1px 4px",
                      borderRadius: 3,
                      fontSize: 10,
                    }}
                  >
                    axios
                  </code>
                  ,{" "}
                  <code
                    style={{
                      fontFamily: "monospace",
                      background: "var(--background)",
                      padding: "1px 4px",
                      borderRadius: 3,
                      fontSize: 10,
                    }}
                  >
                    zod
                  </code>
                  ).
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input
                    type="text"
                    value={newDepName}
                    onChange={(e) => setNewDepName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newDepName.trim()) {
                        const existing =
                          (nodeData as ProcessDefinition).dependencies ?? [];
                        if (!existing.includes(newDepName.trim())) {
                          handleUpdate({
                            dependencies: [...existing, newDepName.trim()],
                          } as Partial<ProcessDefinition>);
                        }
                        setNewDepName("");
                      }
                    }}
                    placeholder="package-name  (Enter)"
                    style={{ ...inputStyle, flex: 1, fontSize: 11 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newDepName.trim()) return;
                      const existing =
                        (nodeData as ProcessDefinition).dependencies ?? [];
                      if (!existing.includes(newDepName.trim())) {
                        handleUpdate({
                          dependencies: [...existing, newDepName.trim()],
                        } as Partial<ProcessDefinition>);
                      }
                      setNewDepName("");
                    }}
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--floating)",
                      color: "var(--secondary)",
                      borderRadius: 6,
                      padding: "5px 10px",
                      fontSize: 11,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Add
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {((nodeData as ProcessDefinition).dependencies ?? []).length === 0 ? (
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>
                      No dependencies added
                    </span>
                  ) : (
                    ((nodeData as ProcessDefinition).dependencies ?? []).map((dep) => (
                      <span
                        key={dep}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontFamily: "monospace",
                          fontSize: 11,
                          background: "rgba(0,0,0,0.2)",
                          color: "#e6edf3",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          padding: "2px 6px 2px 8px",
                        }}
                      >
                        {dep}
                        <button
                          type="button"
                          onClick={() => {
                            const existing =
                              (nodeData as ProcessDefinition).dependencies ?? [];
                            handleUpdate({
                              dependencies: existing.filter((d) => d !== dep),
                            } as Partial<ProcessDefinition>);
                          }}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "var(--muted)",
                            cursor: "pointer",
                            fontSize: 14,
                            lineHeight: 1,
                            padding: 0,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Environment Variables */}
              <div style={sectionStyle}>
                <div style={{ ...labelStyle, marginBottom: 8 }}>Environment Variables</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 8, lineHeight: 1.5 }}>
                  Declare env vars this function reads from{" "}
                  <code style={{ fontFamily: "monospace", background: "var(--background)", padding: "1px 4px", borderRadius: 3, fontSize: 10 }}>
                    process.env
                  </code>
                  .
                </div>
                <div style={{ display: "grid", gap: 4, marginBottom: 8 }}>
                  {((nodeData as ProcessDefinition).envVars ?? []).length === 0 ? (
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>
                      No environment variables declared
                    </span>
                  ) : (
                    ((nodeData as ProcessDefinition).envVars ?? []).map(({ key, value }, i) => (
                      <div
                        key={i}
                        style={{ display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <span
                          style={{
                            flex: 1,
                            fontFamily: "monospace",
                            fontSize: 11,
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            padding: "3px 7px",
                            color: "var(--primary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            minWidth: 0,
                          }}
                        >
                          {key}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0 }}>→</span>
                        <span
                          style={{
                            flex: 1,
                            fontFamily: "monospace",
                            fontSize: 11,
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            padding: "3px 7px",
                            color: value ? "var(--secondary)" : "var(--muted)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontStyle: value ? "normal" : "italic",
                            minWidth: 0,
                          }}
                        >
                          {value || "unset"}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const vars = [
                              ...((nodeData as ProcessDefinition).envVars ?? []),
                            ];
                            vars.splice(i, 1);
                            handleUpdate({ envVars: vars } as Partial<ProcessDefinition>);
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--muted)",
                            cursor: "pointer",
                            fontSize: 14,
                            padding: 0,
                            flexShrink: 0,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    type="text"
                    value={newEnvKey}
                    onChange={(e) => setNewEnvKey(e.target.value.toUpperCase().replace(/\s/g, "_"))}
                    placeholder="MY_ENV_KEY"
                    style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: 11, minWidth: 0 }}
                  />
                  <input
                    type="text"
                    value={newEnvValue}
                    onChange={(e) => setNewEnvValue(e.target.value)}
                    placeholder="default"
                    style={{ ...inputStyle, flex: 1, fontSize: 11, minWidth: 0 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newEnvKey.trim()) return;
                      const existing = (nodeData as ProcessDefinition).envVars ?? [];
                      if (!existing.find((v) => v.key === newEnvKey.trim())) {
                        handleUpdate({
                          envVars: [
                            ...existing,
                            { key: newEnvKey.trim(), value: newEnvValue.trim() },
                          ],
                        } as Partial<ProcessDefinition>);
                      }
                      setNewEnvKey("");
                      setNewEnvValue("");
                    }}
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--floating)",
                      color: "var(--secondary)",
                      borderRadius: 6,
                      padding: "5px 10px",
                      fontSize: 11,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Tags */}
              <div style={sectionStyle}>
                <div style={{ ...labelStyle, marginBottom: 8 }}>Tags</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                  {((nodeData as ProcessDefinition).tags ?? []).length === 0 ? (
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>No tags added</span>
                  ) : (
                    ((nodeData as ProcessDefinition).tags ?? []).map((tag) => (
                      <span
                        key={tag}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          background: "rgba(135,163,255,0.09)",
                          color: "var(--primary)",
                          border: "1px solid rgba(135,163,255,0.22)",
                          borderRadius: 999,
                          padding: "2px 8px 2px 10px",
                        }}
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdate({
                              tags: ((nodeData as ProcessDefinition).tags ?? []).filter(
                                (t) => t !== tag,
                              ),
                            } as Partial<ProcessDefinition>)
                          }
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "var(--muted)",
                            cursor: "pointer",
                            fontSize: 13,
                            lineHeight: 1,
                            padding: 0,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTagName.trim()) {
                        const existing = (nodeData as ProcessDefinition).tags ?? [];
                        if (!existing.includes(newTagName.trim())) {
                          handleUpdate({
                            tags: [...existing, newTagName.trim()],
                          } as Partial<ProcessDefinition>);
                        }
                        setNewTagName("");
                      }
                    }}
                    placeholder="tag-name  (Enter)"
                    style={{ ...inputStyle, flex: 1, fontSize: 11 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newTagName.trim()) return;
                      const existing = (nodeData as ProcessDefinition).tags ?? [];
                      if (!existing.includes(newTagName.trim())) {
                        handleUpdate({
                          tags: [...existing, newTagName.trim()],
                        } as Partial<ProcessDefinition>);
                      }
                      setNewTagName("");
                    }}
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--floating)",
                      color: "var(--secondary)",
                      borderRadius: 6,
                      padding: "5px 10px",
                      fontSize: 11,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Database-specific fields */}
      {kind === "database" && (
        <>
          <div style={sectionStyle}>
            <div style={labelStyle}>Database Type</div>
            <select
              value={(nodeData as DatabaseBlock).dbType}
              onChange={(e) =>
                handleUpdate({
                  dbType: e.target.value,
                } as Partial<DatabaseBlock>)
              }
              style={selectStyle}
            >
              <option value="sql">SQL</option>
              <option value="nosql">NoSQL</option>
              <option value="kv">Key-Value</option>
              <option value="graph">Graph</option>
            </select>
          </div>

          <div>
            <div style={labelStyle}>Engine</div>
            <input
              type="text"
              value={(nodeData as DatabaseBlock).engine || ""}
              onChange={(e) =>
                handleUpdate({
                  engine: e.target.value,
                } as Partial<DatabaseBlock>)
              }
              placeholder="postgres, mongodb, redis..."
              style={inputStyle}
            />
          </div>

          <div style={sectionStyle}>
            <div style={labelStyle}>Capabilities</div>
            {Object.entries((nodeData as DatabaseBlock).capabilities).map(
              ([key, value]) => (
                <label
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    color: "var(--secondary)",
                    marginBottom: 4,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={value as boolean}
                    onChange={(e) => {
                      const caps = {
                        ...(nodeData as DatabaseBlock).capabilities,
                        [key]: e.target.checked,
                      };
                      handleUpdate({
                        capabilities: caps,
                      } as Partial<DatabaseBlock>);
                    }}
                    style={{ accentColor: "var(--primary)" }}
                  />
                  <span style={{ textTransform: "capitalize" }}>{key}</span>
                </label>
              ),
            )}
          </div>

          <div style={sectionStyle}>
            <button
              type="button"
              onClick={() => setIsSchemaDesignerExpanded((prev) => !prev)}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--muted)",
                padding: 0,
                cursor: "pointer",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: isSchemaDesignerExpanded ? 8 : 0,
              }}
            >
              <span>{isSchemaDesignerExpanded ? "▾" : "▸"}</span>
              <span>Schema Designer</span>
            </button>

            {isSchemaDesignerExpanded && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    {((nodeData as DatabaseBlock).tables || []).length} tables
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={triggerSchemaExport}
                      title="Export Schema"
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--floating)",
                        color: "var(--foreground)",
                        borderRadius: 4,
                        padding: "4px 7px",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      ⭳
                    </button>
                    <button
                      type="button"
                      onClick={() => schemaImportInputRef.current?.click()}
                      title="Import Schema"
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--floating)",
                        color: "var(--foreground)",
                        borderRadius: 4,
                        padding: "4px 7px",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      ⭱
                    </button>
                    <button
                      type="button"
                      onClick={triggerDDLExport}
                      title="Export as SQL DDL"
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--floating)",
                        color: "var(--foreground)",
                        borderRadius: 4,
                        padding: "4px 7px",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      🧾
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowERD((prev) => !prev)}
                      style={{
                        border: "1px solid var(--border)",
                        background: showERD ? "color-mix(in srgb, var(--primary) 18%, var(--floating) 82%)" : "var(--floating)",
                        color: "var(--foreground)",
                        borderRadius: 4,
                        padding: "4px 8px",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      {showERD ? "Hide ERD" : "View ERD"}
                    </button>
                    <button
                      type="button"
                      onClick={addTable}
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--floating)",
                        color: "var(--foreground)",
                        borderRadius: 4,
                        padding: "4px 8px",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      + Table
                    </button>
                  </div>
                </div>
                <input
                  ref={schemaImportInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleSchemaImportFile(file);
                    e.currentTarget.value = "";
                  }}
                  style={{ display: "none" }}
                />

                {schemaToastMessage && (
                  <div
                    style={{
                      fontSize: 11,
                      color:
                        schemaToastType === "success" ? "var(--secondary)" : "#fca5a5",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      background: "var(--panel)",
                      padding: "4px 6px",
                    }}
                  >
                    {schemaToastMessage}
                  </div>
                )}

                {showERD && (
                  <DatabaseERDViewer
                    tables={(nodeData as DatabaseBlock).tables || []}
                    relationships={(nodeData as DatabaseBlock).relationships || []}
                  />
                )}

                {((nodeData as DatabaseBlock).tables || []).length === 0 && (
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    No tables yet.
                  </div>
                )}

                {((nodeData as DatabaseBlock).tables || []).map((table, tableIndex) => {
                  const isExpanded = expandedTables[tableIndex] ?? true;
                  return (
                    <div
                      key={`${table.name}-${tableIndex}`}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        background: "var(--floating)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 8 }}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTables((prev) => ({
                              ...prev,
                              [tableIndex]: !isExpanded,
                            }))
                          }
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "var(--muted)",
                            cursor: "pointer",
                            fontSize: 11,
                            padding: 0,
                            width: 14,
                          }}
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>
                        <input
                          value={table.name}
                          onChange={(e) => {
                            const tables = [...((nodeData as DatabaseBlock).tables || [])];
                            tables[tableIndex] = { ...tables[tableIndex], name: e.target.value };
                            updateDatabaseTables(tables);
                          }}
                          placeholder="Table name"
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <span style={{ fontSize: 10, color: "var(--muted)" }}>
                          {(table.fields || []).length} fields
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const tables = ((nodeData as DatabaseBlock).tables || []).filter(
                              (_, i) => i !== tableIndex,
                            );
                            updateDatabaseTables(tables);
                          }}
                          style={{
                            border: "1px solid var(--border)",
                            background: "transparent",
                            color: "var(--muted)",
                            borderRadius: 4,
                            padding: "3px 6px",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          x
                        </button>
                      </div>

                      {isExpanded && (
                        <div style={{ padding: 8, borderTop: "1px solid var(--border)", display: "grid", gap: 6 }}>
                          {(table.fields || []).map((field, fieldIndex) => (
                            <div
                              key={`${field.name}-${fieldIndex}`}
                              style={{
                                border: "1px solid var(--border)",
                                borderRadius: 4,
                                padding: 6,
                                background: "var(--panel)",
                                display: "grid",
                                gap: 6,
                              }}
                            >
                              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.9fr auto", gap: 6 }}>
                                <input
                                  value={field.name}
                                  onChange={(e) => {
                                    const tables = [...((nodeData as DatabaseBlock).tables || [])];
                                    const fields = [...(tables[tableIndex].fields || [])];
                                    fields[fieldIndex] = { ...fields[fieldIndex], name: e.target.value };
                                    tables[tableIndex] = { ...tables[tableIndex], fields };
                                    updateDatabaseTables(tables);
                                  }}
                                  placeholder="field"
                                  style={inputStyle}
                                />
                                <select
                                  value={field.type}
                                  onChange={(e) => {
                                    const tables = [...((nodeData as DatabaseBlock).tables || [])];
                                    const fields = [...(tables[tableIndex].fields || [])];
                                    fields[fieldIndex] = {
                                      ...fields[fieldIndex],
                                      type: e.target.value as DatabaseTableField["type"],
                                    };
                                    tables[tableIndex] = { ...tables[tableIndex], fields };
                                    updateDatabaseTables(tables);
                                  }}
                                  style={selectStyle}
                                >
                                  <option value="string">string</option>
                                  <option value="number">number</option>
                                  <option value="boolean">boolean</option>
                                  <option value="date">date</option>
                                  <option value="json">json</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const tables = [...((nodeData as DatabaseBlock).tables || [])];
                                    const fields = (tables[tableIndex].fields || []).filter(
                                      (_, i) => i !== fieldIndex,
                                    );
                                    tables[tableIndex] = { ...tables[tableIndex], fields };
                                    updateDatabaseTables(tables);
                                  }}
                                  style={{
                                    border: "1px solid var(--border)",
                                    background: "transparent",
                                    color: "var(--muted)",
                                    borderRadius: 4,
                                    padding: "3px 6px",
                                    fontSize: 11,
                                    cursor: "pointer",
                                  }}
                                >
                                  x
                                </button>
                              </div>

                              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "center" }}>
                                <input
                                  value={field.defaultValue || ""}
                                  onChange={(e) => {
                                    const tables = [...((nodeData as DatabaseBlock).tables || [])];
                                    const fields = [...(tables[tableIndex].fields || [])];
                                    fields[fieldIndex] = {
                                      ...fields[fieldIndex],
                                      defaultValue: e.target.value || undefined,
                                    };
                                    tables[tableIndex] = { ...tables[tableIndex], fields };
                                    updateDatabaseTables(tables);
                                  }}
                                  placeholder="default"
                                  style={inputStyle}
                                />
                                <label style={{ fontSize: 11, color: "var(--muted)", display: "flex", gap: 4 }}>
                                  <input
                                    type="checkbox"
                                    checked={field.nullable !== false}
                                    onChange={(e) => {
                                      const tables = [...((nodeData as DatabaseBlock).tables || [])];
                                      const fields = [...(tables[tableIndex].fields || [])];
                                      fields[fieldIndex] = { ...fields[fieldIndex], nullable: e.target.checked };
                                      tables[tableIndex] = { ...tables[tableIndex], fields };
                                      updateDatabaseTables(tables);
                                    }}
                                  />
                                  nullable
                                </label>
                                <label style={{ fontSize: 11, color: "var(--muted)", display: "flex", gap: 4 }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(field.isPrimaryKey)}
                                    onChange={(e) => {
                                      const tables = [...((nodeData as DatabaseBlock).tables || [])];
                                      const fields = [...(tables[tableIndex].fields || [])];
                                      fields[fieldIndex] = { ...fields[fieldIndex], isPrimaryKey: e.target.checked };
                                      tables[tableIndex] = { ...tables[tableIndex], fields };
                                      updateDatabaseTables(tables);
                                    }}
                                  />
                                  pk
                                </label>
                                <label style={{ fontSize: 11, color: "var(--muted)", display: "flex", gap: 4 }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(field.isForeignKey)}
                                    onChange={(e) => {
                                      const tables = [...((nodeData as DatabaseBlock).tables || [])];
                                      const fields = [...(tables[tableIndex].fields || [])];
                                      fields[fieldIndex] = { ...fields[fieldIndex], isForeignKey: e.target.checked };
                                      tables[tableIndex] = { ...tables[tableIndex], fields };
                                      updateDatabaseTables(tables);
                                    }}
                                  />
                                  fk
                                </label>
                              </div>

                              {Boolean(field.isForeignKey) && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                  <select
                                    value={field.references?.table || ""}
                                    onChange={(e) => {
                                      const tables = [...((nodeData as DatabaseBlock).tables || [])];
                                      const fields = [...(tables[tableIndex].fields || [])];
                                      fields[fieldIndex] = {
                                        ...fields[fieldIndex],
                                        references: {
                                          table: e.target.value,
                                          field: fields[fieldIndex].references?.field || "",
                                        },
                                      };
                                      tables[tableIndex] = { ...tables[tableIndex], fields };
                                      updateDatabaseTables(tables);
                                    }}
                                    style={selectStyle}
                                  >
                                    <option value="">target table</option>
                                    {((nodeData as DatabaseBlock).tables || []).map((targetTable, i) => (
                                      <option key={`${targetTable.name}-${i}`} value={targetTable.name}>
                                        {targetTable.name}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    value={field.references?.field || ""}
                                    onChange={(e) => {
                                      const tables = [...((nodeData as DatabaseBlock).tables || [])];
                                      const fields = [...(tables[tableIndex].fields || [])];
                                      fields[fieldIndex] = {
                                        ...fields[fieldIndex],
                                        references: {
                                          table: fields[fieldIndex].references?.table || "",
                                          field: e.target.value,
                                        },
                                      };
                                      tables[tableIndex] = { ...tables[tableIndex], fields };
                                      updateDatabaseTables(tables);
                                    }}
                                    placeholder="target field"
                                    style={inputStyle}
                                  />
                                </div>
                              )}
                            </div>
                          ))}

                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => {
                                const tables = [...((nodeData as DatabaseBlock).tables || [])];
                                const fields = [...(tables[tableIndex].fields || [])];
                                fields.push({
                                  name: `field_${fields.length + 1}`,
                                  type: "string",
                                  nullable: true,
                                  isPrimaryKey: false,
                                  isForeignKey: false,
                                });
                                tables[tableIndex] = { ...tables[tableIndex], fields };
                                updateDatabaseTables(tables);
                              }}
                              style={{
                                border: "1px solid var(--border)",
                                background: "var(--floating)",
                                color: "var(--foreground)",
                                borderRadius: 4,
                                padding: "4px 8px",
                                fontSize: 11,
                                cursor: "pointer",
                              }}
                            >
                              + Field
                            </button>
                            <input
                              value={(table.indexes || []).join(", ")}
                              onChange={(e) => {
                                const tables = [...((nodeData as DatabaseBlock).tables || [])];
                                tables[tableIndex] = {
                                  ...tables[tableIndex],
                                  indexes: e.target.value
                                    .split(",")
                                    .map((x) => x.trim())
                                    .filter(Boolean),
                                };
                                updateDatabaseTables(tables);
                              }}
                              placeholder="indexes (comma separated)"
                              style={{ ...inputStyle, flex: 1 }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ ...sectionStyle, display: "none" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: isTemplatePickerOpen ? 8 : 0,
              }}
            >
              <div style={labelStyle}>Templates</div>
              <button
                type="button"
                onClick={() => setIsTemplatePickerOpen((prev) => !prev)}
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--floating)",
                  color: "var(--foreground)",
                  borderRadius: 4,
                  padding: "4px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Load Template
              </button>
            </div>

            {isTemplatePickerOpen && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  style={selectStyle}
                >
                  {databaseTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={loadDatabaseTemplate}
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--floating)",
                    color: "var(--foreground)",
                    borderRadius: 4,
                    padding: "4px 10px",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Apply
                </button>
              </div>
            )}
          </div>

          <EnvironmentsSection
            database={nodeData as DatabaseBlock}
            onChange={(updates) => handleUpdate(updates as Partial<DatabaseBlock>)}
            inputStyle={inputStyle}
            selectStyle={selectStyle}
            sectionStyle={sectionStyle}
          />

          <DataSeedingSection
            database={nodeData as DatabaseBlock}
            onChange={(updates) => handleUpdate(updates as Partial<DatabaseBlock>)}
            inputStyle={inputStyle}
            selectStyle={selectStyle}
            sectionStyle={sectionStyle}
            onMessage={showSchemaToast}
          />
          <PerformanceSection
            database={nodeData as DatabaseBlock}
            onChange={(updates) => handleUpdate(updates as Partial<DatabaseBlock>)}
            inputStyle={inputStyle}
            labelStyle={labelStyle}
            sectionStyle={sectionStyle}
          />

          <BackupSection
            database={nodeData as DatabaseBlock}
            onChange={(updates) => handleUpdate(updates as Partial<DatabaseBlock>)}
            inputStyle={inputStyle}
            selectStyle={selectStyle}
            sectionStyle={sectionStyle}
          />

          <SecuritySection
            database={nodeData as DatabaseBlock}
            onChange={(updates) => handleUpdate(updates as Partial<DatabaseBlock>)}
            inputStyle={inputStyle}
            sectionStyle={sectionStyle}
          />

          <MonitoringSection
            database={nodeData as DatabaseBlock}
            onChange={(updates) => handleUpdate(updates as Partial<DatabaseBlock>)}
            inputStyle={inputStyle}
            selectStyle={selectStyle}
            sectionStyle={sectionStyle}
          />
          <HealthCheckSection
            database={nodeData as DatabaseBlock}
            onChange={(updates) => {
              if (updates.tables) {
                const { tables, ...rest } = updates;
                updateDatabaseTables(tables, rest);
                return;
              }
              handleUpdate(updates as Partial<DatabaseBlock>);
            }}
            sectionStyle={sectionStyle}
          />
          <div style={sectionStyle}>
            <QueryEditor
              database={nodeData as DatabaseBlock}
              onChange={(queries) =>
                handleUpdate({ queries } as Partial<DatabaseBlock>)
              }
            />
          </div>
          <ConnectedProcessesSection
            summary={dbConnectionSummary}
            labelStyle={labelStyle}
            sectionStyle={sectionStyle}
          />

          <MigrationsSection
            database={nodeData as DatabaseBlock}
            onChange={(updates) => handleUpdate(updates as Partial<DatabaseBlock>)}
            inputStyle={inputStyle}
            sectionStyle={sectionStyle}
          />
          <ChangeHistorySection
            database={nodeData as DatabaseBlock}
            sectionStyle={sectionStyle}
            selectStyle={selectStyle}
          />
          <div style={{ ...sectionStyle, display: "none" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div style={labelStyle}>Schema Designer</div>
              <button
                type="button"
                onClick={addTable}
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--floating)",
                  color: "var(--foreground)",
                  borderRadius: 4,
                  padding: "4px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                + Table
              </button>
            </div>

            {((nodeData as DatabaseBlock).tables || []).length === 0 && (
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                No tables yet.
              </div>
            )}

            {((nodeData as DatabaseBlock).tables || []).map((table, tableIndex) => {
              const isExpanded = expandedTables[tableIndex] ?? true;
              return (
                <div
                  key={`${table.name}-${tableIndex}`}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    marginBottom: 8,
                    background: "var(--floating)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedTables((prev) => ({
                          ...prev,
                          [tableIndex]: !isExpanded,
                        }))
                      }
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--muted)",
                        cursor: "pointer",
                        fontSize: 11,
                        padding: 0,
                        width: 14,
                      }}
                    >
                      {isExpanded ? "▾" : "▸"}
                    </button>
                    <input
                      value={table.name}
                      onChange={(e) => {
                        const tables = [...
                          ((nodeData as DatabaseBlock).tables || [])
                        ];
                        tables[tableIndex] = { ...tables[tableIndex], name: e.target.value };
                        updateDatabaseTables(tables);
                      }}
                      placeholder="Table name"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const tables = ((nodeData as DatabaseBlock).tables || []).filter(
                          (_, i) => i !== tableIndex,
                        );
                        updateDatabaseTables(tables);
                      }}
                      style={{
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--muted)",
                        borderRadius: 4,
                        padding: "4px 6px",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: 8, borderTop: "1px solid var(--border)" }}>
                      <div style={{ display: "grid", gap: 6 }}>
                        {(table.fields || []).map((field, fieldIndex) => (
                          <div
                            key={`${field.name}-${fieldIndex}`}
                            style={{
                              border: "1px solid var(--border)",
                              borderRadius: 4,
                              padding: 6,
                              display: "grid",
                              gap: 6,
                              background: "var(--panel)",
                            }}
                          >
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1.3fr 1fr auto",
                                gap: 6,
                              }}
                            >
                              <input
                                value={field.name}
                                onChange={(e) => {
                                  const tables = [...
                                    ((nodeData as DatabaseBlock).tables || [])
                                  ];
                                  const fields = [...(tables[tableIndex].fields || [])];
                                  fields[fieldIndex] = {
                                    ...fields[fieldIndex],
                                    name: e.target.value,
                                  };
                                  tables[tableIndex] = { ...tables[tableIndex], fields };
                                  updateDatabaseTables(tables);
                                }}
                                placeholder="field"
                                style={inputStyle}
                              />
                              <select
                                value={field.type}
                                onChange={(e) => {
                                  const tables = [...
                                    ((nodeData as DatabaseBlock).tables || [])
                                  ];
                                  const fields = [...(tables[tableIndex].fields || [])];
                                  fields[fieldIndex] = {
                                    ...fields[fieldIndex],
                                    type: e.target.value as DatabaseTableField["type"],
                                  };
                                  tables[tableIndex] = { ...tables[tableIndex], fields };
                                  updateDatabaseTables(tables);
                                }}
                                style={selectStyle}
                              >
                                <option value="string">string</option>
                                <option value="text">text</option>
                                <option value="int">int</option>
                                <option value="bigint">bigint</option>
                                <option value="float">float</option>
                                <option value="decimal">decimal</option>
                                <option value="boolean">boolean</option>
                                <option value="datetime">datetime</option>
                                <option value="json">json</option>
                                <option value="uuid">uuid</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  const tables = [...
                                    ((nodeData as DatabaseBlock).tables || [])
                                  ];
                                  const fields = (tables[tableIndex].fields || []).filter(
                                    (_, i) => i !== fieldIndex,
                                  );
                                  tables[tableIndex] = { ...tables[tableIndex], fields };
                                  updateDatabaseTables(tables);
                                }}
                                style={{
                                  border: "1px solid var(--border)",
                                  background: "transparent",
                                  color: "var(--muted)",
                                  borderRadius: 4,
                                  padding: "4px 6px",
                                  fontSize: 11,
                                  cursor: "pointer",
                                }}
                              >
                                x
                              </button>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                              <input
                                value={field.defaultValue || ""}
                                onChange={(e) => {
                                  const tables = [...
                                    ((nodeData as DatabaseBlock).tables || [])
                                  ];
                                  const fields = [...(tables[tableIndex].fields || [])];
                                  fields[fieldIndex] = {
                                    ...fields[fieldIndex],
                                    defaultValue: e.target.value || undefined,
                                  };
                                  tables[tableIndex] = { ...tables[tableIndex], fields };
                                  updateDatabaseTables(tables);
                                }}
                                placeholder="default"
                                style={inputStyle}
                              />
                              <input
                                value={
                                  field.references
                                    ? `${field.references.table}.${field.references.field}`
                                    : ""
                                }
                                onChange={(e) => {
                                  const tables = [...
                                    ((nodeData as DatabaseBlock).tables || [])
                                  ];
                                  const fields = [...(tables[tableIndex].fields || [])];
                                  const raw = e.target.value.trim();
                                  const [tableRef = "", fieldRef = ""] = raw.split(".");
                                  fields[fieldIndex] = {
                                    ...fields[fieldIndex],
                                    references:
                                      tableRef && fieldRef
                                        ? { table: tableRef, field: fieldRef }
                                        : undefined,
                                    isForeignKey: Boolean(tableRef && fieldRef),
                                  };
                                  tables[tableIndex] = { ...tables[tableIndex], fields };
                                  updateDatabaseTables(tables);
                                }}
                                placeholder="references table.field"
                                style={inputStyle}
                              />
                            </div>

                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                              <label style={{ fontSize: 11, color: "var(--muted)" }}>
                                <input
                                  type="checkbox"
                                  checked={field.nullable !== false}
                                  onChange={(e) => {
                                    const tables = [...
                                      ((nodeData as DatabaseBlock).tables || [])
                                    ];
                                    const fields = [...(tables[tableIndex].fields || [])];
                                    fields[fieldIndex] = {
                                      ...fields[fieldIndex],
                                      nullable: e.target.checked,
                                      required: !e.target.checked,
                                    };
                                    tables[tableIndex] = { ...tables[tableIndex], fields };
                                    updateDatabaseTables(tables);
                                  }}
                                />{" "}
                                Nullable
                              </label>
                              <label style={{ fontSize: 11, color: "var(--muted)" }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(field.isPrimaryKey)}
                                  onChange={(e) => {
                                    const tables = [...
                                      ((nodeData as DatabaseBlock).tables || [])
                                    ];
                                    const fields = [...(tables[tableIndex].fields || [])];
                                    fields[fieldIndex] = {
                                      ...fields[fieldIndex],
                                      isPrimaryKey: e.target.checked,
                                      primaryKey: e.target.checked,
                                    };
                                    tables[tableIndex] = { ...tables[tableIndex], fields };
                                    updateDatabaseTables(tables);
                                  }}
                                />{" "}
                                Primary Key
                              </label>
                              <label style={{ fontSize: 11, color: "var(--muted)" }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(field.isForeignKey)}
                                  onChange={(e) => {
                                    const tables = [...
                                      ((nodeData as DatabaseBlock).tables || [])
                                    ];
                                    const fields = [...(tables[tableIndex].fields || [])];
                                    fields[fieldIndex] = {
                                      ...fields[fieldIndex],
                                      isForeignKey: e.target.checked,
                                    };
                                    tables[tableIndex] = { ...tables[tableIndex], fields };
                                    updateDatabaseTables(tables);
                                  }}
                                />{" "}
                                Foreign Key
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={() => {
                            const tables = [...
                              ((nodeData as DatabaseBlock).tables || [])
                            ];
                            const fields = [...(tables[tableIndex].fields || [])];
                            fields.push({
                              name: `field_${fields.length + 1}`,
                              type: "string",
                              nullable: true,
                              required: false,
                              isPrimaryKey: false,
                              primaryKey: false,
                              isForeignKey: false,
                            });
                            tables[tableIndex] = { ...tables[tableIndex], fields };
                            updateDatabaseTables(tables);
                          }}
                          style={{
                            border: "1px solid var(--border)",
                            background: "var(--floating)",
                            color: "var(--foreground)",
                            borderRadius: 4,
                            padding: "4px 8px",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          + Field
                        </button>
                        <input
                          value={(table.indexes || []).join(", ")}
                          onChange={(e) => {
                            const tables = [...
                              ((nodeData as DatabaseBlock).tables || [])
                            ];
                            tables[tableIndex] = {
                              ...tables[tableIndex],
                              indexes: e.target.value
                                .split(",")
                                .map((x) => x.trim())
                                .filter(Boolean),
                            };
                            updateDatabaseTables(tables);
                          }}
                          placeholder="indexes (comma separated)"
                          style={{ ...inputStyle, flex: 1 }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Queue-specific fields */}
      {kind === "queue" && (
        <>
          <div style={sectionStyle}>
            <div style={labelStyle}>Delivery</div>
            <select
              value={(nodeData as QueueBlock).delivery}
              onChange={(e) =>
                handleUpdate({
                  delivery: e.target.value,
                } as Partial<QueueBlock>)
              }
              style={selectStyle}
            >
              <option value="at_least_once">At Least Once</option>
              <option value="at_most_once">At Most Once</option>
              <option value="exactly_once">Exactly Once</option>
            </select>
          </div>

          <div>
            <div style={labelStyle}>Max Retry Attempts</div>
            <input
              type="number"
              value={(nodeData as QueueBlock).retry.maxAttempts}
              onChange={(e) =>
                handleUpdate({
                  retry: {
                    ...(nodeData as QueueBlock).retry,
                    maxAttempts: parseInt(e.target.value) || 3,
                  },
                } as Partial<QueueBlock>)
              }
              style={inputStyle}
            />
          </div>

          <div>
            <div style={labelStyle}>Backoff Strategy</div>
            <select
              value={(nodeData as QueueBlock).retry.backoff}
              onChange={(e) =>
                handleUpdate({
                  retry: {
                    ...(nodeData as QueueBlock).retry,
                    backoff: e.target.value as "linear" | "exponential",
                  },
                } as Partial<QueueBlock>)
              }
              style={selectStyle}
            >
              <option value="linear">Linear</option>
              <option value="exponential">Exponential</option>
            </select>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              color: "var(--secondary)",
            }}
          >
            <input
              type="checkbox"
              checked={(nodeData as QueueBlock).deadLetter}
              onChange={(e) =>
                handleUpdate({
                  deadLetter: e.target.checked,
                } as Partial<QueueBlock>)
              }
              style={{ accentColor: "var(--primary)" }}
            />
            Enable Dead Letter Queue
          </label>
        </>
      )}

      {/* Service boundary-specific fields */}
      {kind === "service_boundary" && (
        <>
          <div style={sectionStyle}>
            <div style={labelStyle}>API Ownership (comma-separated IDs)</div>
            <input
              type="text"
              value={((nodeData as ServiceBoundaryBlock).apiRefs || []).join(", ")}
              onChange={(e) =>
                handleUpdate({
                  apiRefs: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                } as Partial<ServiceBoundaryBlock>)
              }
              placeholder="paymentsApi, usersApi"
              style={inputStyle}
            />
          </div>

          <div>
            <div style={labelStyle}>Function Ownership (comma-separated IDs)</div>
            <input
              type="text"
              value={((nodeData as ServiceBoundaryBlock).functionRefs || []).join(", ")}
              onChange={(e) =>
                handleUpdate({
                  functionRefs: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                } as Partial<ServiceBoundaryBlock>)
              }
              placeholder="createOrderFn, refundFn"
              style={inputStyle}
            />
          </div>

          <div>
            <div style={labelStyle}>Data Ownership (comma-separated IDs)</div>
            <input
              type="text"
              value={((nodeData as ServiceBoundaryBlock).dataRefs || []).join(", ")}
              onChange={(e) =>
                handleUpdate({
                  dataRefs: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                } as Partial<ServiceBoundaryBlock>)
              }
              placeholder="ordersDb, billingDb"
              style={inputStyle}
            />
          </div>

          <div>
            <div style={labelStyle}>Compute Host</div>
            <select
              value={(nodeData as ServiceBoundaryBlock).computeRef || ""}
              onChange={(e) =>
                handleUpdate({
                  computeRef: e.target.value,
                } as Partial<ServiceBoundaryBlock>)
              }
              style={selectStyle}
            >
              <option value="">Select compute resource</option>
              {computeInfraIds.map((compute) => (
                <option key={compute.id} value={compute.id}>
                  {compute.label} ({compute.id})
                </option>
              ))}
            </select>
          </div>

          <div style={sectionStyle}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Communication Rules</div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                color: "var(--secondary)",
                marginBottom: 6,
              }}
            >
              <input
                type="checkbox"
                checked={
                  (nodeData as ServiceBoundaryBlock).communication
                    ?.allowApiCalls ?? true
                }
                onChange={(e) =>
                  handleUpdate({
                    communication: {
                      ...(nodeData as ServiceBoundaryBlock).communication,
                      allowApiCalls: e.target.checked,
                    },
                  } as Partial<ServiceBoundaryBlock>)
                }
                style={{ accentColor: "var(--primary)" }}
              />
              Allow API calls
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                color: "var(--secondary)",
                marginBottom: 6,
              }}
            >
              <input
                type="checkbox"
                checked={
                  (nodeData as ServiceBoundaryBlock).communication
                    ?.allowQueueEvents ?? true
                }
                onChange={(e) =>
                  handleUpdate({
                    communication: {
                      ...(nodeData as ServiceBoundaryBlock).communication,
                      allowQueueEvents: e.target.checked,
                    },
                  } as Partial<ServiceBoundaryBlock>)
                }
                style={{ accentColor: "var(--primary)" }}
              />
              Allow queue events
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                color: "var(--secondary)",
                marginBottom: 6,
              }}
            >
              <input
                type="checkbox"
                checked={
                  (nodeData as ServiceBoundaryBlock).communication
                    ?.allowEventBus ?? true
                }
                onChange={(e) =>
                  handleUpdate({
                    communication: {
                      ...(nodeData as ServiceBoundaryBlock).communication,
                      allowEventBus: e.target.checked,
                    },
                  } as Partial<ServiceBoundaryBlock>)
                }
                style={{ accentColor: "var(--primary)" }}
              />
              Allow event bus
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                color: "#fca5a5",
              }}
            >
              <input
                type="checkbox"
                checked={
                  (nodeData as ServiceBoundaryBlock).communication
                    ?.allowDirectDbAccess ?? false
                }
                onChange={(e) =>
                  handleUpdate({
                    communication: {
                      ...(nodeData as ServiceBoundaryBlock).communication,
                      allowDirectDbAccess: e.target.checked,
                    },
                  } as Partial<ServiceBoundaryBlock>)
                }
                style={{ accentColor: "#ef4444" }}
              />
              Allow direct DB sharing (not recommended)
            </label>
          </div>

          <div style={sectionStyle}>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Available IDs</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>
              APIs: {allApiIds.map((item) => item.id).join(", ") || "(none)"}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              Functions: {allFunctionIds.map((item) => item.id).join(", ") || "(none)"}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              Data: {allDataIds.map((item) => item.id).join(", ") || "(none)"}
            </div>
          </div>
        </>
      )}

      {/* Infra-specific fields */}
      {kind === "infra" && (
        <>
          <div style={sectionStyle}>
            <div style={labelStyle}>Provider</div>
            <select
              value={(nodeData as InfraBlock).provider}
              onChange={(e) =>
                handleUpdate({
                  provider: e.target.value,
                } as Partial<InfraBlock>)
              }
              style={selectStyle}
            >
              <option value="aws">AWS</option>
              <option value="gcp">Google Cloud</option>
              <option value="azure">Azure</option>
              <option value="generic">Generic</option>
            </select>
          </div>

          <div>
            <div style={labelStyle}>Environment</div>
            <select
              value={(nodeData as InfraBlock).environment}
              onChange={(e) =>
                handleUpdate({
                  environment: e.target.value,
                } as Partial<InfraBlock>)
              }
              style={selectStyle}
            >
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="preview">Preview</option>
              <option value="dev">Dev</option>
            </select>
          </div>

          <div>
            <div style={labelStyle}>Region</div>
            <input
              type="text"
              value={(nodeData as InfraBlock).region}
              onChange={(e) =>
                handleUpdate({
                  region: e.target.value,
                } as Partial<InfraBlock>)
              }
              placeholder="us-east-1"
              style={inputStyle}
            />
          </div>

          <div>
            <div style={labelStyle}>Tags (comma-separated)</div>
            <input
              type="text"
              value={((nodeData as InfraBlock).tags || []).join(", ")}
              onChange={(e) =>
                handleUpdate({
                  tags: e.target.value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                } as Partial<InfraBlock>)
              }
              placeholder="env=prod, owner=platform"
              style={inputStyle}
            />
          </div>

          <div style={sectionStyle}>
            <div style={labelStyle}>Resource Type</div>
            <div style={{ fontSize: 12, color: "var(--secondary)" }}>
              {(nodeData as InfraBlock).resourceType.replace("_", " ")}
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={labelStyle}>
              {infraFieldSets[(nodeData as InfraBlock).resourceType].title}
            </div>
            {infraFieldSets[(nodeData as InfraBlock).resourceType].fields.map(
              (field) => {
                const config = (nodeData as InfraBlock).config as Record<
                  string,
                  string | number | boolean
                >;
                const value = config[field.key];

                if (field.type === "boolean") {
                  return (
                    <label
                      key={field.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11,
                        color: "var(--secondary)",
                        marginBottom: 6,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(e) =>
                          handleUpdate({
                            config: {
                              ...(nodeData as InfraBlock).config,
                              [field.key]: e.target.checked,
                            },
                          } as Partial<InfraBlock>)
                        }
                        style={{ accentColor: "var(--primary)" }}
                      />
                      {field.label}
                    </label>
                  );
                }

                if (field.type === "select") {
                  return (
                    <div key={field.key} style={{ marginBottom: 8 }}>
                      <div style={labelStyle}>{field.label}</div>
                      <select
                        value={String(value ?? "")}
                        onChange={(e) =>
                          handleUpdate({
                            config: {
                              ...(nodeData as InfraBlock).config,
                              [field.key]: e.target.value,
                            },
                          } as Partial<InfraBlock>)
                        }
                        style={selectStyle}
                      >
                        {(field.options || []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }

                return (
                  <div key={field.key} style={{ marginBottom: 8 }}>
                    <div style={labelStyle}>{field.label}</div>
                    <input
                      type={field.type === "number" ? "number" : "text"}
                      value={
                        typeof value === "number" || typeof value === "string"
                          ? value
                          : ""
                      }
                      onChange={(e) => {
                        const nextValue =
                          field.type === "number"
                            ? Number(e.target.value || 0)
                            : e.target.value;
                        handleUpdate({
                          config: {
                            ...(nodeData as InfraBlock).config,
                            [field.key]: nextValue,
                          },
                        } as Partial<InfraBlock>);
                      }}
                      placeholder={field.placeholder}
                      style={inputStyle}
                    />
                  </div>
                );
              },
            )}
          </div>
        </>
      )}

      {/* Interface block-specific fields */}
      {kind === "api_binding" && (
        <>
          {/* Protocol */}
          <div style={sectionStyle}>
            <div style={labelStyle}>Protocol</div>
            <select
              value={apiProtocol}
              onChange={(e) => {
                const nextProtocol = e.target.value as
                  | "rest"
                  | "ws"
                  | "socket.io"
                  | "webrtc"
                  | "graphql"
                  | "grpc"
                  | "sse"
                  | "webhook";

                if (nextProtocol === "rest") {
                  handleUpdate({
                    protocol: "rest",
                    apiType: "openapi",
                    instance: undefined,
                    method: "GET",
                    route: "/api/resource",
                    request: {
                      pathParams: [],
                      queryParams: [],
                      headers: [],
                      body: { contentType: "application/json", schema: [] },
                    },
                    responses: {
                      success: { statusCode: 200, schema: [] },
                      error: { statusCode: 400, schema: [] },
                    },
                    security: { type: "none", scopes: [] },
                    rateLimit: {
                      enabled: false,
                      requests: 100,
                      window: "minute",
                    },
                  } as Partial<ApiBinding>);
                  return;
                }

                const instanceDefaults =
                  nextProtocol === "ws"
                    ? {
                      protocol: "ws" as const,
                      config: {
                        endpoint: "/ws/events",
                        pingIntervalSec: 20,
                        pingTimeoutSec: 10,
                        maxMessageSizeKb: 256,
                        maxConnections: 5000,
                        auth: { type: "none" as const, scopes: [] as string[] },
                        rateLimit: {
                          enabled: false,
                          requests: 100,
                          window: "minute" as const,
                        },
                      },
                    }
                    : nextProtocol === "socket.io"
                      ? {
                        protocol: "socket.io" as const,
                        config: {
                          endpoint: "/socket.io",
                          namespaces: ["/"],
                          rooms: [],
                          events: [],
                          ackTimeoutMs: 5000,
                          auth: { type: "none" as const, scopes: [] as string[] },
                          rateLimit: {
                            enabled: false,
                            requests: 100,
                            window: "minute" as const,
                          },
                        },
                      }
                      : nextProtocol === "webrtc"
                        ? {
                          protocol: "webrtc" as const,
                          config: {
                            signalingTransportRef: "api_ws_signaling",
                            stunServers: ["stun:stun.l.google.com:19302"],
                            turnServers: [],
                            peerLimit: 4,
                            topology: "p2p" as const,
                          },
                        }
                        : nextProtocol === "graphql"
                          ? {
                            protocol: "graphql" as const,
                            config: {
                              endpoint: "/graphql",
                              schemaSDL: "type Query { health: String! }",
                              operations: {
                                queries: true,
                                mutations: true,
                                subscriptions: true,
                              },
                            },
                          }
                          : nextProtocol === "grpc"
                            ? {
                              protocol: "grpc" as const,
                              config: {
                                protobufDefinition:
                                  "syntax = \"proto3\";\nservice ApiService { rpc Execute (ExecuteRequest) returns (ExecuteResponse); }\nmessage ExecuteRequest { string id = 1; }\nmessage ExecuteResponse { string status = 1; }",
                                service: "ApiService",
                                rpcMethods: [{ name: "Execute", type: "unary" as const }],
                              },
                            }
                            : nextProtocol === "sse"
                              ? {
                                protocol: "sse" as const,
                                config: {
                                  endpoint: "/events",
                                  eventName: "update",
                                  retryMs: 5000,
                                  heartbeatSec: 30,
                                  direction: "server_to_client" as const,
                                },
                              }
                              : {
                                protocol: "webhook" as const,
                                config: {
                                  endpoint: "/webhooks/incoming",
                                  signatureVerification: {
                                    enabled: true,
                                    headerName: "X-Signature",
                                    secretRef: "WEBHOOK_SECRET",
                                  },
                                  retryPolicy: {
                                    enabled: true,
                                    maxAttempts: 5,
                                    backoff: "exponential" as const,
                                  },
                                },
                              };

                handleUpdate({
                  protocol: nextProtocol,
                  apiType:
                    nextProtocol === "ws" ||
                      nextProtocol === "socket.io" ||
                      nextProtocol === "webrtc" ||
                      nextProtocol === "sse"
                      ? "asyncapi"
                      : "openapi",
                  method: undefined,
                  route: undefined,
                  request: undefined,
                  responses: undefined,
                  security: undefined,
                  rateLimit: undefined,
                  instance: instanceDefaults,
                } as Partial<ApiBinding>);
              }}
              style={selectStyle}
            >
              <option value="rest">REST</option>
              <option value="ws">WebSocket</option>
              <option value="socket.io">Socket.IO</option>
              <option value="webrtc">WebRTC</option>
              <option value="graphql">GraphQL</option>
              <option value="grpc">gRPC</option>
              <option value="sse">SSE</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>

          {isRestProtocol ? (
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ width: 100 }}>
                <div style={labelStyle}>Method</div>
                <select
                  value={(nodeData as ApiBinding).method}
                  onChange={(e) =>
                    handleUpdate({
                      method: e.target.value,
                    } as Partial<ApiBinding>)
                  }
                  style={selectStyle}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Route</div>
                <input
                  type="text"
                  value={(nodeData as ApiBinding).route || ""}
                  onChange={(e) =>
                    handleUpdate({ route: e.target.value } as Partial<ApiBinding>)
                  }
                  placeholder="/api/resource"
                  style={inputStyle}
                />
              </div>
            </div>
          ) : (
            <div style={sectionStyle}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>
                Protocol Config
              </div>

              {(isWsProtocol || isSocketIOProtocol) && (
                <div style={{ marginBottom: 8 }}>
                  <div style={labelStyle}>Endpoint</div>
                  <input
                    type="text"
                    value={(apiNode?.instance?.config as { endpoint?: string } | undefined)?.endpoint || ""}
                    onChange={(e) =>
                      handleUpdate({
                        instance: {
                          ...(apiNode?.instance as object),
                          config: {
                            ...(apiNode?.instance?.config as object),
                            endpoint: e.target.value,
                          },
                        },
                      } as Partial<ApiBinding>)
                    }
                    placeholder={isSocketIOProtocol ? "/socket.io" : "/ws/events"}
                    style={inputStyle}
                  />
                </div>
              )}

              {isWsProtocol && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={labelStyle}>Ping Interval (sec)</div>
                      <input
                        type="number"
                        value={(apiNode?.instance?.config as { pingIntervalSec?: number } | undefined)?.pingIntervalSec || 20}
                        onChange={(e) =>
                          handleUpdate({
                            instance: {
                              ...(apiNode?.instance as object),
                              config: {
                                ...(apiNode?.instance?.config as object),
                                pingIntervalSec: Number(e.target.value || 20),
                              },
                            },
                          } as Partial<ApiBinding>)
                        }
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <div style={labelStyle}>Ping Timeout (sec)</div>
                      <input
                        type="number"
                        value={(apiNode?.instance?.config as { pingTimeoutSec?: number } | undefined)?.pingTimeoutSec || 10}
                        onChange={(e) =>
                          handleUpdate({
                            instance: {
                              ...(apiNode?.instance as object),
                              config: {
                                ...(apiNode?.instance?.config as object),
                                pingTimeoutSec: Number(e.target.value || 10),
                              },
                            },
                          } as Partial<ApiBinding>)
                        }
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                    <div>
                      <div style={labelStyle}>Max Size (KB)</div>
                      <input
                        type="number"
                        value={(apiNode?.instance?.config as { maxMessageSizeKb?: number } | undefined)?.maxMessageSizeKb || 256}
                        onChange={(e) =>
                          handleUpdate({
                            instance: {
                              ...(apiNode?.instance as object),
                              config: {
                                ...(apiNode?.instance?.config as object),
                                maxMessageSizeKb: Number(e.target.value || 256),
                              },
                            },
                          } as Partial<ApiBinding>)
                        }
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <div style={labelStyle}>Max Connections</div>
                      <input
                        type="number"
                        value={(apiNode?.instance?.config as { maxConnections?: number } | undefined)?.maxConnections || 5000}
                        onChange={(e) =>
                          handleUpdate({
                            instance: {
                              ...(apiNode?.instance as object),
                              config: {
                                ...(apiNode?.instance?.config as object),
                                maxConnections: Number(e.target.value || 5000),
                              },
                            },
                          } as Partial<ApiBinding>)
                        }
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </>
              )}

              {isSocketIOProtocol && (
                <>
                  <div style={{ marginTop: 8 }}>
                    <div style={labelStyle}>Namespaces (comma-separated)</div>
                    <input
                      type="text"
                      value={((apiNode?.instance?.config as { namespaces?: string[] } | undefined)?.namespaces || []).join(", ")}
                      onChange={(e) =>
                        handleUpdate({
                          instance: {
                            ...(apiNode?.instance as object),
                            config: {
                              ...(apiNode?.instance?.config as object),
                              namespaces: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                            },
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={labelStyle}>Rooms (comma-separated)</div>
                    <input
                      type="text"
                      value={((apiNode?.instance?.config as { rooms?: string[] } | undefined)?.rooms || []).join(", ")}
                      onChange={(e) =>
                        handleUpdate({
                          instance: {
                            ...(apiNode?.instance as object),
                            config: {
                              ...(apiNode?.instance?.config as object),
                              rooms: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                            },
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={labelStyle}>Events (comma-separated)</div>
                    <input
                      type="text"
                      value={((apiNode?.instance?.config as { events?: string[] } | undefined)?.events || []).join(", ")}
                      onChange={(e) =>
                        handleUpdate({
                          instance: {
                            ...(apiNode?.instance as object),
                            config: {
                              ...(apiNode?.instance?.config as object),
                              events: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                            },
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={labelStyle}>Ack Timeout (ms)</div>
                    <input
                      type="number"
                      value={(apiNode?.instance?.config as { ackTimeoutMs?: number } | undefined)?.ackTimeoutMs || 5000}
                      onChange={(e) =>
                        handleUpdate({
                          instance: {
                            ...(apiNode?.instance as object),
                            config: {
                              ...(apiNode?.instance?.config as object),
                              ackTimeoutMs: Number(e.target.value || 5000),
                            },
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={inputStyle}
                    />
                  </div>
                </>
              )}

              {isWebRtcProtocol && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <div style={labelStyle}>Signaling Transport Reference</div>
                    <input
                      type="text"
                      value={(apiNode?.instance?.config as { signalingTransportRef?: string } | undefined)?.signalingTransportRef || ""}
                      onChange={(e) =>
                        handleUpdate({
                          instance: {
                            ...(apiNode?.instance as object),
                            config: {
                              ...(apiNode?.instance?.config as object),
                              signalingTransportRef: e.target.value,
                            },
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={{
                        ...inputStyle,
                        borderColor:
                          ((apiNode?.instance?.config as { signalingTransportRef?: string } | undefined)?.signalingTransportRef || "").trim()
                            ? "var(--border)"
                            : "var(--destructive)",
                      }}
                    />
                    {!((apiNode?.instance?.config as { signalingTransportRef?: string } | undefined)?.signalingTransportRef || "").trim() && (
                      <div style={{ fontSize: 10, color: "var(--destructive)", marginTop: 4 }}>
                        WebRTC requires signaling transport reference.
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={labelStyle}>STUN Servers (comma-separated)</div>
                    <input
                      type="text"
                      value={((apiNode?.instance?.config as { stunServers?: string[] } | undefined)?.stunServers || []).join(", ")}
                      onChange={(e) =>
                        handleUpdate({
                          instance: {
                            ...(apiNode?.instance as object),
                            config: {
                              ...(apiNode?.instance?.config as object),
                              stunServers: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                            },
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={labelStyle}>TURN Servers (comma-separated)</div>
                    <input
                      type="text"
                      value={((apiNode?.instance?.config as { turnServers?: string[] } | undefined)?.turnServers || []).join(", ")}
                      onChange={(e) =>
                        handleUpdate({
                          instance: {
                            ...(apiNode?.instance as object),
                            config: {
                              ...(apiNode?.instance?.config as object),
                              turnServers: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                            },
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                    <div>
                      <div style={labelStyle}>Peer Limit</div>
                      <input
                        type="number"
                        value={(apiNode?.instance?.config as { peerLimit?: number } | undefined)?.peerLimit || 4}
                        onChange={(e) =>
                          handleUpdate({
                            instance: {
                              ...(apiNode?.instance as object),
                              config: {
                                ...(apiNode?.instance?.config as object),
                                peerLimit: Number(e.target.value || 4),
                              },
                            },
                          } as Partial<ApiBinding>)
                        }
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <div style={labelStyle}>Topology</div>
                      <input
                        type="text"
                        value="p2p"
                        disabled
                        style={{ ...inputStyle, opacity: 0.85, cursor: "not-allowed" }}
                      />
                    </div>
                  </div>
                </>
              )}

              {isGraphqlProtocol && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <div style={labelStyle}>Endpoint</div>
                    <input
                      type="text"
                      value={(apiNode?.instance?.config as { endpoint?: string } | undefined)?.endpoint || ""}
                      onChange={(e) =>
                        handleUpdate({
                          instance: {
                            ...(apiNode?.instance as object),
                            config: {
                              ...(apiNode?.instance?.config as object),
                              endpoint: e.target.value,
                            },
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <div style={labelStyle}>Schema SDL</div>
                    <textarea
                      value={(apiNode?.instance?.config as { schemaSDL?: string } | undefined)?.schemaSDL || ""}
                      onChange={(e) =>
                        handleUpdate({
                          instance: {
                            ...(apiNode?.instance as object),
                            config: {
                              ...(apiNode?.instance?.config as object),
                              schemaSDL: e.target.value,
                            },
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={{ ...inputStyle, minHeight: 90, resize: "vertical", fontFamily: "monospace" }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      { key: "queries", label: "Queries" },
                      { key: "mutations", label: "Mutations" },
                      { key: "subscriptions", label: "Subscriptions" },
                    ].map((op) => (
                      <label
                        key={op.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 11,
                          color: "var(--secondary)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            Boolean(
                              (apiNode?.instance?.config as {
                                operations?: Record<string, boolean>;
                              } | undefined)?.operations?.[op.key],
                            )
                          }
                          onChange={(e) =>
                            handleUpdate({
                              instance: {
                                ...(apiNode?.instance as object),
                                config: {
                                  ...(apiNode?.instance?.config as object),
                                  operations: {
                                    ...((apiNode?.instance?.config as { operations?: object } | undefined)
                                      ?.operations as object),
                                    [op.key]: e.target.checked,
                                  },
                                },
                              },
                            } as Partial<ApiBinding>)
                          }
                          style={{ accentColor: "var(--primary)" }}
                        />
                        {op.label}
                      </label>
                    ))}
                  </div>
                </>
              )}

              {isGrpcProtocol && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <div style={labelStyle}>Service</div>
                    <input
                      type="text"
                      value={(apiNode?.instance?.config as { service?: string } | undefined)?.service || ""}
                      onChange={(e) =>
                        handleUpdate({
                          instance: {
                            ...(apiNode?.instance as object),
                            config: {
                              ...(apiNode?.instance?.config as object),
                              service: e.target.value,
                            },
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <div style={labelStyle}>RPC Methods (name:type, comma-separated)</div>
                    <input
                      type="text"
                      value={((apiNode?.instance?.config as { rpcMethods?: Array<{ name?: string; type?: string }> } | undefined)?.rpcMethods || [])
                        .map((method) => `${method.name || ""}:${method.type || "unary"}`)
                        .join(", ")}
                      onChange={(e) =>
                        handleUpdate({
                          instance: {
                            ...(apiNode?.instance as object),
                            config: {
                              ...(apiNode?.instance?.config as object),
                              rpcMethods: e.target.value
                                .split(",")
                                .map((entry) => entry.trim())
                                .filter(Boolean)
                                .map((entry) => {
                                  const [rawName, rawType] = entry.split(":").map((v) => v.trim());
                                  const type = rawType || "unary";
                                  const normalizedType =
                                    type === "server_stream" ||
                                      type === "client_stream" ||
                                      type === "bidirectional_stream"
                                      ? type
                                      : "unary";
                                  return {
                                    name: rawName || "Method",
                                    type: normalizedType,
                                  };
                                }),
                            },
                          },
                        } as Partial<ApiBinding>)
                      }
                      placeholder="Execute:unary, StreamUpdates:server_stream"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <div style={labelStyle}>Protobuf Definition</div>
                    <textarea
                      value={
                        (apiNode?.instance?.config as { protobufDefinition?: string } | undefined)
                          ?.protobufDefinition || ""
                      }
                      onChange={(e) =>
                        handleUpdate({
                          instance: {
                            ...(apiNode?.instance as object),
                            config: {
                              ...(apiNode?.instance?.config as object),
                              protobufDefinition: e.target.value,
                            },
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={{ ...inputStyle, minHeight: 120, resize: "vertical", fontFamily: "monospace" }}
                    />
                  </div>
                </>
              )}

              {isSseProtocol && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <div style={labelStyle}>Endpoint</div>
                    <input
                      type="text"
                      value={(apiNode?.instance?.config as { endpoint?: string } | undefined)?.endpoint || ""}
                      onChange={(e) =>
                        handleUpdate({
                          instance: {
                            ...(apiNode?.instance as object),
                            config: {
                              ...(apiNode?.instance?.config as object),
                              endpoint: e.target.value,
                            },
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={labelStyle}>Event Name</div>
                    <input
                      type="text"
                      value={(apiNode?.instance?.config as { eventName?: string } | undefined)?.eventName || ""}
                      onChange={(e) =>
                        handleUpdate({
                          instance: {
                            ...(apiNode?.instance as object),
                            config: {
                              ...(apiNode?.instance?.config as object),
                              eventName: e.target.value,
                            },
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={labelStyle}>Retry (ms)</div>
                      <input
                        type="number"
                        value={(apiNode?.instance?.config as { retryMs?: number } | undefined)?.retryMs || 5000}
                        onChange={(e) =>
                          handleUpdate({
                            instance: {
                              ...(apiNode?.instance as object),
                              config: {
                                ...(apiNode?.instance?.config as object),
                                retryMs: Number(e.target.value || 5000),
                              },
                            },
                          } as Partial<ApiBinding>)
                        }
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <div style={labelStyle}>Heartbeat (sec)</div>
                      <input
                        type="number"
                        value={(apiNode?.instance?.config as { heartbeatSec?: number } | undefined)?.heartbeatSec || 30}
                        onChange={(e) =>
                          handleUpdate({
                            instance: {
                              ...(apiNode?.instance as object),
                              config: {
                                ...(apiNode?.instance?.config as object),
                                heartbeatSec: Number(e.target.value || 30),
                              },
                            },
                          } as Partial<ApiBinding>)
                        }
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={labelStyle}>Direction</div>
                    <input
                      type="text"
                      value="server_to_client"
                      disabled
                      style={{ ...inputStyle, opacity: 0.85, cursor: "not-allowed" }}
                    />
                  </div>
                </>
              )}

              {isWebhookProtocol && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <div style={labelStyle}>Endpoint</div>
                    <input
                      type="text"
                      value={(apiNode?.instance?.config as { endpoint?: string } | undefined)?.endpoint || ""}
                      onChange={(e) =>
                        handleUpdate({
                          instance: {
                            ...(apiNode?.instance as object),
                            config: {
                              ...(apiNode?.instance?.config as object),
                              endpoint: e.target.value,
                            },
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div style={sectionStyle}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11,
                        color: "var(--secondary)",
                        marginBottom: 8,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={
                          (apiNode?.instance?.config as {
                            signatureVerification?: { enabled?: boolean };
                          } | undefined)?.signatureVerification?.enabled || false
                        }
                        onChange={(e) =>
                          handleUpdate({
                            instance: {
                              ...(apiNode?.instance as object),
                              config: {
                                ...(apiNode?.instance?.config as object),
                                signatureVerification: {
                                  ...((apiNode?.instance?.config as {
                                    signatureVerification?: object;
                                  } | undefined)?.signatureVerification as object),
                                  enabled: e.target.checked,
                                },
                              },
                            },
                          } as Partial<ApiBinding>)
                        }
                        style={{ accentColor: "var(--primary)" }}
                      />
                      Enable Signature Verification
                    </label>

                    {(apiNode?.instance?.config as {
                      signatureVerification?: { enabled?: boolean };
                    } | undefined)?.signatureVerification?.enabled && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                          <div>
                            <div style={labelStyle}>Header Name</div>
                            <input
                              type="text"
                              value={
                                (apiNode?.instance?.config as {
                                  signatureVerification?: { headerName?: string };
                                } | undefined)?.signatureVerification?.headerName || ""
                              }
                              onChange={(e) =>
                                handleUpdate({
                                  instance: {
                                    ...(apiNode?.instance as object),
                                    config: {
                                      ...(apiNode?.instance?.config as object),
                                      signatureVerification: {
                                        ...((apiNode?.instance?.config as {
                                          signatureVerification?: object;
                                        } | undefined)?.signatureVerification as object),
                                        headerName: e.target.value,
                                      },
                                    },
                                  },
                                } as Partial<ApiBinding>)
                              }
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <div style={labelStyle}>Secret Ref</div>
                            <input
                              type="text"
                              value={
                                (apiNode?.instance?.config as {
                                  signatureVerification?: { secretRef?: string };
                                } | undefined)?.signatureVerification?.secretRef || ""
                              }
                              onChange={(e) =>
                                handleUpdate({
                                  instance: {
                                    ...(apiNode?.instance as object),
                                    config: {
                                      ...(apiNode?.instance?.config as object),
                                      signatureVerification: {
                                        ...((apiNode?.instance?.config as {
                                          signatureVerification?: object;
                                        } | undefined)?.signatureVerification as object),
                                        secretRef: e.target.value,
                                      },
                                    },
                                  },
                                } as Partial<ApiBinding>)
                              }
                              style={inputStyle}
                            />
                          </div>
                        </div>
                      )}
                  </div>

                  <div style={sectionStyle}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11,
                        color: "var(--secondary)",
                        marginBottom: 8,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={
                          (apiNode?.instance?.config as {
                            retryPolicy?: { enabled?: boolean };
                          } | undefined)?.retryPolicy?.enabled || false
                        }
                        onChange={(e) =>
                          handleUpdate({
                            instance: {
                              ...(apiNode?.instance as object),
                              config: {
                                ...(apiNode?.instance?.config as object),
                                retryPolicy: {
                                  ...((apiNode?.instance?.config as {
                                    retryPolicy?: object;
                                  } | undefined)?.retryPolicy as object),
                                  enabled: e.target.checked,
                                },
                              },
                            },
                          } as Partial<ApiBinding>)
                        }
                        style={{ accentColor: "var(--primary)" }}
                      />
                      Enable Retry Policy
                    </label>

                    {(apiNode?.instance?.config as {
                      retryPolicy?: { enabled?: boolean };
                    } | undefined)?.retryPolicy?.enabled && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <div style={labelStyle}>Max Attempts</div>
                            <input
                              type="number"
                              value={
                                (apiNode?.instance?.config as {
                                  retryPolicy?: { maxAttempts?: number };
                                } | undefined)?.retryPolicy?.maxAttempts || 5
                              }
                              onChange={(e) =>
                                handleUpdate({
                                  instance: {
                                    ...(apiNode?.instance as object),
                                    config: {
                                      ...(apiNode?.instance?.config as object),
                                      retryPolicy: {
                                        ...((apiNode?.instance?.config as {
                                          retryPolicy?: object;
                                        } | undefined)?.retryPolicy as object),
                                        maxAttempts: Number(e.target.value || 5),
                                      },
                                    },
                                  },
                                } as Partial<ApiBinding>)
                              }
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <div style={labelStyle}>Backoff</div>
                            <select
                              value={
                                (apiNode?.instance?.config as {
                                  retryPolicy?: { backoff?: string };
                                } | undefined)?.retryPolicy?.backoff || "exponential"
                              }
                              onChange={(e) =>
                                handleUpdate({
                                  instance: {
                                    ...(apiNode?.instance as object),
                                    config: {
                                      ...(apiNode?.instance?.config as object),
                                      retryPolicy: {
                                        ...((apiNode?.instance?.config as {
                                          retryPolicy?: object;
                                        } | undefined)?.retryPolicy as object),
                                        backoff: e.target.value,
                                      },
                                    },
                                  },
                                } as Partial<ApiBinding>)
                              }
                              style={selectStyle}
                            >
                              <option value="fixed">Fixed</option>
                              <option value="linear">Linear</option>
                              <option value="exponential">Exponential</option>
                            </select>
                          </div>
                        </div>
                      )}
                  </div>
                </>
              )}
            </div>
          )}

          {(isWsProtocol || isSocketIOProtocol) && (
            <>
              <div style={sectionStyle}>
                <div style={labelStyle}>Auth</div>
                <select
                  value={
                    (apiNode?.instance?.config as { auth?: { type?: string } } | undefined)?.auth?.type ||
                    "none"
                  }
                  onChange={(e) =>
                    handleUpdate({
                      instance: {
                        ...(apiNode?.instance as object),
                        config: {
                          ...(apiNode?.instance?.config as object),
                          auth: {
                            ...((apiNode?.instance?.config as { auth?: object } | undefined)?.auth as object),
                            type: e.target.value,
                          },
                        },
                      },
                    } as Partial<ApiBinding>)
                  }
                  style={selectStyle}
                >
                  <option value="none">None</option>
                  <option value="api_key">API Key</option>
                  <option value="bearer">Bearer</option>
                  <option value="oauth2">OAuth2</option>
                  <option value="basic">Basic</option>
                </select>
              </div>

              <div style={sectionStyle}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    color: "var(--secondary)",
                    marginBottom: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      (apiNode?.instance?.config as { rateLimit?: { enabled?: boolean } } | undefined)?.rateLimit
                        ?.enabled || false
                    }
                    onChange={(e) =>
                      handleUpdate({
                        instance: {
                          ...(apiNode?.instance as object),
                          config: {
                            ...(apiNode?.instance?.config as object),
                            rateLimit: {
                              ...((apiNode?.instance?.config as { rateLimit?: object } | undefined)
                                ?.rateLimit as object),
                              enabled: e.target.checked,
                            },
                          },
                        },
                      } as Partial<ApiBinding>)
                    }
                    style={{ accentColor: "var(--primary)" }}
                  />
                  Enable Rate Limiting
                </label>
                {(apiNode?.instance?.config as { rateLimit?: { enabled?: boolean } } | undefined)?.rateLimit
                  ?.enabled && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={labelStyle}>Requests</div>
                        <input
                          type="number"
                          value={
                            (apiNode?.instance?.config as {
                              rateLimit?: { requests?: number };
                            } | undefined)?.rateLimit?.requests || 100
                          }
                          onChange={(e) =>
                            handleUpdate({
                              instance: {
                                ...(apiNode?.instance as object),
                                config: {
                                  ...(apiNode?.instance?.config as object),
                                  rateLimit: {
                                    ...((apiNode?.instance?.config as { rateLimit?: object } | undefined)
                                      ?.rateLimit as object),
                                    requests: Number(e.target.value || 100),
                                  },
                                },
                              },
                            } as Partial<ApiBinding>)
                          }
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={labelStyle}>Per</div>
                        <select
                          value={
                            (apiNode?.instance?.config as {
                              rateLimit?: { window?: string };
                            } | undefined)?.rateLimit?.window || "minute"
                          }
                          onChange={(e) =>
                            handleUpdate({
                              instance: {
                                ...(apiNode?.instance as object),
                                config: {
                                  ...(apiNode?.instance?.config as object),
                                  rateLimit: {
                                    ...((apiNode?.instance?.config as { rateLimit?: object } | undefined)
                                      ?.rateLimit as object),
                                    window: e.target.value,
                                  },
                                },
                              },
                            } as Partial<ApiBinding>)
                          }
                          style={selectStyle}
                        >
                          <option value="second">Second</option>
                          <option value="minute">Minute</option>
                          <option value="hour">Hour</option>
                          <option value="day">Day</option>
                        </select>
                      </div>
                    </div>
                  )}
              </div>
            </>
          )}

          {/* Version & Deprecated */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ width: 80 }}>
              <div style={labelStyle}>Version</div>
              <input
                type="text"
                value={(nodeData as ApiBinding).version}
                onChange={(e) =>
                  handleUpdate({
                    version: e.target.value,
                  } as Partial<ApiBinding>)
                }
                placeholder="v1"
                style={inputStyle}
              />
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: "var(--secondary)",
                padding: "8px 0",
              }}
            >
              <input
                type="checkbox"
                checked={(nodeData as ApiBinding).deprecated}
                onChange={(e) =>
                  handleUpdate({
                    deprecated: e.target.checked,
                  } as Partial<ApiBinding>)
                }
                style={{ accentColor: "#ef4444" }}
              />
              Deprecated
            </label>
          </div>

          {/* Security */}
          {isRestProtocol && (
            <div style={sectionStyle}>
              <div style={labelStyle}>Security</div>
              <select
                value={(nodeData as ApiBinding).security?.type || "none"}
                onChange={(e) =>
                  handleUpdate({
                    security: {
                      ...(nodeData as ApiBinding).security,
                      type: e.target.value as
                        | "none"
                        | "api_key"
                        | "bearer"
                        | "oauth2"
                        | "basic",
                    },
                  } as Partial<ApiBinding>)
                }
                style={selectStyle}
              >
                <option value="none">🔓 None</option>
                <option value="api_key">🔑 API Key</option>
                <option value="bearer">🎫 Bearer Token</option>
                <option value="oauth2">🔐 OAuth2</option>
                <option value="basic">👤 Basic Auth</option>
              </select>
              {(nodeData as ApiBinding).security?.type === "api_key" && (
                <div style={{ marginTop: 8 }}>
                  <div style={labelStyle}>Header Name</div>
                  <input
                    type="text"
                    value={(nodeData as ApiBinding).security?.headerName || ""}
                    onChange={(e) =>
                      handleUpdate({
                        security: {
                          ...(nodeData as ApiBinding).security,
                          headerName: e.target.value,
                        },
                      } as Partial<ApiBinding>)
                    }
                    placeholder="X-API-Key"
                    style={inputStyle}
                  />
                </div>
              )}
            </div>
          )}

          {/* Rate Limiting */}
          {isRestProtocol && (
            <div style={sectionStyle}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "var(--secondary)",
                  marginBottom: 8,
                }}
              >
                <input
                  type="checkbox"
                  checked={(nodeData as ApiBinding).rateLimit?.enabled || false}
                  onChange={(e) =>
                    handleUpdate({
                      rateLimit: {
                        ...(nodeData as ApiBinding).rateLimit,
                        enabled: e.target.checked,
                      },
                    } as Partial<ApiBinding>)
                  }
                  style={{ accentColor: "var(--primary)" }}
                />
                Enable Rate Limiting
              </label>
              {(nodeData as ApiBinding).rateLimit?.enabled && (
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Requests</div>
                    <input
                      type="number"
                      value={(nodeData as ApiBinding).rateLimit?.requests || 100}
                      onChange={(e) =>
                        handleUpdate({
                          rateLimit: {
                            ...(nodeData as ApiBinding).rateLimit,
                            requests: parseInt(e.target.value) || 100,
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Per</div>
                    <select
                      value={
                        (nodeData as ApiBinding).rateLimit?.window || "minute"
                      }
                      onChange={(e) =>
                        handleUpdate({
                          rateLimit: {
                            ...(nodeData as ApiBinding).rateLimit,
                            window: e.target.value as
                              | "second"
                              | "minute"
                              | "hour"
                              | "day",
                          },
                        } as Partial<ApiBinding>)
                      }
                      style={selectStyle}
                    >
                      <option value="second">Second</option>
                      <option value="minute">Minute</option>
                      <option value="hour">Hour</option>
                      <option value="day">Day</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Request Schema Tabs */}
          {isRestProtocol && (
            <div style={sectionStyle}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Request</div>

              {/* Tab Buttons */}
              <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>
                {(["body", "headers", "query"] as const).map((tab) => {
                  const showBody =
                    isWsProtocol ||
                    ["POST", "PUT", "PATCH"].includes(
                      (nodeData as ApiBinding).method || "",
                    );
                  if (tab === "body" && !showBody) return null;
                  if (isWsProtocol && tab === "query") return null;

                  const counts: Record<string, number> = {
                    body:
                      (nodeData as ApiBinding).request?.body?.schema?.length || 0,
                    headers:
                      (nodeData as ApiBinding).request?.headers?.length || 0,
                    query:
                      (nodeData as ApiBinding).request?.queryParams?.length || 0,
                    path:
                      (nodeData as ApiBinding).request?.pathParams?.length || 0,
                  };

                  return (
                    <button
                      key={tab}
                      onClick={() => setRequestTab(tab)}
                      style={{
                        flex: 1,
                        padding: "4px 8px",
                        background:
                          requestTab === tab ? "var(--floating)" : "transparent",
                        border:
                          requestTab === tab
                            ? "1px solid var(--border)"
                            : "1px solid transparent",
                        borderRadius: 4,
                        color:
                          requestTab === tab
                            ? "var(--secondary)"
                            : "var(--muted)",
                        fontSize: 10,
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {tab}{" "}
                      {counts[tab] > 0 && (
                        <span style={{ color: "var(--primary)" }}>
                          ({counts[tab]})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Body Tab */}
              {requestTab === "body" &&
                (isWsProtocol ||
                  ["POST", "PUT", "PATCH"].includes(
                    (nodeData as ApiBinding).method || "",
                  )) && (
                  <>
                    {((nodeData as ApiBinding).request?.body?.schema || []).map(
                      (field, i) => (
                        <TypeSchemaEditor
                          key={i}
                          field={field}
                          onChange={(updated) => {
                            const schema = [
                              ...((nodeData as ApiBinding).request?.body
                                ?.schema || []),
                            ];
                            schema[i] = updated as InputField;
                            handleUpdate({
                              request: {
                                ...(nodeData as ApiBinding).request,
                                body: {
                                  ...(nodeData as ApiBinding).request?.body,
                                  schema,
                                },
                              },
                            } as Partial<ApiBinding>);
                          }}
                          onRemove={() => {
                            const schema = (
                              (nodeData as ApiBinding).request?.body?.schema || []
                            ).filter((_, idx) => idx !== i);
                            handleUpdate({
                              request: {
                                ...(nodeData as ApiBinding).request,
                                body: {
                                  ...(nodeData as ApiBinding).request?.body,
                                  schema,
                                },
                              },
                            } as Partial<ApiBinding>);
                          }}
                        />
                      ),
                    )}
                    <button
                      onClick={() => {
                        const schema = [
                          ...((nodeData as ApiBinding).request?.body?.schema ||
                            []),
                          {
                            name: "field",
                            type: "string",
                            required: true,
                          } as InputField,
                        ];
                        handleUpdate({
                          request: {
                            ...(nodeData as ApiBinding).request,
                            body: {
                              ...(nodeData as ApiBinding).request?.body,
                              schema,
                            },
                          },
                        } as Partial<ApiBinding>);
                      }}
                      style={{
                        width: "100%",
                        padding: "6px",
                        background: "transparent",
                        border: "1px dashed var(--border)",
                        borderRadius: 4,
                        color: "var(--muted)",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      + Add Body Field
                    </button>
                  </>
                )}

              {/* Headers Tab */}
              {requestTab === "headers" && (
                <>
                  {((nodeData as ApiBinding).request?.headers || []).map(
                    (field, i) => (
                      <TypeSchemaEditor
                        key={i}
                        field={field}
                        onChange={(updated) => {
                          const headers = [
                            ...((nodeData as ApiBinding).request?.headers || []),
                          ];
                          headers[i] = updated as InputField;
                          handleUpdate({
                            request: {
                              ...(nodeData as ApiBinding).request,
                              headers,
                            },
                          } as Partial<ApiBinding>);
                        }}
                        onRemove={() => {
                          const headers = (
                            (nodeData as ApiBinding).request?.headers || []
                          ).filter((_, idx) => idx !== i);
                          handleUpdate({
                            request: {
                              ...(nodeData as ApiBinding).request,
                              headers,
                            },
                          } as Partial<ApiBinding>);
                        }}
                      />
                    ),
                  )}
                  <button
                    onClick={() => {
                      const headers = [
                        ...((nodeData as ApiBinding).request?.headers || []),
                        {
                          name: "Authorization",
                          type: "string",
                          required: true,
                        } as InputField,
                      ];
                      handleUpdate({
                        request: { ...(nodeData as ApiBinding).request, headers },
                      } as Partial<ApiBinding>);
                    }}
                    style={{
                      width: "100%",
                      padding: "6px",
                      background: "transparent",
                      border: "1px dashed var(--border)",
                      borderRadius: 4,
                      color: "var(--muted)",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    + Add Header
                  </button>
                </>
              )}

              {/* Query Tab */}
              {requestTab === "query" && !isWsProtocol && (
                <>
                  {((nodeData as ApiBinding).request?.queryParams || []).map(
                    (field, i) => (
                      <TypeSchemaEditor
                        key={i}
                        field={field}
                        onChange={(updated) => {
                          const queryParams = [
                            ...((nodeData as ApiBinding).request?.queryParams ||
                              []),
                          ];
                          queryParams[i] = updated as InputField;
                          handleUpdate({
                            request: {
                              ...(nodeData as ApiBinding).request,
                              queryParams,
                            },
                          } as Partial<ApiBinding>);
                        }}
                        onRemove={() => {
                          const queryParams = (
                            (nodeData as ApiBinding).request?.queryParams || []
                          ).filter((_, idx) => idx !== i);
                          handleUpdate({
                            request: {
                              ...(nodeData as ApiBinding).request,
                              queryParams,
                            },
                          } as Partial<ApiBinding>);
                        }}
                      />
                    ),
                  )}
                  <button
                    onClick={() => {
                      const queryParams = [
                        ...((nodeData as ApiBinding).request?.queryParams || []),
                        {
                          name: "page",
                          type: "number",
                          required: false,
                        } as InputField,
                      ];
                      handleUpdate({
                        request: {
                          ...(nodeData as ApiBinding).request,
                          queryParams,
                        },
                      } as Partial<ApiBinding>);
                    }}
                    style={{
                      width: "100%",
                      padding: "6px",
                      background: "transparent",
                      border: "1px dashed var(--border)",
                      borderRadius: 4,
                      color: "var(--muted)",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    + Add Query Param
                  </button>
                </>
              )}

              {/* Auto-detected Path Params from Route */}
              {(() => {
                const route = (nodeData as ApiBinding).route || "";
                const pathParams = route.match(/:(\w+)/g)?.map(p => p.slice(1)) || [];
                if (pathParams.length === 0) return null;
                return (
                  <div style={{ marginTop: 8, padding: 8, background: "var(--background)", borderRadius: 4 }}>
                    <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 6 }}>
                      📍 Path Params (from route):
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {pathParams.map(param => (
                        <span key={param} style={{ fontSize: 10, padding: "2px 6px", background: "var(--floating)", borderRadius: 3, color: "#facc15", fontFamily: "monospace" }}>
                          :{param}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Response Success Schema */}
          {isRestProtocol && (
            <div style={sectionStyle}>
              <div
                style={{
                  ...labelStyle,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span style={{ color: "#4ade80" }}>Response Schema</span>
                <span style={{ color: "var(--secondary)" }}>
                  {(nodeData as ApiBinding).responses?.success?.schema?.length ||
                    0}
                </span>
              </div>
              {((nodeData as ApiBinding).responses?.success?.schema || []).map(
                (field, i) => (
                  <TypeSchemaEditor
                    key={i}
                    field={field}
                    onChange={(updated) => {
                      const schema = [
                        ...((nodeData as ApiBinding).responses?.success?.schema ||
                          []),
                      ];
                      schema[i] = updated as OutputField;
                      handleUpdate({
                        responses: {
                          ...(nodeData as ApiBinding).responses,
                          success: {
                            ...(nodeData as ApiBinding).responses?.success,
                            schema,
                          },
                        },
                      } as Partial<ApiBinding>);
                    }}
                    onRemove={() => {
                      const schema = (
                        (nodeData as ApiBinding).responses?.success?.schema || []
                      ).filter((_, idx) => idx !== i);
                      handleUpdate({
                        responses: {
                          ...(nodeData as ApiBinding).responses,
                          success: {
                            ...(nodeData as ApiBinding).responses?.success,
                            schema,
                          },
                        },
                      } as Partial<ApiBinding>);
                    }}
                  />
                ),
              )}
              <button
                onClick={() => {
                  const schema = [
                    ...((nodeData as ApiBinding).responses?.success?.schema ||
                      []),
                    { name: "field", type: "string" } as OutputField,
                  ];
                  handleUpdate({
                    responses: {
                      ...(nodeData as ApiBinding).responses,
                      success: {
                        ...(nodeData as ApiBinding).responses?.success,
                        schema,
                      },
                    },
                  } as Partial<ApiBinding>);
                }}
                style={{
                  width: "100%",
                  padding: "6px",
                  background: "transparent",
                  border: "1px dashed var(--border)",
                  borderRadius: 4,
                  color: "var(--muted)",
                  fontSize: 11,
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                + Add Field
              </button>
              <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 8 }}>
                💡 Error responses (400, 404, 500) are auto-generated based on
                validation & database errors
              </div>
            </div>
          )}

          {/* Function Block Reference */}
          <div style={sectionStyle}>
            <div style={labelStyle}>Invokes Function Block</div>
            <input
              type="text"
              value={(nodeData as ApiBinding).processRef}
              onChange={(e) =>
                handleUpdate({
                  processRef: e.target.value,
                } as Partial<ApiBinding>)
              }
              placeholder="createUser"
              style={inputStyle}
            />
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              Reference to the function block this interface invokes
            </div>
          </div>
        </>
      )}

      {/* Delete Button */}
      <div style={{ marginTop: "auto", paddingTop: 16 }}>
        <button
          onClick={() => deleteNode(selectedNode.id)}
          style={{
            width: "100%",
            padding: "8px 12px",
            background: "transparent",
            border: "1px solid var(--destructive)",
            borderRadius: 4,
            color: "var(--destructive)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Delete Node
        </button>
      </div>
    </aside>
  );
}
