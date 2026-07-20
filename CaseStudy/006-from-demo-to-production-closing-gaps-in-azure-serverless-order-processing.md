# From Demo to Production — Closing the Gaps in Azure Serverless Order Processing

*Why most Azure Functions + Service Bus tutorials stop too early—and what enterprise architects actually build.*

**Also titled:** Highly Recommended Steps for Building Production-Ready Serverless Architecture on Azure: A Production Architecture Review

---

## TL;DR

A typical Azure Functions + Service Bus order-processing demo takes an afternoon to build and looks production-ready. It isn't. This production architecture review walks through the same design with the mechanisms most tutorials — and many architecture write-ups — leave as diagrams instead of decisions: which Azure service actually fits your throughput and ordering needs, what idempotency looks like as a real SQL transaction, how a saga is implemented (not just drawn), which hosting plan your security requirements force you into, and what breaks first when you scale past the demo.

A production-ready serverless architecture must also answer:

- How do you prevent duplicate order processing?
- What happens if payment succeeds but the application crashes before acknowledging the message?
- How do you evolve event contracts without breaking existing consumers?
- How do you recover from poison messages in the Dead Letter Queue?
- How do you coordinate payment, inventory, and shipping without creating inconsistent business states?
- How do you observe an entire business transaction across dozens of distributed services?
- How do you scale during Black Friday traffic without overwhelming your SQL database?

This is not another "Build Your First Azure Function" tutorial. It is a production architecture review that names the patterns **and** the specific Azure mechanisms that make them true in production.

---

## Introduction

Serverless computing has fundamentally changed how we build cloud-native applications. With Azure Functions, Azure Service Bus, Azure Storage, and Azure SQL, developers can build highly scalable event-driven systems without provisioning or managing servers. The platform automatically handles scaling, infrastructure, and execution, allowing teams to focus on delivering business functionality.

As a result, many development teams adopt an architecture that looks something like this:

```
Client
   │
   ▼
Azure Function
   │
Azure SQL
   │
Azure Service Bus
   │
Multiple Azure Functions
```

At first glance, the architecture appears complete. Orders are accepted, messages are published, downstream services process events, and Azure automatically scales the workload.

Unfortunately, this is where most tutorials end.

Production systems introduce an entirely different set of challenges. Messages are delivered more than once. External payment providers become unavailable. Event schemas evolve over time. Customers retry requests, creating duplicate orders. Functions scale to hundreds of instances, exhausting database connection pools. Dead Letter Queues begin to grow, and distributed tracing becomes essential for diagnosing failures across multiple services.

These are not edge cases—they are everyday realities in enterprise systems.

The difference between a proof of concept and a production platform is rarely the technology itself. It is the collection of architectural patterns that make the system resilient under failure, scalable under peak load, observable during incidents, secure by design, and maintainable as the platform evolves.

In this article, we'll review a typical Azure serverless architecture through the lens of an enterprise architect. Rather than explaining how to create an Azure Function or publish a Service Bus message, we'll identify the gaps commonly found in reference implementations and discuss the production-grade patterns that close those gaps—including event versioning, the Outbox Pattern, idempotent consumers, saga orchestration, compensation workflows, distributed tracing, Infrastructure as Code, and operational readiness.

The goal is simple:

**Move from building a serverless application that works in a demo to building one that continues to work when millions of customers depend on it.**

---

## 1. The Starting Point

Most reference architectures converge on this:

```
Client
   │
   ▼
Azure Function (HTTP trigger)
   │
Azure SQL
   │
Azure Service Bus
   │
Downstream Functions (Payment, Inventory, Shipping)
```

This works in a demo because a demo has one order, one consumer, and no failures. Production has none of those luxuries.

Most Azure serverless tutorials demonstrate how to:

1. Create an Azure Function
2. Publish a message to Azure Service Bus
3. Trigger another Function
4. Update a database

That's enough for a demo. It is not enough for production.

| Reality | Why it breaks demos |
|---|---|
| Payment failures | Downstream steps must stop or compensate |
| Duplicate messages | At-least-once delivery is the default |
| Schema evolution | Consumers cannot all upgrade on the same day |
| Partial failures | One service succeeds; another crashes mid-flow |
| Massive traffic spikes | Average RPS hides Black Friday bursts |
| Regional outages | Single-region designs become single points of failure |
| Consumer version upgrades | Rolling deploys leave mixed versions in production |

