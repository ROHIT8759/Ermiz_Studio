# Ermiz Studio Architecture

## 1. High-Level System Architecture
```mermaid
graph TD
    User([End User]) -->|Web Interface| WebClient[Next.js 16 + React 19 Client]

    subgraph "Frontend Layer"
        WebClient -->|State Management| ZustandStore[Zustand Store]
        WebClient -->|Canvas UI| CanvasEditor[XYFlow Editor]
        WebClient -->|Data Validation| Zod[Zod Schema]
    end

    WebClient -->|REST/App Router| NextJSApp[Next.js Backend Server]
    NextJSApp -->|Token / OAuth| SupabaseAuth[(Supabase Auth)]
    NextJSApp -->|Prisma Client| PostgreSQL[(PostgreSQL DB)]

    subgraph "AI Compiler / Recommendation Layer"
        NextJSApp -->|Spec & JSON| AIService[AI Code Generator]
        AIService -->|Generated Code / Suggestions| NextJSApp
    end

    classDef db fill:#f9f,stroke:#333,stroke-width:2px;
    class SupabaseAuth,PostgreSQL db;
```

## 2. User Data Flow & Interactions
```mermaid
sequenceDiagram
    participant Architect as System Architect
    participant Canvas as XYFlow Canvas
    participant Store as Zustand
    participant NextJS as NextJS API
    participant DB as PostgreSQL

    Architect->>Canvas: Drag & Drop Node / Capability
    Canvas->>Store: Publish State Change
    Store->>Store: Validate using Zod
    Store-->>Canvas: Re-render valid UI Connections
    Architect->>Canvas: Save "Process" or "API" Spec
    Canvas->>NextJS: POST /api/documents (JSON payload)
    NextJS->>NextJS: Deduct 1 Credit
    NextJS->>DB: Upsert Document (JSONB format)
    DB-->>NextJS: Update Confirmed
    NextJS-->>Canvas: Success State
```

## 3. Developer / CI-CD Flow
```mermaid
flowchart LR
    Dev([Developer]) -->|git clone & pnpm install| LocalEnv[Local Environment]
    LocalEnv -->|prisma generate| Prisma[Prisma ORM]
    LocalEnv -->|dev server| Browser(Local Testing)
    Dev -->|Push Code| GitHub[GitHub Repo]
    GitHub -->|Webhook Trigger| Vercel[Vercel CI/CD]
    Vercel -->|Build & Migrate| ProdBuild[Production Artifact]
    ProdBuild -->|Deploy| LiveApp[Live SaaS Platform]
```

## 4. AI Recommendation & Compiler Flow
```mermaid
stateDiagram-v2
    direction TB
    state "Canvas Source" as Canvas {
        Nodes
        Edges
        Properties
    }
    
    state "Canonical Specs" as Specs {
        OpenAPI
        AsyncAPI
        JSON_Processes
        JSON_Infra
    }

    state "AI Recommendation & Code Gen" as AICore {
        Prompt_Builder
        LLM_Execution
        Response_Parser
    }
    
    state "Output Deliverables" as Outputs {
        Generated_Backend_Functions
        Infrastructure_Bindings
        AI_Suggestions
    }

    Canvas --> Specs : Deterministic Export
    Specs --> AICore : Base Source of Truth
    AICore --> Outputs : Generates Functional Code / Hints
    Outputs --> Specs : (Never Overwrites Directly)
```

## 5. Database ER Diagram
```mermaid
erDiagram
    User ||--o{ CreditBalance : owns
    User ||--o{ CreditTransaction : executes
    User ||--o{ DocumentSet : groups
    User ||--o{ Document : creates
    DocumentSet ||--o{ Document : contains
    
    User {
        String id PK
        String email
        String name
    }
    
    CreditBalance {
        String id PK
        String userId FK
        BigInt availableCredits
        BigInt monthlyFreeCredits
    }
    
    CreditTransaction {
        String id PK
        String userId FK
        TransactionKind kind "usage | topup"
        BigInt amount
    }

    Document {
        String id PK
        String userId FK
        String documentSetId FK
        TabKind tab "api | process | infrastructure | schema"
        Json content "Visual Node Graph"
        Json metadata
    }
```

## 6. Functional Endpoints Data Architecture
```mermaid
graph LR
    subgraph Credit Functions
        GET_Credits[GET /api/credits - Check Balance]
        POST_Use[POST /api/credits/use - Consume]
        POST_Dummy[POST /api/payments/dummy - TopUp]
    end
    
    subgraph Document Functions
        GET_Docs[GET /api/documents]
        POST_Docs[POST /api/documents - Create & Charge]
        PATCH_Doc[PATCH /api/documents/:id - Update]
        DEL_Doc[DELETE /api/documents/:id]
    end

    subgraph Document Set Functions
        GET_Sets[GET /api/document-sets]
        POST_Sets[POST /api/document-sets]
    end

    Middleware{Supabase Auth Middleware}
    
    Client((App Router Client)) --> Middleware
    Middleware -->|Authorized Session| GET_Credits
    Middleware -->|Authorized Session| POST_Use
    Middleware -->|Authorized Session| POST_Dummy
    Middleware -->|Authorized Session| GET_Docs
    Middleware -->|Authorized Session| POST_Docs
    Middleware -->|Authorized Session| PATCH_Doc
    Middleware -->|Authorized Session| DEL_Doc
    Middleware -->|Authorized Session| GET_Sets
    Middleware -->|Authorized Session| POST_Sets
    Middleware -->|Unauthenticated| Redirect[Redirect /login]
```
