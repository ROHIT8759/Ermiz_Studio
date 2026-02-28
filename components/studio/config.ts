import type { SidebarSection } from "@/components/studio/WorkspaceCanvas";

export type WorkspaceTab =
  | "api"
  | "database"
  | "functions"
  | "agent";

export const tabLabel: Record<WorkspaceTab, string> = {
  api: "API",
  database: "Database",
  functions: "Functions",
  agent: "Agent",
};

export const STORAGE_KEYS = {
  activeTab: "ermiz.activeTab",
  graphs: "ermiz.graphs",
};


export const apiSections: SidebarSection[] = [
    {
      id: "api-processes",
      title: "Function Block",
      items: [
        {
          kind: "process",
          label: "Function Block",
          icon: "⚙️",
          hoverColor: "#a78bfa",
          hint: "Single API block that imports from Functions tab",
        },
      ],
    },
    {
      id: "api-services",
      title: "Service Boundaries",
      items: [
        {
          kind: "service_boundary",
          label: "Service Boundary",
          icon: "🧱",
          hoverColor: "#fb7185",
          hint: "Own API, functions, and data per service",
        },
      ],
    },
    {
      id: "api-infra",
      title: "Infrastructure",
      items: [
        {
          kind: "database",
          label: "Database",
          icon: "🗄️",
          hoverColor: "#4ade80",
          hint: "Persistent storage",
        },
        {
          kind: "queue",
          label: "Queue",
          icon: "📬",
          hoverColor: "#facc15",
          hint: "Async event buffer",
        },
        {
          kind: "queue",
          label: "Dead Letter Queue",
          icon: "📦",
          hoverColor: "#f97316",
          hint: "Failed message sink",
        },
      ],
    },
    {
      id: "api-interfaces",
      title: "Interface Blocks",
      items: [
        {
          kind: "api_rest",
          label: "REST Interface",
          icon: "🔗",
          hoverColor: "#60a5fa",
          hint: "Protocol-level REST contract",
        },
        {
          kind: "api_ws",
          label: "WebSocket Interface",
          icon: "🛰️",
          hoverColor: "#22d3ee",
          hint: "Raw WebSocket protocol",
        },
        {
          kind: "api_socketio",
          label: "Socket.IO Interface",
          icon: "🧩",
          hoverColor: "#38bdf8",
          hint: "Namespaces, rooms, events",
        },
        {
          kind: "api_webrtc",
          label: "WebRTC Interface",
          icon: "📹",
          hoverColor: "#f472b6",
          hint: "P2P sessions via signaling",
        },
        {
          kind: "api_graphql",
          label: "GraphQL Interface",
          icon: "🕸️",
          hoverColor: "#c084fc",
          hint: "Schema-driven queries and mutations",
        },
        {
          kind: "api_grpc",
          label: "gRPC Interface",
          icon: "📡",
          hoverColor: "#34d399",
          hint: "Protobuf service contract",
        },
        {
          kind: "api_sse",
          label: "SSE Interface",
          icon: "📣",
          hoverColor: "#f59e0b",
          hint: "Server-to-client event stream",
        },
        {
          kind: "api_webhook",
          label: "Webhook Interface",
          icon: "🪝",
          hoverColor: "#fb7185",
          hint: "Incoming callback endpoint",
        },
      ],
    },
  ];

const _infraSections: SidebarSection[] = [
    {
      id: "infra-compute",
      title: "Compute",
      items: [
        {
          kind: "infra_ec2",
          label: "EC2 Instance",
          icon: "🖥️",
          hoverColor: "#60a5fa",
          hint: "Virtual machines + autoscaling",
        },
        {
          kind: "infra_lambda",
          label: "Lambda Function",
          icon: "⚡",
          hoverColor: "#facc15",
          hint: "Serverless execution",
        },
        {
          kind: "infra_eks",
          label: "EKS Cluster",
          icon: "🧩",
          hoverColor: "#34d399",
          hint: "Managed Kubernetes",
        },
        {
          kind: "infra_hpc",
          label: "HPC Cluster",
          icon: "🚀",
          hoverColor: "#f472b6",
          hint: "Batch compute + schedulers",
        },
      ],
    },
    {
      id: "infra-network",
      title: "Networking",
      items: [
        {
          kind: "infra_vpc",
          label: "VPC Network",
          icon: "🧭",
          hoverColor: "#a78bfa",
          hint: "Subnets, routes, NAT",
        },
        {
          kind: "infra_lb",
          label: "Load Balancer",
          icon: "📡",
          hoverColor: "#22d3ee",
          hint: "ALB/NLB listeners + targets",
        },
      ],
    },
    {
      id: "infra-services",
      title: "Service Boundaries",
      items: [
        {
          kind: "service_boundary",
          label: "Service Boundary",
          icon: "🧱",
          hoverColor: "#fb7185",
          hint: "Bind service ownership to compute runtime",
        },
      ],
    },
    {
      id: "infra-interfaces",
      title: "Interfaces",
      items: [
        {
          kind: "api_rest",
          label: "REST Interface",
          icon: "🔗",
          hoverColor: "#60a5fa",
          hint: "Expose infra-backed REST contract",
        },
        {
          kind: "api_ws",
          label: "WebSocket Interface",
          icon: "🛰️",
          hoverColor: "#22d3ee",
          hint: "Expose raw WebSocket contract",
        },
        {
          kind: "api_socketio",
          label: "Socket.IO Interface",
          icon: "🧩",
          hoverColor: "#38bdf8",
          hint: "Expose Socket.IO contract",
        },
        {
          kind: "api_webrtc",
          label: "WebRTC Interface",
          icon: "📹",
          hoverColor: "#f472b6",
          hint: "Expose WebRTC contract",
        },
        {
          kind: "api_graphql",
          label: "GraphQL Interface",
          icon: "🕸️",
          hoverColor: "#c084fc",
          hint: "Expose GraphQL contract",
        },
        {
          kind: "api_grpc",
          label: "gRPC Interface",
          icon: "📡",
          hoverColor: "#34d399",
          hint: "Expose gRPC service contract",
        },
        {
          kind: "api_sse",
          label: "SSE Interface",
          icon: "📣",
          hoverColor: "#f59e0b",
          hint: "Expose server-sent event stream",
        },
        {
          kind: "api_webhook",
          label: "Webhook Interface",
          icon: "🪝",
          hoverColor: "#fb7185",
          hint: "Expose callback endpoint contract",
        },
      ],
    },
    {
      id: "infra-storage",
      title: "Storage",
      items: [
        {
          kind: "infra_s3",
          label: "S3 Bucket",
          icon: "🪣",
          hoverColor: "#f97316",
          hint: "Object storage",
        },
        {
          kind: "infra_rds",
          label: "RDS Instance",
          icon: "🗄️",
          hoverColor: "#3b82f6",
          hint: "Managed relational DB",
        },
      ],
    },
  ];

