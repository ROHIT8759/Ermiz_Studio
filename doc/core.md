### Problem Statement

**Build a visual backend design platform inspired by n8n, where users design backend systems by explicitly defining API contracts and internal processes using a node-based editor.**

External APIs are documented using **industry-standard specifications**.
All internal logic (processes, functions, databases, jobs, queues) is expressed using **plain, structured JSON**.

There is no hidden state.
There is no inferred behavior.
Everything that exists is declared.

---

## Canonical Source of Truth

* **REST APIs → OpenAPI (single file per API)**
* **Event / WebSocket APIs → AsyncAPI (single file per API)**
* **Processes, functions, DBs, queues → Plain JSON**

Specs describe *interfaces*.
JSON describes *execution*.

These are separate and never merged.

---

## Core System Rules (Non-Negotiable)

1. **API type must be selected before design begins**
2. **Each API surface produces exactly one spec**
3. **Internal logic is never embedded in API specs**
4. **Processes are always explicit and typed**
5. **Plain JSON must be deterministic and machine-readable**
6. **Visual graph ↔ source representation is lossless and reversible**

---

## What the System Designs

### 1. API Contracts (Spec-Based)

Users create APIs by choosing the API type first:

* REST (HTTP) → OpenAPI
* Event / WebSocket → AsyncAPI

The canvas exposes only spec-valid nodes.

API nodes define:

* Routes / channels
* Methods or publish/subscribe operations
* Request / response schemas
* Security
* Rate limiting
* Versioning

APIs **invoke processes**, but never contain logic.

---

### 2. Processes (Plain JSON, First-Class)

Processes represent **everything the backend actually does**.

Each process must declare:

* **Process name** (stable identifier)
* **Process type**

  * Calculation
  * Database workflow
  * Background job
  * Queue consumer
  * Orchestrated workflow
* **Execution model**

  * Sync
  * Async
  * Scheduled
  * Event-driven
* **Description**
* **Inputs** (typed, schema-backed)
* **Outputs** (typed, including error outputs)

A process without declared inputs and outputs is invalid.

---

### 3. Process Graph

Processes are composed of nodes with explicit execution order:

* Computation nodes
* Transformation nodes
* Conditional nodes
* Database interaction nodes
* External service call nodes
* Queue publish / consume nodes

No free-form scripting.
No hidden side effects.

---

## Databases as Capability Blocks (Plain JSON)

Databases are modeled as **first-class infrastructure blocks**, not helpers.

Each DB block must declare:

* Database type (SQL, NoSQL, KV, Graph)
* Capabilities:

  * CRUD
  * Transactions
  * Joins / aggregations
  * Indexes
  * Constraints
  * Pagination & filtering
* Read/write semantics
* Connection scope

Database access is only allowed **inside processes**.

---

## Jobs, Queues, and Background Work

* Queues are infrastructure blocks
* Producers and consumers are explicit
* Retry, backoff, and DLQ behavior must be declared
* Job execution is modeled as processes

No implicit async behavior.

---

## JSON Design Constraints (Critical)

The internal JSON format must be:

* Deterministic
* Versioned
* Schema-validated
* Human-readable
* Language-agnostic
* Stable enough to act as a long-term contract

This JSON is **not code**.
It is a **structured execution model**.

---

## AI Integration (Optional, Controlled)

AI may:

* Generate processes from natural language
* Suggest missing steps or validations
* Generate backend code from:

  * OpenAPI / AsyncAPI specs
  * Process JSON
  * Infrastructure JSON

AI may **not**:

* Invent processes
* Mutate JSON silently
* Bypass declared inputs/outputs

---

## Mental Model (Final)

> **Figma for backend systems**
>
> * APIs = contracts (specs)
> * Processes = execution (plain JSON)
> * Infra = capabilities (plain JSON)
> * AI = compiler

---



## Explicit Non-Goals

* No universal API spec
* No proprietary replacement for OpenAPI
* No logic embedded in specs
* No visual-only behavior

---

## Hard Product Insight

> **Specs define what is exposed.
> Plain JSON defines what happens.**

This separation is what makes the system real.

