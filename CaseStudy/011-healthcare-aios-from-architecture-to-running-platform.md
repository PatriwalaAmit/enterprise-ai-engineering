# Case Study 011: Healthcare AIOS — From Architecture to Running Platform

**How a Complete Docker Compose Stack and Live Clinical Simulation Prove the Intelligence Layer Is Operational**


| Field                         | Value                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| **Case**                      | 011                                                                                            |
| **Industry**                  | Healthcare / Clinical AI                                                                       |
| **Capability**                | Intelligence layer that orchestrates agents, knowledge, policy, and durable care workflows     |
| **Engagement Type**           | Architecture realization — clinical simulation + production Docker Compose stack               |
| **Primary Audience**          | Healthcare architects, clinical informatics leaders, AI platform engineers                     |
| **Stack**                     | LangGraph, Temporal.io, Kafka, OPA, Nginx, Weaviate, Neo4j, PostgreSQL, Redis, Prometheus, Grafana, Docker Compose |
| **Status**                    | Publication-ready                                                                              |
| **Screenshots**               | [screenshots/](./screenshots/) — architecture banner                                           |

---

## Introduction

![Healthcare AIOS: From Architecture to Running Platform](./screenshots/011-architect-diagram.png)

*Figure 1. End-to-end Healthcare AIOS flow — event ingestion through multi-agent reasoning, policy guardrails, durable workflows, and clinician delivery — backed by the production Docker Compose stack.*

Designing a Healthcare AI Operating System is one challenge. Making it real — containerized, observable, policy-governed, and capable of answering “What should happen next?” in a live clinical scenario — is another.

We have now done both.

This article documents the successful realization of Healthcare AIOS as a running platform. It examines two complementary proofs:

1. A full clinical scenario simulation that exercised every core component of the operating system.
2. A production-oriented Docker Compose stack that materializes the entire architecture as coordinated microservices and infrastructure.

Together they demonstrate that the original vision — an intelligence layer that orchestrates rather than replaces existing healthcare systems — is no longer theoretical.

---

## The Operating System Standard Revisited

The foundational definition of Healthcare AIOS remains unchanged:

> Healthcare AIOS is an intelligence layer that sits above existing healthcare systems. It coordinates People, Agents, Knowledge, Memory, Workflows, Policies, Compliance, and Decisions across the ecosystem. Its purpose is not to replace EHRs, laboratories, radiology, pharmacy, or billing systems, but to orchestrate them intelligently and answer the question traditional platforms cannot: **“What should happen next?”**

Any claim of success must be measured against this standard.

---

## Proof 1: The Clinical Scenario Simulation

A complete end-to-end simulation was executed against a synthetic patient (SYNTHETIC-001) with the following trigger events:

- ADT Discharge
- Lab result: HbA1c = 9.2% (LOINC 4548-4)

### Execution Path

**Stage 1 – Event Ingestion**  
Clinical events were published to the Kafka topic `aios.clinical.events` via the Integration Gateway. The system observed the events without writing back to any source system of record.

**Stage 2 – Recommendation Request**  
A structured request was submitted to the API Gateway:

```http
POST /api/v1/recommendations
{
  "patient_id": "SYNTHETIC-001",
  "encounter_id": "ENC-49021",
  "trigger_event": "clinical.adt.discharge",
  "recommendation_types": ["care_gap_alert", "clinical_reasoning"]
}
```

**Stage 3 – Multi-Agent Reasoning**  
The LangGraph-based Agent Runtime activated a Supervisor Agent, which assessed complexity and delegated to the Clinical Reasoning Agent. The agent executed grounded tool calls:

- Retrieved patient summary (active conditions and medications)
- Fetched current guidelines (ADA 2024, KDIGO 2023)
- Performed knowledge search for HbA1c 9.2% management in T2DM with CKD
- Calculated 30-day readmission risk (score 0.18 – low)