export const databaseSections: SidebarSection[] = [
    {
      id: "db-engines",
      title: "Databases",
      items: [
        {
          kind: "database",
          label: "Primary Database",
          icon: "🗄️",
          hoverColor: "#4ade80",
          hint: "Main OLTP store",
        },
        {
          kind: "database",
          label: "Read Replica",
          icon: "📚",
          hoverColor: "#60a5fa",
          hint: "Read-heavy workloads",
        },
        {
          kind: "database",
          label: "Analytics Store",
          icon: "📈",
          hoverColor: "#c084fc",
          hint: "Reporting & BI",
        },
      ],
    },
    {
      id: "db-interfaces",
      title: "Interfaces",
      items: [
        {
          kind: "api_rest",
          label: "REST Interface",
          icon: "🔗",
          hoverColor: "#60a5fa",
          hint: "Data-access contract via REST",
        },
        {
          kind: "api_ws",
          label: "WebSocket Interface",
          icon: "🛰️",
          hoverColor: "#22d3ee",
          hint: "Realtime data contract (raw WS)",
        },
        {
          kind: "api_socketio",
          label: "Socket.IO Interface",
          icon: "🧩",
          hoverColor: "#38bdf8",
          hint: "Realtime data contract (Socket.IO)",
        },
        {
          kind: "api_webrtc",
          label: "WebRTC Interface",
          icon: "📹",
          hoverColor: "#f472b6",
          hint: "Realtime media/signaling contract",
        },
        {
          kind: "api_graphql",
          label: "GraphQL Interface",
          icon: "🕸️",
          hoverColor: "#c084fc",
          hint: "Data-access contract via GraphQL",
        },
        {
          kind: "api_grpc",
          label: "gRPC Interface",
          icon: "📡",
          hoverColor: "#34d399",
          hint: "Data-access contract via gRPC",
        },
        {
          kind: "api_sse",
          label: "SSE Interface",
          icon: "📣",
          hoverColor: "#f59e0b",
          hint: "One-way event stream contract",
        },
        {
          kind: "api_webhook",
          label: "Webhook Interface",
          icon: "🪝",
          hoverColor: "#fb7185",
          hint: "Inbound callback contract",
        },
      ],
    },
    {
      id: "db-pipelines",
      title: "Data Pipelines",
      items: [
        {
          kind: "queue",
          label: "Queue",
          icon: "📬",
          hoverColor: "#facc15",
          hint: "Ingestion stream",
        },
        {
          kind: "queue",
          label: "ETL Queue",
          icon: "🧪",
          hoverColor: "#f59e0b",
          hint: "Batch transformation tasks",
        },
        {
          kind: "process",
          label: "Function Block",
          icon: "⚙️",
          hoverColor: "#a78bfa",
          hint: "Configurable function logic",
        },
      ],
    },
    {
      id: "db-services",
      title: "Service Boundaries",
      items: [
        {
          kind: "service_boundary",
          label: "Service Boundary",
          icon: "🧱",
          hoverColor: "#fb7185",
          hint: "Assign data ownership to a service",
        },
      ],
    },
  ];

export const functionSections: SidebarSection[] = [
    {
      id: "functions-start",
      title: "Start Function",
      items: [
        {
          kind: "function_entry",
          label: "Start Function",
          icon: "▶",
          hoverColor: "#4ade80",
          hint: "Entry point callable by an API binding",
        },
      ],
    },
    {
      id: "functions-business-logic",
      title: "Business Logic",
      items: [
        {
          kind: "process",
          label: "Function Block",
          icon: "⚙️",
          hoverColor: "#a78bfa",
          hint: "Define reusable business function",
        },
      ],
    },
    {
      id: "functions-services",
      title: "Service Boundaries",
      items: [
        {
          kind: "service_boundary",
          label: "Service Boundary",
          icon: "🧱",
          hoverColor: "#fb7185",
          hint: "Assign function ownership to a service",
        },
      ],
    },
  ];

export const STATUS_TEXT_BY_TAB: Record<WorkspaceTab, string> = {
  api: "API workspace ready",
  database: "Database workspace ready",
  functions: "Functions workspace ready",
  agent: "Agent view ready",
};

export const HEADER_MENU_TEXT = {
  saveChanges: "Save Changes",
  commit: "Commit",
  resetLayout: "Reset Layout",
  signIn: "Sign in",
  newProject: "+ New Project",
  commitChanges: "Commit Changes",
  logout: "Log out",
  buyPro: "Buy Pro",
  signInWithGoogle: "Sign in with Google",
  loginHint: "Continue with Google to access your workspace.",
} as const;

