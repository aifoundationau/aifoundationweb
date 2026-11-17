---
name: ai-tool-selection-governance
description: Builds, audits, and maintains the strictly advisory-only "Services - AI Tool Selection & Governance Advisory" paid consultation workflow. Enforces zero external access to client EHR, LMS, or on-premise systems, automatic secret redaction, Stripe AUD exclusive-GST checkout, 6-step search-grounded scoping, preliminary TXT tool-stack generation, asynchronous public vendor/air-gap/regulatory research dispatch, and an interactive SuperAdmin Document Analysis and Improvement Studio to deliver a final vetted TXT plan.
---

# Services - AI Tool Selection & Governance Advisory (Advisory-Only Skill)

## 1. Ironclad Zero-Access & Purely Client Advisory Scope
This service exists strictly to **understand a high-compliance client's requirements and advise them on the exact AI tools, multimodal platforms, and on-premise air-gapped or secure cloud configurations they should procure and adopt**. It **accesses nothing** in any client environment:
- **Zero External Account or Network Access**: NEVER connect to or request OAuth scopes, SSH keys, API tokens, or network probes for any client clinical/EHR software, university LMS, research server, corporate workspace, on-premise LAN, or cloud account.
- **Zero File Uploads, PHI, or Credentials**: Plain-text Q&A chat only in `#toolGovernanceModal` (zero `<input type="file">` controls; block drag-and-drop files). NEVER ask for PHI, PII, internal IP addresses, patient charts, academic manuscripts, board papers, logins, or API keys.
- **SuperAdmin-Only Local `.txt` Loader**: DOM `FileReader` (`<input type="file" accept=".txt,text/plain">`) is strictly confined to the authenticated SuperAdmin `#admin-tool-governance-studio` pane.
- **Automatic Credential Redaction**: Scrub secret/key/token patterns to `[REDACTED_SECRET]` using `redactSecrets()` prior to AI calls or Firestore persistence.
- **Advisory Focus Only**: Frame every output section strictly as strategic tool-selection, infrastructure-compliance, and governance advice (no automated external provisioning, clinical diagnosis, or legal representation).

## 2. Partition Key, RBAC & UI Protection
- **Partition Key**: Enforce `tag: 'aifoundation'`, `businessId: '#aifoundation'`, `businessName: 'AI Foundation'`, `source: 'aifoundation'` across Firestore writes and Stripe metadata (Firestore rules also permit reading legacy `'aifoundation'` records).
- **RBAC**: Newly registered users default to `role: 'supporter'`. SuperAdmin inbox, research, draft editing, approval/delivery, and 2-step Confirm Delete routes (`/api/tool-governance/superadmin/*`, `aifoundation_tool_governance_reviews`, `#admin-tool-governance-studio`) are restricted strictly to `role === 'superadmin'`.

## 3. Service Landing View, Three Deliverables & Time Estimate Banner
In `#toolGovernanceModal`:
- **Category Badge**: *Services — High-Compliance AI Counsel*
- **Title**: *AI Tool Selection & Governance Advisory*
- **Subtitle**: *Specialized strategic counsel for high-compliance environments across medical regulatory frameworks, academic integrity, and corporate governance. We advise on the exact AI tools required.*
- **Three Deliverables**:
  1. *High-precision AI tool evaluation & stack selection*
  2. *Multimodal workflow, software & platform vetting*
  3. *On-premise air-gapped / secure cloud tool compliance*
- **Zero-Access Trust Notice** & **Time Estimate Banner** (~1 min Stripe Checkout; ~6–9 mins 6-step Q&A; ~30–60s Preliminary `.txt`; 24–48 business hrs Lead Architect Final Vetted `.txt`).

## 4. Stripe Checkout Gate (AUD + Exclusive GST)
- Reads admin `stack-selection` AUD price when positive, else `Number(process.env.AI_TOOL_GOVERNANCE_PRICE_AUD_CENTS) || 39900` ($399.00 AUD ex GST).
- Enforces `currency: 'aud'`, `automatic_tax: { enabled: true }`, `tax_behavior: 'exclusive'`, `invoice_creation: { enabled: true }`, `metadata` with `businessId: '#aifoundation'`, `workflow: 'advisory_with_superadmin_improvement'`, cards only (`payment_method_types: ['card']`), webhook-free idempotent unlock (`status: 'paid_intake_ready'`) via `stripe.checkout.sessions.retrieve()` on `POST /api/tool-governance/confirm`, on reload, or by SuperAdmin Verify pending payments. Never add Stripe webhooks or `STRIPE_WEBHOOK_SECRET`.

## 5. Stage 1, Stage 2 & Stage 3 Lifecycle
- **Stage 1 (6 Questions)**: Uses `@google/genai` `interactions.create` (`process.env.GEMINI_MODEL` -> `gemini-3.5-flash-lite`) with `{ type: 'google_search' }` on Q1 (TGA/Ahpra/OAIC, TEQSA/research integrity, ASIC/AICD/ISO 42001/IRAP), covering Sector & Scale, Multimodal Workflows, Precision Thresholds, Deployment Boundary (Air-Gapped On-Premise vs Secure Cloud), Existing Environment & Local GPU/Server Readiness, and AUD Budget & 30-Day Procurement Decisions, validated by strict `ToolGovernanceIntakeSchema`.
- **Stage 2a**: Immediately emits `PRELIMINARY_AI_Tool_Selection_Governance_Advisory_[Org]_[YYYY-MM-DD].txt` (`PRELIMINARY ADVISORY DRAFT - QUEUED FOR SUPERADMIN ANALYSIS & IMPROVEMENT (24-48 HRS)`), Sections 1–5, DOM `Blob` download, and *"Under Superadmin Analysis"* badge (`status: 'awaiting_superadmin_improvement'`).
- **Stage 2b**: Async `GEMINI_FALLBACK_MODEL` (`gemini-4-hydrogen`) search-grounded vendor trust-center, open-weight licensing/VRAM/offline-telemetry, and sector regulatory tripwire research -> unread review doc (`subject: '[Action Required: Analyse & Improve] AI Tool Selection & Governance — [Org] ([Sector])'`) + `chat_interactions` notification.
- **Stage 3**: SuperAdmin edits in `#admin-tool-governance-studio` (`Save Draft`, `Download Working .txt`, DOM `FileReader` `Load Edited .txt`, `Executive Counsel Note`, 2-step `Approve & Send Improved Plan`, 2-step `Confirm Delete`) -> `FINAL_VETTED_AI_Tool_Selection_Governance_Advisory_[Org]_[YYYY-MM-DD].txt`, `reviewedByUid`, `reviewedAt`, `status: 'final_improved_delivered'`, client notification & portal download.