The sections below keep the classic fifteen-step checklist, then add the **expert decisions** most architecture checklists leave as diagrams.

---

## Step 1 – Design the Business Workflow Before Writing Code

The first mistake is treating every Function as independent.

Most business processes are not.

```
Order Created
      ↓
   Payment
      ↓
  Inventory
      ↓
  Shipping
      ↓
Notification
```

If Payment fails:

- Inventory reservation must be released
- Shipping must never start
- Customer must be notified

This requires a **business workflow**, not just independent Functions.

### Recommendation

Define a business state machine first.

```
Created
   ↓
Payment Pending
   ↓
Paid
   ↓
Packed
   ↓
Shipped
   ↓
Delivered
```

Every event should move the order to the next **valid** state. Invalid transitions—Paid → Delivered without Packing, or Payment Failed → Shipping—should be rejected by the domain model, not discovered in production logs.

---

## Step 2 – Design a Proper Event Contract

Many examples publish events like:

```json
{
  "OrderId": "1001",
  "Amount": 1200
}
```

That is insufficient.

A production event should include:

```json
{
  "eventId": "8f3c2a1e-4b9d-4e2f-9c1a-7d6e5f4a3b2c",
  "eventType": "OrderCreated",
  "version": "1.0",
  "occurredAt": "2026-07-15T08:00:00Z",
  "correlationId": "corr-9a2b-...",
  "orderId": "1001",
  "customerId": "cust-4421",
  "items": [
    { "sku": "SKU-100", "quantity": 2, "unitPrice": 600 }
  ]
}
```

Without **EventId**, **CorrelationId**, **Version**, and **Timestamp**, you cannot build reliable distributed systems. You lose the ability to deduplicate, trace, migrate schemas, and reconstruct timelines during incidents.

---

## Step 3 – Version Every Event

Never publish anonymous JSON.

```
OrderCreated v1
      ↓
OrderCreated v2
      ↓
OrderCreated v3
```

Consumers should support multiple versions during migration. Never force all consumers to upgrade simultaneously.

Practical guidelines:

- Prefer additive, backward-compatible changes when possible
- Publish a new `version` (or `eventType` + version) when breaking changes are unavoidable
- Keep dual readers alive until lagging consumers are retired
- Document a deprecation window and enforce it in CI with contract tests

Separately from event schema versioning: if you use Durable Functions for the saga (Decision 3), the **orchestrator itself** needs a versioning strategy so in-flight instances are not broken by non-deterministic code changes.

---

## Expert Decision 1 — Pick the Right Backbone Before You Pick a Pattern

Every architecture checklist jumps straight to Outbox / Saga / DLQ. The decision that precedes all of them — **which Azure messaging service you're actually building on** — is usually assumed rather than justified.

| Requirement | Service Bus (Topics/Subscriptions) | Event Hubs | Durable Functions |
|---|---|---|---|
| Message volume | Thousands/sec | Millions/sec | Low–moderate (orchestration, not bulk ingest) |
| Ordering guarantee | Yes, via sessions (per-key FIFO) | Yes, via partition key | Yes, inherent to the orchestrator |
| Use case fit | Business events (Order, Payment, Shipment) | Telemetry, clickstream, IoT | Multi-step workflows with compensation |
| Built-in DLQ | Yes | No (manual) | No (exceptions handled in code) |
| Cost model | Per-operation + tier | Throughput units | Per-execution + storage |

For an order-processing workflow, the honest answer is: **Service Bus with sessions**, for a state machine that includes rollback. Event Hubs is the wrong tool here even though it's the "more scalable" one on paper — you don't have telemetry volume, you have business transactions that need ordering and compensation.

**Why this matters:** choosing Service Bus **without** sessions means "Payment succeeded before Order was created" is a real race condition, not an edge case. Key sessions by `OrderId` so events for the same order are processed FIFO.

---

## Step 4 – Implement the Outbox Pattern Properly

Many articles simply say: *Use the Outbox Pattern.*

That is incomplete.

A production implementation requires writing business state and the outgoing event in the **same database transaction**:

```
Database Transaction
├── Orders
└── Outbox
```

A dedicated publisher should then:

1. Poll unpublished events
2. Publish to Service Bus
3. Mark events as published
4. Retry failures
5. Remove or archive old records