**Stage 4 – Policy & Guardrail Enforcement**  
The Open Policy Agent evaluated the proposed recommendations:

- High-risk medication check → Passed
- Confidence threshold (≥ 0.70) → Passed (0.89)
- Governance decision → ALLOWED (Requires Clinician Approval)

**Stage 5 – Durable Workflow Initiation**  
Temporal.io started a 30-day `PostDischargeFollowupWorkflow` containing scheduled tasks for patient outreach, medication adherence verification, and outcome capture.

**Stage 6 – Clinician Delivery**  
Two prioritized, evidence-linked recommendations were delivered to the Clinician Cockpit:

1. **HIGH** – Annual diabetic dilated eye exam overdue (14 months)  
   Confidence 95% | Evidence: ADA 2024 | Action: Ophthalmology referral

2. **MEDIUM** – Consider SGLT2 inhibitor for dual glycemic and renal protection  
   Confidence 89% | Evidence: KDIGO 2023 | Action: Empagliflozin 10 mg daily (clinician approval required)

An immutable audit log entry was created. All six stages completed successfully.

### Mapping to the OS Model

| OS Component   | Evidence in Simulation                                      | Result |
|----------------|-------------------------------------------------------------|--------|
| People         | Clinician Cockpit as the decision surface                   | ✓      |
| Agents         | Supervisor + Clinical Reasoning Agent with tool use         | ✓      |
| Knowledge      | ADA / KDIGO guidelines + semantic evidence retrieval        | ✓      |
| Memory         | Patient context and longitudinal signals used               | ✓      |
| Workflows      | 30-day Temporal post-discharge workflow                     | ✓      |
| Policies       | OPA medication and confidence gates                         | ✓      |
| Compliance     | “Requires Clinician Approval” + full audit trail            | ✓      |
| Decisions      | Prioritized, confidence-scored, evidence-backed actions     | ✓      |

The simulation confirmed that the platform can move from raw clinical events to governed, explainable next actions while preserving human oversight.

---

## Proof 2: The Docker Compose Realization

The running platform is defined by a comprehensive Docker Compose stack that materializes every layer of the architecture.

### Infrastructure Services

| Service              | Role                                      | Technology                     |
|----------------------|-------------------------------------------|--------------------------------|
| postgres             | Primary relational store                  | PostgreSQL 16                  |
| redis                | Caching & short-term state                | Redis 7                        |
| kafka + zookeeper    | Clinical event backbone                   | Confluent 7.6                  |
| neo4j                | Medical knowledge graph                   | Neo4j 5.20 Enterprise          |
| weaviate             | Vector store for RAG                      | Weaviate 1.25                  |
| hapi-fhir            | FHIR R4 server                            | HAPI FHIR                      |
| temporal + temporal-ui | Durable workflow engine                 | Temporal 1.24                  |
| keycloak             | Identity & SMART on FHIR foundation       | Keycloak 24                    |
| opa                  | Policy-as-code engine                     | Open Policy Agent 0.66         |

### Observability Stack

- OpenTelemetry Collector
- Prometheus
- Grafana

### AIOS Microservices

| Service                | Responsibility                              | Port |
|------------------------|---------------------------------------------|------|
| api-gateway            | Unified entry point and orchestration hub   | 8000 |
| agent-runtime          | LangGraph multi-agent execution             | 8001 |
| fhir-gateway           | Bidirectional FHIR + Kafka bridge           | 8002 |
| knowledge-service      | Neo4j + Weaviate knowledge access           | 8003 |
| policy-engine          | OPA client and clinical guardrails          | 8004 |
| audit-service          | Immutable event and decision logging        | 8005 |
| notification-service   | Alerting and outreach                       | 8006 |
| workflow-engine        | Temporal client and long-running processes  | 8007 |
| clinician-cockpit      | Clinician experience layer (Next.js)        | 3000 |

### Architectural Fidelity

The compose file correctly implements the layered design:

