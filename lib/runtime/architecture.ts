import {
  ApiBinding,
  DatabaseBlock,
  InfraBlock,
  NodeData,
  ProcessDefinition,
  QueueBlock,
  ServiceBoundaryBlock,
} from "@/lib/schema/node";

export type WorkspaceGraphTab =
  | "api"
  | "infra"
  | "database"
  | "functions"
  | "agent"
  | "deploy";

type GraphNode = {
  id: string;
  type?: string;
  data: NodeData;
};

type GraphState = {
  nodes: GraphNode[];
  edges?: Array<{ source: string; target: string }>;
};

export type GraphCollection = Partial<Record<WorkspaceGraphTab, GraphState>>;

export type IssueSeverity = "error" | "warning";

export type ArchitectureIssue = {
  code: string;
  severity: IssueSeverity;
  message: string;
  refs?: string[];
};

export type WorkflowStageStatus = "complete" | "incomplete" | "blocked";

export type WorkflowStage = {
  id: string;
  title: string;
  status: WorkflowStageStatus;
  detail: string;
};

export type ServiceSummary = {
  id: string;
  label: string;
  apiCount: number;
  functionCount: number;
  dataCount: number;
  computeRef?: string;
};

export type DesignSystemReport = {
  runtimeModel: {
    dependencyDirection: "API -> Functional -> Data -> Infra";
    hostingLayer: "Infrastructure hosts all layers";
    layerCounts: {
      api: number;
      functional: number;
      data: number;
      infra: number;
      serviceBoundaries: number;
    };
    issues: ArchitectureIssue[];
  };
  workflowModel: {
    orderedSteps: string[];
    stages: WorkflowStage[];
  };
  serviceModel: {
    rules: string[];
    services: ServiceSummary[];
    issues: ArchitectureIssue[];
  };
  deploy: {
    ready: boolean;
    blockers: string[];
    errorCount: number;
    warningCount: number;
  };
};

const isApiBinding = (node: NodeData): node is ApiBinding =>
  node.kind === "api_binding";

const isProcess = (node: NodeData): node is ProcessDefinition =>
  node.kind === "process";

const isDatabase = (node: NodeData): node is DatabaseBlock =>
  node.kind === "database";

const isInfra = (node: NodeData): node is InfraBlock => node.kind === "infra";

const isQueue = (node: NodeData): node is QueueBlock => node.kind === "queue";

const isServiceBoundary = (node: NodeData): node is ServiceBoundaryBlock =>
  node.kind === "service_boundary";

const COMPUTE_RESOURCE_TYPES = new Set(["ec2", "lambda", "eks", "hpc"]);

const toNodeData = (graph?: GraphState): NodeData[] =>
  (graph?.nodes ?? []).map((node) => node.data);

const pushIssue = (
  target: ArchitectureIssue[],
  issue: ArchitectureIssue,
): void => {
  target.push(issue);
};

