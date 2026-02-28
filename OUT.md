# Ermiz Studio: Technical Documentation for LLMs

Ermiz Studio is a visual backend design platform that allows engineers to model APIs, internal processes, and infrastructure as explicit, structured specifications. It is designed for "real backend engineering," moving beyond low-code demos to create canonical OpenAPI/AsyncAPI specs and JSON-based execution graphs.

---

## 1. Core Philosophy
- **Explicit over Implicit**: No hidden logic or magic. The visual graph is a direct projection of the source specs.
- **Capability Boundaries**: Infrastructure (databases, queues) are treated as capability boundaries, not just helpers.
- **Strict Architecture**: Enforces a clear dependency direction: **API -> Process -> Data -> Infrastructure**.
- **Microservices-First**: Includes "Service Boundaries" to enforce ownership and prevent illegal cross-service interactions (e.g., direct DB sharing).

---

## 2. Technical Stack
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript.
- **Canvas**: XYFlow (formerly React Flow) for node-based editing.
- **Styling**: Tailwind CSS v4.
- **State Management**: Zustand (Client-side), Zod (Validation).
- **Backend**: Next.js Route Handlers (API).
- **Database**: PostgreSQL with Prisma ORM (JSONB for document storage).
- **Auth**: Supabase Auth with Google OAuth.
- **Messaging/Execution**: BullMQ-inspired queue adapters and a custom Runtime Engine.

---

## 3. Data Model & Node Types
The system uses a unified `NodeData` schema (defined in `lib/schema/node.ts`) which is a discriminated union of several node kinds.

### 3.1 APIs (`api_binding`)
Models external interfaces.
- **Protocols**: `rest`, `ws`, `socket.io`, `webrtc`, `graphql`, `grpc`, `sse`, `webhook`.
- **REST Specifics**: Method, Route, Request (Path/Query/Headers/Body), Responses (Success/Error schemas).
- **Non-REST Specifics**: Protocol-specific instance configurations (e.g., `schemaSDL` for GraphQL, `protobufDefinition` for gRPC).
- **Process Binding**: Every API must have a `processRef` pointing to a Function Block.

### 3.2 Processes (`process`)
Models functional logic and workflows.
- **Execution Modes**: `sync`, `async`, `scheduled`, `event_driven`.
- **I/O**: Strictly typed Inputs and Outputs (Success/Error).
- **Steps**:
    - `compute`: General calculation.
    - `db_operation`: Database CRUD (create, update, delete).
    - `external_call`: Calling another API or Infra resource.
    - `condition`: Branching logic.
    - `transform`: Data mapping.
    - `ref`: Reference to another business function.
    - `return`: Final response.

### 3.3 Database (`database`)
Models data persistence.
- **Engines**: `sql` (Postgres, MySQL), `nosql` (Mongo), `kv` (Redis), `graph` (Neo4j).
- **Capabilities**: Flags for `transactions`, `joins`, `indexes`, etc.
- **Schema**: Tables, Fields (typed), Relationships (1:1, 1:N, N:M).
- **Operations**: Queries, Seeds, Migrations, Backup schedules.
- **Environments**: Separate connection strings and performance tiers for `dev`, `staging`, `production`.

### 3.4 Infrastructure (`infra`)
Models hosting and cloud resources (Terraform-aligned).
- **Types**: `ec2`, `lambda`, `eks`, `vpc`, `s3`, `rds`, `load_balancer`, `hpc`.
- **Configs**: Detailed properties (e.g., `instanceType`, `region`, `memoryMb`, `bucketName`).

### 3.5 Queues (`queue`)
Models asynchronous messaging.
- **Delivery**: `at_least_once`, `at_most_once`, `exactly_once`.
- **Retry Policy**: Max attempts and backoff (linear/exponential).

### 3.6 Service Boundaries (`service_boundary`)
Defines the ownership scope.
- **Ownership**: Lists `apiRefs`, `functionRefs`, and `dataRefs`.
- **Compute Binding**: Must bind to a compute resource (e.g., Lambda, EKS).
- **Communication Rules**: Disallows direct DB access or direct function calls across boundaries.

---

## 4. Architectural Governance (`lib/runtime/architecture.ts`)
The system performs static analysis on the graph to ensure architectural integrity.

### 7-Step Workflow
1. **Create API**: Define the external contract.
2. **Attach Function**: Bind API to a function block.
3. **Define Function Logic**: Add steps and logic in the Functions tab.
4. **Define Database**: Model the required data structures.
5. **Configure Infrastructure**: Setup the hosting environment.
6. **Assign Services**: Group resources into service boundaries.
7. **Deploy**: Final validation and "compilation".

### Key Rules
- No unbound APIs.
- No direct cross-service DB sharing.
- Cross-service communication must use API, Queue, or Event Bus.
- Every service must have a compute host.

---

## 5. Runtime Engine (`lib/runtime/engine.ts`)
The `RuntimeEngine` interprets the visual design and can execute it.

- **Topological Sort**: Determines the execution order based on dependency layers:
    - Layer 0: API Binding (Entry points)
    - Layer 1: Process (Functional logic)
    - Layer 2: Database (Data persistence)
    - Layer 3: Infra/Queue (Resources)
- **Execution**:
    - **REST Execution**: Matches incoming requests to `api_binding` nodes.
    - **Step Execution**: Iterates through `ProcessStep` list.
    - **DB Execution**: Uses Prisma `executeRawUnsafe` to perform real operations if connection strings are provided.
    - **Queue Execution**: Uses an adapter to enqueue or consume messages.

---

## 6. Directory Structure
- `/app/api`: Backend routes for credits, document management, and runtime execution.
- `/components/canvas`: UI for the node editor (Nodes, Edges, Context Menus).
- `/components/panels`: Property inspectors and specialized editors (Query Builder, ERD Viewer).
- `/lib/runtime`: Core engine, architecture analysis, and state synchronization.
- `/lib/schema`: Zod schemas and TypeScript types for the graph and nodes.
- `/store`: Zustand `useStore.ts` managing the multi-tab graph state.
- `/prisma`: Database schema for users, credits, and design documents.

---

## 7. Interaction Guidelines for LLMs
When generating or modifying Ermiz Studio designs:
1. **Respect the Layers**: Ensure connections flow from API -> Process -> Data -> Infra.
2. **Strict Typing**: Always define inputs and outputs for processes.
3. **Service Boundaries**: When adding multiple services, ensure each has a `service_boundary` node and no direct cross-links.
4. **Protocol Accuracy**: Use the correct `instance` configuration for non-REST protocols (gRPC, GraphQL, etc.).
5. **Ref-based Steps**: For business logic, use `ref` steps to link "API Function Blocks" (in the API tab) to "Business Functions" (in the Functions tab).