The publisher itself must also be **idempotent**. If it crashes after publishing but before marking the row, a retry must not create a second logical event for consumers that already processed the first delivery (or consumers must tolerate duplicates via Step 5).

Without an outbox, the classic dual-write failure remains:

```
Write Orders  → success
Publish SB    → crash / timeout
```

Your database thinks the order exists. Downstream services never heard about it.

### Expert Decision 5 — Outbox Latency Budget

"Poll unpublished events" hides a real tradeoff:

| Approach | Latency | Complexity | Load on DB |
|---|---|---|---|
| Polling (e.g., every 2s) | Up to poll-interval delay | Low | Constant query load |
| SQL Change Feed / CDC (e.g., Debezium) | Near-real-time | Higher (extra infra) | Lower (log-based, not query-based) |

Polling is fine for order processing (seconds of latency are acceptable). It would **not** be fine for a use case needing sub-second propagation — worth stating so readers can self-select rather than copying the pattern blind.

Also: a polling publisher that crashes mid-batch and restarts may re-publish already-published events unless the publisher's own "mark as published" step is itself idempotent. The outbox pattern only closes the dual-write gap once, at the DB write; a naive publisher reopens it downstream.

---

## Step 5 – Design Idempotency from Day One

A common implementation is:

```
Check Table
     ↓
   Insert
     ↓
  Process
```

This is unsafe. Two concurrent deliveries may both pass the check.

Instead:

```
Insert MessageId
       ↓
Unique Constraint
       ↓
    Success?
   /        \
 Yes         No
  ↓           ↓
Process    Ignore
```

### Expert Decision 2 — Idempotency as Code, Not as a Flowchart

The flow above is correct. Here is the mechanism that makes it true, not aspirational:

```sql
BEGIN TRANSACTION;

INSERT INTO ProcessedMessages (MessageId, ProcessedAt)
VALUES (@MessageId, SYSUTCDATETIME());
-- MessageId has a UNIQUE constraint

-- If the insert above throws a duplicate-key violation,
-- the transaction rolls back and the message is dropped as already-processed.

UPDATE Orders
SET Status = 'Paid'
WHERE OrderId = @OrderId;

COMMIT TRANSACTION;
```

The insert and the business update happening **inside the same transaction** is the entire point — it's what makes "two concurrent deliveries" fail safely instead of double-processing. A separate check-then-insert (even microseconds apart) reintroduces the race condition the pattern exists to prevent.

Service Bus provides at-least-once delivery; your consumers must assume duplicates. Idempotency keys should typically be the message `eventId` (or a stable business key such as `orderId` + `eventType` when that is safe). Do not invent a new key per retry of the same logical event.

---

## Step 6 – Design Failure Handling

Retries are only one part of the solution.

```
Transient Failure
       ↓
     Retry
       ↓
    Success
```

and

```
Permanent Failure
       ↓
Dead Letter Queue
       ↓
     Alert
       ↓
 Investigation
       ↓
     Replay
```

| Concern | Decision to make before go-live |
|---|---|
| Retry intervals | Fixed vs exponential backoff |
| Maximum attempts | Cap before DLQ |
| Backoff strategy | Jitter to avoid thundering herds |
| Poison messages | What makes a failure permanent |
| Replay process | Who can replay, how, and with what audit trail |

Azure Service Bus already provides delivery counts and DLQ. Architecture still owns the policy: which exceptions are retryable, which are not, and how operators recover.

---

## Step 7 – Introduce Saga and Compensation

Without compensation:

```
Payment Failed
      ↓
Shipping Continues
```

This is unacceptable.

Instead:

```
Payment Failed
      ↓
OrderCancelled
      ↓
Release Inventory
      ↓
Cancel Shipment
      ↓
Notify Customer
```

### Expert Decision 3 — Saga as an Engine, Not a Diagram

"Payment Failed → Cancel Order → Release Inventory" is a compensation sequence. Something has to **own** that sequence, retry it, and survive a crash mid-way. Two real options:

**Choreography** (each service reacts to events from the last):

```
PaymentFailed event
   → Inventory service listens, releases stock, emits InventoryReleased
   → Shipping service listens, cancels shipment, emits ShipmentCancelled
   → Notification service listens, emails customer
```

No single owner of the workflow. Simple to start, hard to debug ("who's supposed to react to this?" grows with every service).