export const analyzeDesignSystem = (
  graphs: GraphCollection,
): DesignSystemReport => {
  const allNodeData = (
    ["api", "infra", "database", "functions", "agent", "deploy"] as const
  ).flatMap((tab) => toNodeData(graphs[tab]));
  const apiNodeData = toNodeData(graphs.api);
  const functionTabNodeData = toNodeData(graphs.functions);

  const apiBlocks = allNodeData.filter(isApiBinding);
  const allFunctionBlocks = allNodeData.filter(isProcess);
  const apiFunctionBlocks = apiNodeData.filter(isProcess);
  const businessFunctions = functionTabNodeData.filter(isProcess);
  const dataBlocks = allNodeData.filter(isDatabase);
  const infraBlocks = allNodeData.filter(isInfra);
  const queueBlocks = allNodeData.filter(isQueue);
  const serviceBoundaries = allNodeData.filter(isServiceBoundary);

  const computeBlocks = infraBlocks.filter((infra) =>
    COMPUTE_RESOURCE_TYPES.has(infra.resourceType),
  );

  const allFunctionById = new Map(allFunctionBlocks.map((fn) => [fn.id, fn]));
  const businessFunctionById = new Map(businessFunctions.map((fn) => [fn.id, fn]));
  const dataById = new Map(dataBlocks.map((db) => [db.id, db]));
  const apiById = new Map(apiBlocks.map((api) => [api.id, api]));
  const computeById = new Map(computeBlocks.map((infra) => [infra.id, infra]));
  const runtimeResourceIds = new Set([
    ...infraBlocks.map((infra) => infra.id),
    ...queueBlocks.map((queue) => queue.id),
    ...apiBlocks.map((api) => api.id),
  ]);

  const runtimeIssues: ArchitectureIssue[] = [];
  const serviceIssues: ArchitectureIssue[] = [];

  for (const api of apiBlocks) {
    const processRef = (api.processRef || "").trim();
    if (!processRef) {
      pushIssue(runtimeIssues, {
        code: "api.unbound_function",
        severity: "error",
        message: `API "${api.label || api.id}" is not bound to a function block`,
        refs: [api.id],
      });
      continue;
    }
    if (!allFunctionById.has(processRef)) {
      pushIssue(runtimeIssues, {
        code: "api.invalid_function_ref",
        severity: "error",
        message: `API "${api.label || api.id}" points to missing function "${processRef}"`,
        refs: [api.id, processRef],
      });
    }
  }

  for (const apiFunction of apiFunctionBlocks) {
    const importRefs = apiFunction.steps
      .filter((step) => step.kind === "ref" && Boolean(step.ref))
      .map((step) => (step.ref || "").trim())
      .filter(Boolean);

    if (importRefs.length === 0) {
      pushIssue(runtimeIssues, {
        code: "api.function.no_imports",
        severity: "error",
        message: `API function "${apiFunction.label || apiFunction.id}" has no imported business functions`,
        refs: [apiFunction.id],
      });
      continue;
    }

    for (const ref of importRefs) {
      if (!businessFunctionById.has(ref)) {
        pushIssue(runtimeIssues, {
          code: "api.function.missing_import",
          severity: "error",
          message: `API function "${apiFunction.label || apiFunction.id}" imports unknown function "${ref}"`,
          refs: [apiFunction.id, ref],
        });
      }
    }
  }

  for (const fn of businessFunctions) {
    for (const step of fn.steps) {
      const ref = (step.ref || "").trim();
      if (!ref) continue;

      if (step.kind === "db_operation" && !dataById.has(ref)) {
        pushIssue(runtimeIssues, {
          code: "function.unresolved_data_dependency",
          severity: "error",
          message: `Function "${fn.label || fn.id}" references missing data model "${ref}"`,
          refs: [fn.id, ref],
        });
      }

      if (step.kind === "external_call" && !runtimeResourceIds.has(ref)) {
        pushIssue(runtimeIssues, {
          code: "function.unresolved_infra_dependency",
          severity: "error",
          message: `Function "${fn.label || fn.id}" references missing infra resource "${ref}"`,
          refs: [fn.id, ref],
        });
      }
    }
  }

  if (dataBlocks.length > 0 && computeBlocks.length === 0) {
    pushIssue(runtimeIssues, {
      code: "data.no_compute_host",
      severity: "error",
      message: "Data layer exists but no compute infrastructure host is configured",
      refs: dataBlocks.map((db) => db.id),
    });
  }

  const apiOwner = new Map<string, string>();
  const functionOwner = new Map<string, string>();
  const dataOwner = new Map<string, string>();

  const services: ServiceSummary[] = serviceBoundaries.map((service) => ({
    id: service.id,
    label: service.label || service.id,
    apiCount: service.apiRefs.length,
    functionCount: service.functionRefs.length,
    dataCount: service.dataRefs.length,
    computeRef: service.computeRef,
  }));

  for (const service of serviceBoundaries) {
    if (service.communication.allowDirectDbAccess) {
      pushIssue(serviceIssues, {
        code: "service.direct_db_disallowed",
        severity: "error",
        message:
          `Service "${service.label || service.id}" enables direct DB sharing, ` +
          "which is disallowed. Use API, queue, or event bus communication.",
        refs: [service.id],
      });
    }

    if (!service.computeRef || !computeById.has(service.computeRef)) {
      pushIssue(serviceIssues, {
        code: "service.compute_missing",
        severity: "error",
        message: `Service "${service.label || service.id}" must bind to a valid compute resource`,
        refs: [service.id, service.computeRef || ""].filter(Boolean),
      });
    }

    for (const apiRef of service.apiRefs) {
      if (!apiById.has(apiRef)) {
        pushIssue(serviceIssues, {
          code: "service.api_missing",
          severity: "error",
          message: `Service "${service.label || service.id}" references missing API "${apiRef}"`,
          refs: [service.id, apiRef],
        });
        continue;
      }
      const existing = apiOwner.get(apiRef);
      if (existing && existing !== service.id) {
        pushIssue(serviceIssues, {
          code: "service.api_shared",
          severity: "error",
          message: `API "${apiRef}" is shared across services (${existing}, ${service.id})`,
          refs: [apiRef, existing, service.id],
        });
      } else {
        apiOwner.set(apiRef, service.id);
      }
    }

    for (const functionRef of service.functionRefs) {
      if (!allFunctionById.has(functionRef)) {
        pushIssue(serviceIssues, {
          code: "service.function_missing",
          severity: "error",
          message: `Service "${service.label || service.id}" references missing function "${functionRef}"`,
          refs: [service.id, functionRef],
        });
        continue;
      }
      const existing = functionOwner.get(functionRef);
      if (existing && existing !== service.id) {
        pushIssue(serviceIssues, {
          code: "service.function_shared",
          severity: "error",
          message: `Function "${functionRef}" is shared across services (${existing}, ${service.id})`,
          refs: [functionRef, existing, service.id],
        });
      } else {
        functionOwner.set(functionRef, service.id);
      }
    }

    for (const dataRef of service.dataRefs) {
      if (!dataById.has(dataRef)) {
        pushIssue(serviceIssues, {
          code: "service.data_missing",
          severity: "error",
          message: `Service "${service.label || service.id}" references missing data model "${dataRef}"`,
          refs: [service.id, dataRef],
        });
        continue;
      }
      const existing = dataOwner.get(dataRef);
      if (existing && existing !== service.id) {
        pushIssue(serviceIssues, {
          code: "service.data_shared",
          severity: "error",
          message: `Direct DB sharing is disallowed: "${dataRef}" belongs to multiple services`,
          refs: [dataRef, existing, service.id],
        });
      } else {
        dataOwner.set(dataRef, service.id);
      }
    }
  }

  if (serviceBoundaries.length === 0) {
    pushIssue(serviceIssues, {
      code: "service.none_defined",
      severity: "error",
      message: "At least one Service Boundary is required before deploy",
    });
  } else {
    for (const api of apiBlocks) {
      if (!apiOwner.has(api.id)) {
        pushIssue(serviceIssues, {
          code: "service.api_unowned",
          severity: "error",
          message: `API "${api.label || api.id}" is not assigned to any service`,
          refs: [api.id],
        });
      }
    }
    for (const fn of allFunctionBlocks) {
      if (!functionOwner.has(fn.id)) {
        pushIssue(serviceIssues, {
          code: "service.function_unowned",
          severity: "error",
          message: `Function "${fn.label || fn.id}" is not assigned to any service`,
          refs: [fn.id],
        });
      }
    }
    for (const db of dataBlocks) {
      if (!dataOwner.has(db.id)) {
        pushIssue(serviceIssues, {
          code: "service.data_unowned",
          severity: "error",
          message: `Data model "${db.label || db.id}" is not assigned to any service`,
          refs: [db.id],
        });
      }
    }
  }

  for (const fn of allFunctionBlocks) {
    const sourceService = functionOwner.get(fn.id);
    if (!sourceService) continue;

    for (const step of fn.steps) {
      if (step.kind !== "ref" || !step.ref) continue;
      const targetService = functionOwner.get(step.ref);
      if (targetService && targetService !== sourceService) {
        pushIssue(serviceIssues, {
          code: "service.cross_function_ref",
          severity: "error",
          message:
            `Cross-service direct function access is disallowed (${sourceService} -> ${targetService}). ` +
            "Use API, queue, or event bus communication.",
          refs: [fn.id, step.ref, sourceService, targetService],
        });
      }
    }
  }

  const allIssues = [...runtimeIssues, ...serviceIssues];
  const errorIssues = allIssues.filter((issue) => issue.severity === "error");
  const warningIssues = allIssues.filter((issue) => issue.severity === "warning");

  const hasApis = apiBlocks.length > 0;
  const allApisBound =
    apiBlocks.length > 0 &&
    apiBlocks.every((api) => {
      const ref = (api.processRef || "").trim();
      return Boolean(ref) && allFunctionById.has(ref);
    });
  const hasBusinessFunctions = businessFunctions.length > 0;
  const hasData = dataBlocks.length > 0;
  const hasInfra = infraBlocks.length > 0;
  const hasCompute = computeBlocks.length > 0;
  const servicesAssigned =
    serviceBoundaries.length > 0 &&
    apiBlocks.every((api) => apiOwner.has(api.id)) &&
    allFunctionBlocks.every((fn) => functionOwner.has(fn.id)) &&
    dataBlocks.every((db) => dataOwner.has(db.id));

  const deployReady =
    errorIssues.length === 0 &&
    hasApis &&
    allApisBound &&
    hasBusinessFunctions &&
    hasData &&
    hasInfra &&
    hasCompute &&
    servicesAssigned;

  const blockers = errorIssues.map((issue) => issue.message);

  const stages: WorkflowStage[] = [
    {
      id: "create_api",
      title: "1. Create API",
      status: hasApis ? "complete" : "incomplete",
      detail: hasApis ? "API contracts are defined" : "Add at least one API block",
    },
    {
      id: "attach_function",
      title: "2. Attach Function",
      status: allApisBound ? "complete" : hasApis ? "blocked" : "incomplete",
      detail: allApisBound
        ? "All APIs are bound to function blocks"
        : "Each API must reference a function block",
    },
    {
      id: "define_function_logic",
      title: "3. Define Function Logic",
      status: hasBusinessFunctions ? "complete" : "incomplete",
      detail: hasBusinessFunctions
        ? "Business functions exist in Functions tab"
        : "Add business logic functions in the Functions tab",
    },
    {
      id: "define_database",
      title: "4. Define Database",
      status: hasData ? "complete" : "incomplete",
      detail: hasData ? "Data models are defined" : "Add database models",
    },
    {
      id: "configure_infra",
      title: "5. Configure Infrastructure",
      status: hasInfra && hasCompute ? "complete" : hasInfra ? "blocked" : "incomplete",
      detail:
        hasInfra && hasCompute
          ? "Infrastructure and compute hosts are configured"
          : "Configure infra and at least one compute host",
    },
    {
      id: "assign_services",
      title: "6. Assign Services",
      status: servicesAssigned ? "complete" : "blocked",
      detail: servicesAssigned
        ? "Service ownership and compute assignments are valid"
        : "Assign API/functions/data to service boundaries and bind compute",
    },
    {
      id: "deploy",
      title: "7. Deploy",
      status: deployReady ? "complete" : "blocked",
      detail: deployReady
        ? "All dependency and ownership checks passed"
        : "Resolve blocking validation issues before deploy",
    },
  ];

  return {
    runtimeModel: {
      dependencyDirection: "API -> Functional -> Data -> Infra",
      hostingLayer: "Infrastructure hosts all layers",
      layerCounts: {
        api: apiBlocks.length,
        functional: allFunctionBlocks.length,
        data: dataBlocks.length,
        infra: infraBlocks.length + queueBlocks.length,
        serviceBoundaries: serviceBoundaries.length,
      },
      issues: runtimeIssues,
    },
    workflowModel: {
      orderedSteps: [
        "Create API",
        "Attach Function",
        "Define Function Logic",
        "Define Database",
        "Configure Infrastructure",
        "Assign Services",
        "Deploy",
      ],
      stages,
    },
    serviceModel: {
      rules: [
        "Each service owns its API, functions, and data",
        "No direct DB sharing across services",
        "Cross-service communication only via API, queue, or event bus",
      ],
      services,
      issues: serviceIssues,
    },
    deploy: {
      ready: deployReady,
      blockers,
      errorCount: errorIssues.length,
      warningCount: warningIssues.length,
    },
  };
};
