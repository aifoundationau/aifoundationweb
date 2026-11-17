---
name: managed-ai-agent-hosting
description: Builds, audits, and maintains the strictly advisory-only "Services - Managed AI Agent Hosting & Maintenance" paid consultation workflow. Enforces zero external access to client servers, cloud accounts, or codebases, automatic secret redaction, Stripe AUD exclusive-GST checkout, 6-step search-grounded workflow and SLA discovery, preliminary TXT blueprint generation, asynchronous Google Cloud runtime and observability research dispatch, and an interactive SuperAdmin Document Analysis and Improvement Studio to deliver a final reviewed TXT blueprint.
---

# Services - Managed AI Agent Hosting & Maintenance (Advisory-Only Skill)

## 1. Ironclad Zero-Access & Purely Client Advisory Scope
This online workflow exists strictly to **understand a client's fragmented workflows, institutional tasks, and live operations, and advise them on the exact AI agent hosting, programming, and maintenance blueprint required**. It **accesses nothing** in any client environment:
- **Zero External Access**: NEVER request or configure OAuth scopes, SSH credentials, webhook URLs, or API tokens for any client server, cloud project, repository, database, Google Workspace, CRM, or ERP.
- **Zero File Uploads or Credentials**: Plain-text Q&A chat only in `#managedAgentModal` (zero `<input type="file">` controls; block drag-and-drop files). NEVER ask for passwords, API keys, service account JSONs, or confidential PII.
- **SuperAdmin-Only Local `.txt` Loader**: DOM `FileReader` (`<input type="file" accept=".txt,text/plain">`) is strictly confined to the authenticated SuperAdmin `#admin-managed-agent-studio` pane.
- **Automatic Credential Redaction**: Scrub secret/key/token patterns to `[REDACTED_SECRET]` using `redactSecrets()` prior to AI calls or Firestore persistence.
- **Advisory Focus Only**: Frame every deliverable section strictly as a plain-text architectural, programming, and maintenance blueprint explaining zero-downtime agent infrastructure and operational maintenance cadence without touching live client systems.

## 2. Partition Key, RBAC & UI Protection
- **Partition Key**: Enforce `tag: 'aifoundation'`, `businessId: '#aifoundation'`, `businessName: 'AI Foundation'`, `source: 'aifoundation'` across Firestore writes and Stripe metadata (Firestore rules also permit reading legacy `'aifoundation'` records).
- **RBAC**: Newly registered users default to `role: 'supporter'`. SuperAdmin inbox, runtime-research analysis, draft editing, approval/delivery, and 2-step Confirm Delete routes (`/api/managed-agent/superadmin/*`, `aifoundation_managed_agent_reviews`, `#admin-managed-agent-studio`) are restricted strictly to `role === 'superadmin'`.

## 3. Service Landing View, Three Deliverables & Time Estimate Banner
In `#managedAgentModal`:
- **Category Badge**: *Services — Production Agent Architecture & Operations Advisory*
- **Title**: *Managed AI Agent Hosting & Maintenance*
- **Subtitle**: *Convert fragmented workflows, institutional tasks, and live operations into reliable, self-sustaining AI agents with zero downtime and continuous performance monitoring.*
- **Three Deliverables**:
  1. *Managed AI agent hosting & infrastructure setup*
  2. *Custom agent programming & prompt optimization*
  3. *Continuous monitoring, safety & system maintenance*
- **Zero-Access Trust Notice** & **Time Estimate Banner** (~1 min Stripe Checkout; ~6–9 mins 6-step Q&A; ~30–60s Preliminary `.txt`; 24–48 business hrs Systems Architect Improved Final Blueprint `.txt`).

## 4. Stripe Checkout Gate (AUD + Exclusive GST)
- Reads admin `ai-agent-hosting.setup` AUD price when positive, else `Number(process.env.MANAGED_AGENT_ADVISORY_PRICE_AUD_CENTS) || 34900` ($349.00 AUD ex GST).
- Enforces `currency: 'aud'`, `automatic_tax: { enabled: true }`, `tax_behavior: 'exclusive'`, `invoice_creation: { enabled: true }`, `metadata` with `businessId: '#aifoundation'`, `workflow: 'advisory_with_superadmin_improvement'`, cards only (`payment_method_types: ['card']`), webhook-free idempotent unlock (`status: 'paid_intake_ready'`) via `stripe.checkout.sessions.retrieve()` on `POST /api/managed-agent/confirm`, on reload, or by SuperAdmin Verify pending payments. Never add Stripe webhooks or `STRIPE_WEBHOOK_SECRET`.

## 5. Stage 1, Stage 2 & Stage 3 Lifecycle
- **Stage 1 (6 Questions)**: Uses `@google/genai` `interactions.create` (`process.env.GEMINI_MODEL` -> `gemini-3.5-flash-lite`) with `{ type: 'google_search' }` on Q1 (industry workflows & operational bottlenecks), covering Industry & Fragmented Workflows, Agent Tasks & MCP/Tool Specs, Zero-Downtime SLA/Latency/Concurrency, Hosting Boundary & Safety Guardrails, Live Tracing/Drift Evaluation & Maintenance Cadence, and AUD Budget & 30-Day Priorities, validated by strict `ManagedAgentIntakeSchema`.
- **Stage 2a**: Immediately emits `PRELIMINARY_Managed_AI_Agent_Hosting_Advisory_[Org]_[YYYY-MM-DD].txt`, DOM `Blob` download, and *"Under Superadmin Analysis"* badge (`status: 'awaiting_superadmin_improvement'`).
- **Stage 2b**: Async `GEMINI_FALLBACK_MODEL` (`gemini-4-hydrogen`) search-grounded Cloud Run / Vertex / Vercel zero-downtime topology, MCP structured outputs, and OpenTelemetry tracing/alerting/drift maintenance research -> unread review doc (`subject: '[Action Required: Analyse & Improve] Managed AI Agent Hosting — [Org]'`) + `chat_interactions` notification.
- **Stage 3**: SuperAdmin edits in `#admin-managed-agent-studio` (`Save Draft`, `Download Working .txt`, DOM `FileReader` `Load Edited .txt`, `Executive Note`, 2-step `Approve & Send Improved Plan`, 2-step `Confirm Delete`) -> `FINAL_REVIEWED_Managed_AI_Agent_Hosting_Advisory_[Org]_[YYYY-MM-DD].txt`, `reviewedByUid`, `reviewedAt`, `status: 'final_improved_delivered'`, client notification & portal download.