**Orchestration** (Durable Functions owns the sequence explicitly):

```csharp
[FunctionName("OrderSaga")]
public static async Task Run(IDurableOrchestrationContext ctx)
{
    var order = ctx.GetInput<OrderRequest>();
    try
    {
        await ctx.CallActivityAsync("ReserveInventory", order);
        await ctx.CallActivityAsync("ChargePayment", order);
        await ctx.CallActivityAsync("CreateShipment", order);
    }
    catch (FunctionFailedException)
    {
        await ctx.CallActivityAsync("ReleaseInventory", order);
        await ctx.CallActivityAsync("RefundPayment", order);
        await ctx.CallActivityAsync("NotifyCustomer", order);
    }
}
```

| | Choreography | Orchestration (Durable Functions) |
|---|---|---|
| Ownership of workflow state | Implicit, spread across services | Explicit, in one orchestrator |
| Debuggability | Hard — trace across N event handlers | Easy — orchestration history is queryable |
| Crash recovery | Depends on each consumer's retry logic | Built-in checkpointing; resumes mid-workflow |
| Coupling | Low (services don't know about each other) | Higher (orchestrator knows the full sequence) |
| Best fit | Many independent services, loose coupling desired | A defined business workflow with compensation, like this one |

For order processing specifically, **orchestration wins** — the whole point of the saga is a known, finite sequence with defined rollback, which is exactly what Durable Functions checkpoints for you. Choreography is the right call when you don't want a central owner (e.g., broad pub/sub fan-out); it's the wrong call for "if step 2 fails, undo step 1 in this exact order."

---

## Step 8 – Design for Scale

Average traffic is misleading.

One million orders per day is only ~12 orders/second on average, but Black Friday or flash sales can create bursts **10–50×** higher.

| Area | What to tune / plan |
|---|---|
| Messaging | Azure Service Bus Premium for predictable latency and larger workloads |
| Consumers | Prefetch and `MaxConcurrentCalls` |
| Data tier | SQL connection pooling; avoid one connection per Function instance under burst |
| Compute | Function scaling limits and cold starts |
| Upstream | APIM rate limits and back-pressure before the database melts |

Capacity planning should be part of the design, not an afterthought. Model peak concurrent executions, not daily averages.

---

## Step 9 – Build an Observability Strategy

Logging alone is insufficient.

Every request should carry:

- `CorrelationId`
- `TraceId`
- `SpanId`

```
API
 ↓
Service Bus
 ↓
Payment
 ↓
Inventory
 ↓
Shipping
```

Use distributed tracing (Application Insights / OpenTelemetry) so a single customer request can be followed across all services. When a support ticket says "order 1001 stuck," you need one query—not fifteen log greps across Function apps.

Complement tracing with:

- Structured logs that include `eventId` and `orderId`
- Metrics for lag, DLQ depth, publish failures, and saga duration
- Alerts tied to business SLOs, not only infrastructure CPU

### Expert Decision 6 — Observability Without the Bill Shock

Application Insights ingests everything by default, and at scale this gets expensive fast. Two things missing from most "add App Insights" checklists:

1. **Sampling** — adaptive sampling (default) or fixed-rate sampling to cap ingestion volume while preserving trace continuity.
2. **Correlation across the async boundary** — `CorrelationId` must be explicitly propagated into the Service Bus message's `ApplicationProperties`. It does **not** flow automatically across a queue the way it does across a synchronous HTTP call chain. This is the most common reason distributed traces "break" at the exact point they're needed most: the moment a message leaves a queue.

---

## Step 10 – Secure the Platform

Security involves more than Managed Identity.

| Control | Purpose |
|---|---|
| API authentication | Who can create orders |
| APIM policies | Centralized authz, transformation, threat protection |
| Rate limiting | Protect backends from abuse and burst storms |
| Payload validation | Reject invalid or oversized events early |
| Private Endpoints | Keep Service Bus / SQL off the public internet |
| VNet Integration | Control Function egress and private access |
| RBAC | Least privilege for apps and operators |
| Key Vault + rotation | Secrets never in app settings long-term |

Serverless reduces server patching. It does not remove identity, network, or data protection responsibilities.

### Expert Decision 4 — The Hosting Plan Your Security Section Silently Requires

Private Endpoints and VNet Integration have a dependency that isn't usually stated:

| Plan | VNet Integration | Private Endpoints | Cold Start | Cost Model |
|---|---|---|---|---|
| Consumption | No | No | Yes (can be 1–5s) | Pay-per-execution |
| Premium | Yes | Yes | Minimal (pre-warmed instances) | Pay for pre-warmed + burst |
| Dedicated (App Service Plan) | Yes | Yes | None | Fixed cost regardless of load |

If your security requirements include Private Endpoints — which they will, for any system touching Azure SQL in an enterprise environment — **you cannot use the Consumption plan**. This single fact quietly invalidates "serverless = pay only for what you use" as a blanket claim once security requirements are layered in. Worth stating explicitly rather than letting a reader discover it during a deployment failure.

---

## Step 11 – Build for Operations

Dead Letter Queue is not the end.

```
DLQ
 ↓
Alert
 ↓
Dashboard
 ↓
Replay Tool
 ↓
Audit
```

Operations teams require visibility and **safe** replay mechanisms:

- Filter by failure reason, event type, and time window
- Replay individually or in batches
- Preserve original `eventId` / correlation for audit
- Prevent silent double-processing via the same idempotency store used in production

A DLQ without a replay path becomes a graveyard. A replay path without audit becomes a liability. DLQ replay tooling also assumes someone owns on-call response — without that, the pattern adds complexity without adding resilience.

---

## Step 12 – Infrastructure as Code

Production deployments should be repeatable.

- Bicep or Terraform
- GitHub Actions (or Azure DevOps)
- Environment approvals
- Deployment slots
- Rollback strategy

Infrastructure should never be created manually. Topics, subscriptions, **session configuration**, filter rules, Function app settings, Private Endpoints, and monitoring alerts are part of the system. If they only exist in a portal click-path, they will drift—and incident response will guess.

---

## Step 13 – Test Beyond Unit Tests

| Test type | What it proves |
|---|---|
| Unit tests | Domain rules and state transitions |
| Integration tests | Function ↔ SQL ↔ Service Bus wiring |
| Contract tests | Producers and consumers agree on event versions |
| Load tests | Peak RPS and connection pool behavior |
| Chaos testing | Partial failures and timeout paths |
| End-to-end workflow validation | Full saga + compensation paths |

If you only unit-test handlers, you will discover dual-write, idempotency races, and DLQ behavior for the first time in production.

---

## Step 14 – Handle API Idempotency

Client retries can create duplicate orders.

```http
POST /orders
Idempotency-Key: f7d9b8c2-1a3e-4d5f-9b0c-6e7a8d9f0123
```

The server should return the original result if the same key is submitted again. Persist the key with the request fingerprint (or response) so a network timeout on the client does not become two paid orders in the database.

This is complementary to consumer idempotency (Step 5). One protects the **ingress**; the other protects **async processing**. You need both.

---

## Step 15 – Plan for Data Lifecycle

Enterprise systems also require:

- Retention policies
- Audit logs
- Privacy / deletion workflows
- Archival
- Backup
- Disaster recovery

These requirements are often ignored in tutorials but are critical in production. Outbox tables grow. Event stores grow. PII in payloads becomes a compliance risk. Decide retention and redaction rules while designing the event contract—not after legal asks for a deletion workflow.

### Expert Decision 7 — Data Residency: GDPR Isn't the Whole Story

For an India-based architecture practice, this is worth calling out explicitly rather than defaulting to GDPR alone: India's **Digital Personal Data Protection Act (DPDP) 2023** imposes its own consent, breach-notification, and cross-border transfer requirements, distinct from GDPR's. An enterprise system serving Indian customers — or built by an Indian team for a global client — needs **both** addressed, not GDPR alone with an implicit "and similar regs." This is also a natural differentiator versus mostly US-written versions of the same architecture review.

---

## Revised Final Architecture

```
Client
   │
   ▼
API Management (auth, rate limiting, payload validation)
   │
Azure Function (Premium plan — VNet + Private Endpoint required)
   │
Idempotency Check (unique constraint, same transaction as business write)
   │
Azure SQL ── Orders + Outbox (same transaction)
   │
Outbox Publisher (polling, idempotent itself)
   │
Azure Service Bus Topic (sessions enabled, keyed by OrderId — guarantees order)
   │
   ├── Payment Function
   ├── Inventory Function
   ├── Shipping Function
   └── Notification Function
   │
Durable Functions Orchestrator (owns saga state + compensation)
   │
Application Insights (sampled, CorrelationId propagated via message properties)
   │
DLQ → Alert → Replay Tool → Audit Log
```

Compared to the tutorial diagram, almost every box above exists to handle a failure mode, scale cliff, or operational need that demos never show — and each box implies a concrete Azure mechanism, not just a label.

---

## Honest Failure Scenarios

**Session-enabled Service Bus under partial outage.** If a session lock isn't released cleanly (consumer crash), that session's messages stall until the lock times out (default 30s, configurable). For an order stuck in "Payment Pending" during that window, this is usually fine — but it's a real, measurable delay, not a theoretical one.

**Durable Functions orchestrator versioning.** Updating the orchestrator's code while in-flight orchestrations exist can break replay determinism. This needs a versioning strategy for the orchestrator itself, separate from event schema versioning.

**Outbox polling under DB failover.** A polling publisher that crashes mid-batch and restarts may re-publish already-published events unless the publisher's own "mark as published" step is itself idempotent — the outbox pattern only closes the gap once, at the DB write; a naive publisher reopens it downstream.

---

## Where This Pattern Breaks Down

**High-throughput, order-independent events** (clickstream, telemetry): don't force this pattern. Event Hubs without sessions/saga overhead is simpler and cheaper.

**Very small systems:** a Durable Functions orchestrator, sessioned Service Bus, and CDC-based outbox is meaningful overhead for a system processing a few hundred orders a day. The original 15-step checklist is the right **ceiling**, not the right **floor** — apply it in proportion to actual failure cost, not by default.

**Teams without dedicated ops capacity:** DLQ replay tooling and saga compensation logic both assume someone owns on-call response. Without that, the pattern adds complexity without adding resilience — the failures still happen, just now with more moving parts to diagnose.

---

## Production Architecture Summary

| # | What tutorials leave out | Production mechanism (not just the name) |
|---|---|---|
| 1 | Independent Functions | Business state machine with valid transitions |
| 2 | Minimal JSON payloads | Rich event contracts (`eventId`, version, correlation) |
| 3 | Unversioned messages | Event versioning + dual consumers (+ orchestrator versioning) |
| Backbone | Assumed Service Bus / Event Hubs | Service Bus **with sessions** keyed by `OrderId` |
| 4 | Direct dual writes | Transactional Outbox + **idempotent** publisher; polling latency budget |
| 5 | Check-then-insert | Unique constraint insert + business update in **one SQL transaction** |
| 6 | Blind retries | Retry policy + DLQ + audited replay |
| 7 | Happy-path / saga diagram only | Durable Functions **orchestration** with compensation activities |
| 8 | Average traffic thinking | Peak / burst capacity design |
| 9 | App logs only | Sampling + `CorrelationId` in Service Bus `ApplicationProperties` |
| 10 | Managed Identity alone | Private Endpoints → **Premium/Dedicated plan** (not Consumption) |
| 11 | DLQ as a dump | Alert → dashboard → audited replay + on-call ownership |
| 12 | Portal clicks | IaC + CI/CD + rollback (including session config) |
| 13 | Unit tests only | Contract, load, chaos, E2E |
| 14 | No client retry story | `Idempotency-Key` on APIs |
| 15 | GDPR-only / infinite retention | Lifecycle, DR, **GDPR + DPDP 2023** where applicable |

---

## Conclusion

The original checklist — Outbox, versioning, idempotency, sagas, DLQ, IaC, observability — is the correct list of concerns. What separates a reference architecture from a production one isn't naming these patterns; it's the specific mechanism chosen for each (sessions vs. plain topics, orchestration vs. choreography, transaction-scoped idempotency vs. check-then-insert) and being honest about which hosting / cost / latency tradeoff that mechanism forces on you.

An architecture review that stays at the diagram level has, itself, a gap: it tells you what to build, not which of several real options to build it with.

Serverless architectures are deceptively simple. Building a demo with Azure Functions and Azure Service Bus takes minutes. Building a system that can withstand failures, scale during peak demand, evolve over time, and remain observable and secure requires deliberate architectural decisions — including when **not** to apply the full pattern.

The platform makes the happy path easy. Production readiness is still an architecture problem—and it starts before the first Function is deployed.