```
Experience Layer          → clinician-cockpit
Intelligence Layer        → agent-runtime, knowledge-service, policy-engine,
                            workflow-engine, audit-service, notification-service
Integration Layer         → fhir-gateway, api-gateway, Kafka
Foundation Systems        → HAPI FHIR, Neo4j, Weaviate, Temporal, Postgres, Redis
Cross-cutting Concerns    → Keycloak (identity), OPA (policy), OTEL/Prometheus/Grafana
```

This is not a collection of disconnected containers. It is a coherent operating system topology in which each service has a clear responsibility and communicates through well-defined interfaces.

---

## What the Combined Evidence Demonstrates

### 1. Orchestration Over Replacement
Events are ingested from ADT and laboratory sources. Recommendations are generated and workflows are started. No source system of record is overwritten. The intelligence layer observes and coordinates.

### 2. “What Should Happen Next?” Is Operational
The platform transformed a discharge event and an elevated HbA1c into two concrete, prioritized clinical actions backed by current guidelines and confidence scores.

### 3. Safety Is Structural
Policy evaluation occurs before recommendations are released. High-stakes medication suggestions remain gated behind explicit clinician approval. Auditability is continuous.

### 4. Longitudinal Care Is Native
Temporal workflows enable multi-week processes (outreach, adherence checks, outcome capture) rather than single-shot inference.

### 5. The Stack Matches the Simulation
Every stage of the successful clinical run maps directly onto services defined in the Docker Compose file. The infrastructure is not aspirational; it is the actual runtime environment that produced the results.

### 6. Observability and Governance Are First-Class
OpenTelemetry, Prometheus, Grafana, OPA, Keycloak, and the dedicated audit service ensure that the system is measurable, controllable, and accountable — requirements for any clinical-grade platform.

---

## Current Maturity Assessment

| Dimension                    | Status          | Notes |
|-----------------------------|-----------------|-------|
| Core intelligence loop      | Operational     | Proven in simulation |
| Multi-agent reasoning       | Operational     | Supervisor + specialist pattern |
| Knowledge hybrid (graph + vector) | Operational | Neo4j + Weaviate |
| Policy enforcement          | Operational     | OPA with clinical rules |
| Durable workflows           | Operational     | Temporal post-discharge pathway |
| FHIR interoperability       | Present         | HAPI FHIR + dedicated gateway |
| Identity foundation         | Present         | Keycloak with realm import |
| Observability               | Present         | Full OTEL + metrics + dashboards |
| Clinician experience        | Present         | Cockpit streaming recommendations |
| Production hardening        | In progress     | Secrets, resource limits, health checks still being refined |

The platform has crossed the critical threshold from architecture to working system.

---

## Implications

With both the clinical simulation and the containerized stack validated, Healthcare AIOS is positioned for the next phase of work:

- Expansion of specialized agents (prior authorization, documentation, capacity management)
- Deeper bidirectional FHIR integration with live EHR environments
- Additional longitudinal care pathways
- Continuous evaluation of recommendation acceptance, care-gap closure, and safety metrics
- Controlled introduction of limited autonomy inside strictly defined policy boundaries
- Hardening for multi-tenant and regulated deployment

The foundational claim has been substantiated: an intelligence layer can coordinate agents, knowledge, policy, and durable workflows while remaining subordinate to clinician judgment and existing systems of record.

---

## Conclusion

Healthcare AIOS is no longer a diagram.

It is a running platform that:

- Ingests real clinical events
- Reasons with specialized agents grounded in current guidelines
- Enforces policy and confidence thresholds before action
- Initiates long-running care workflows
- Delivers explainable recommendations to clinicians
- Maintains a complete audit trail
- Exists as a coherent, multi-service Docker Compose stack that mirrors the original layered architecture

The system successfully answers “What should happen next?” for a patient with uncontrolled diabetes and an overdue eye exam — while preserving the core principle that it orchestrates existing healthcare systems rather than replacing them.

The operating system is live.