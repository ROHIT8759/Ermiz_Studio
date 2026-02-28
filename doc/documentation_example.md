Running this spec serially (test.describe.configure({ mode: "serial" }) or Playwright workers override).
  2. Making RuntimeEngine.start() perform non-strict initialization (skip input-required process validation), while keeping strict validation for     
     request-triggered execution via /api/run/....
# 1. Process Definition (Core Unit)

This is the **most important non-standard doc**.
Every function, job, workflow, or consumer must look like this.

```json
{
  "kind": "process",
  "id": "createUser",
  "type": "database_workflow",
  "execution": "sync",
  "description": "Creates a new user and returns the created record",

  "inputs": {
    "email": { "type": "string", "required": true },
    "password": { "type": "string", "required": true }
  },

  "outputs": {
    "success": {
      "userId": { "type": "string" },
      "email": { "type": "string" }
    },
    "error": {
      "code": { "type": "string" },
      "message": { "type": "string" }
    }
  },

  "steps": [
    { "ref": "hashPassword" },
    { "ref": "insertUser" }
  ]
}
```

**Why this prevents hallucination**

* Explicit `kind`
* Explicit `type`
* Explicit I/O
* Explicit steps
* No free-form logic

---

# 2. Computation / Pure Function Process

```json
{
  "kind": "process",
  "id": "calculateDiscount",
  "type": "calculation",
  "execution": "sync",
  "description": "Calculates discount amount based on cart total",

  "inputs": {
    "cartTotal": { "type": "number", "required": true },
    "userTier": { "type": "string", "required": true }
  },

  "outputs": {
    "discount": { "type": "number" }
  },

  "steps": [
    {
      "kind": "compute",
      "operation": "percentage",
      "rules": [
        { "if": "userTier == 'gold'", "value": 0.2 },
        { "if": "userTier == 'silver'", "value": 0.1 },
        { "else": 0.0 }
      ]
    }
  ]
}
```

No code.
No scripting.
Only declared operations.

---

# 3. Database Block (Infrastructure)

This is **not a process**.
It defines **capabilities**, not behavior.

```json
{
  "kind": "database",
  "id": "primaryPostgres",
  "dbType": "sql",
  "engine": "postgres",

  "capabilities": {
    "crud": true,
    "transactions": true,
    "joins": true,
    "aggregations": true,
    "indexes": true,
    "constraints": true,
    "pagination": true
  },

  "schemas": ["User", "Order"]
}
```

AI is **not allowed** to assume features outside `capabilities`.

---

# 4. Database Interaction Step (Inside a Process)

```json
{
  "kind": "db_operation",
  "dbRef": "primaryPostgres",
  "operation": "insert",
  "table": "User",
  "inputMapping": {
    "email": "$inputs.email",
    "passwordHash": "$context.hashedPassword"
  },
  "output": "createdUser"
}
```

This makes DB access:

* explicit
* traceable
* sandboxed

---

# 5. Queue Definition

```json
{
  "kind": "queue",
  "id": "emailQueue",
  "delivery": "at_least_once",
  "retry": {
    "maxAttempts": 5,
    "backoff": "exponential"
  },
  "deadLetter": true
}
```

No magic async behavior.

---

# 6. Background Job / Queue Consumer Process

```json
{
  "kind": "process",
  "id": "sendWelcomeEmail",
  "type": "queue_consumer",
  "execution": "async",
  "description": "Sends welcome email to new users",

  "trigger": {
    "queue": "emailQueue"
  },

  "inputs": {
    "userId": { "type": "string", "required": true }
  },

  "outputs": {
    "status": { "type": "string" }
  },

  "steps": [
    { "kind": "external_call", "service": "emailProvider" }
  ]
}
```

---

# 7. Scheduled Job

```json
{
  "kind": "process",
  "id": "cleanupInactiveUsers",
  "type": "job",
  "execution": "scheduled",
  "schedule": "0 3 * * *",
  "description": "Deletes inactive users after 90 days",

  "inputs": {},

  "outputs": {
    "deletedCount": { "type": "number" }
  },

  "steps": [
    {
      "kind": "db_operation",
      "operation": "delete",
      "condition": "lastActive < now() - 90d"
    }
  ]
}
```

---

# 8. API → Process Binding (Glue Document)

This avoids logic leaking into OpenAPI.

```json
{
  "kind": "api_binding",
  "apiType": "openapi",
  "operationId": "POST_/users",
  "processRef": "createUser"
}
```

OpenAPI stays pure.
Execution lives elsewhere.

---

# Hard Rules for AI (Put These in the System Prompt)

You should literally give the AI these constraints:

> * Never invent fields not shown in examples
> * Never embed logic in OpenAPI
> * Never assume database capabilities
> * Every process must declare inputs and outputs
> * Plain JSON is declarative, not executable

---

# Why this works

* These JSON docs are **not trying to be a language**
* They are **contracts for execution**
* AI cannot “get creative” because:

  * structure is rigid
  * semantics are declared
  * examples are canonical

---