---
name: google-ai-strategy-plan
description: Builds, audits, and maintains the strictly advisory-only "Services - Google AI Strategy & First-Month Plan" paid consultation workflow. Enforces zero external client account access, Stripe AUD exclusive-GST checkout gating, search-grounded Gemini advisory discovery, preliminary customer TXT roadmap generation, public documentation research across Firebase/GCP/Cloud Console/AI Studio, and internal superadmin TXT message dispatch.
---

# Services - Google AI Strategy & First-Month Plan (Advisory-Only Skill)

## 1. Ironclad Zero-Access & Advisory-Only Boundary
This service is strictly a strategic and technical **advisory blueprint** telling the client (and Superadmin) **what to do and recommend**. It **accesses nothing** in any client environment:
- **Zero Client OAuth or API Connections**: NEVER request or configure Google Workspace OAuth scopes (`gmail.*`, `calendar.*`, `drive.*`, `documents.*`, `spreadsheets.*`, `admin.*`, or `cloud-platform`) for client accounts. NEVER connect to client GCP projects, Firebase instances, Xero, CRMs, or webhooks.
- **Zero Credential or File Ingestion**: Provide plain-text chat input only. Do NOT add `<input type="file">` controls or accept attachments for client documents, invoices, or configs. Never ask for passwords, API keys, OAuth secrets, service account JSONs, or confidential client PII.
- **Automatic Credential Redaction**: Warn the user immediately if they paste anything resembling an API key, password, private key, or secret token, and scrub all secret patterns (`AIza...`, `sk-...`, `rk_...`, `whsec_...`, `ghp_...`, `xoxb-...`, JWTs, PEM private keys, and labeled `password=/api_key=/secret=` values) to `[REDACTED_SECRET]` prior to any AI call or Firestore write.
- **Permitted Platform-Internal Operations Only**:
  1. Platform's own **Stripe Checkout** (`server.js` / `strategy-plan.js`) to collect the consultation fee in AUD.
  2. Platform's own **`@google/genai` SDK** (`>= 3.2.0`, `ai.interactions.create` with `tools: [{ type: 'google_search' }]`) strictly to query **public documentation, pricing, and industry workflows**.
  3. Platform's own **Firestore** (`aifoundation_strategy_sessions`, `aifoundation_strategy_superadmin_briefs`, and `chat_interactions`) partitioned with `tag: 'aifoundation'`, `businessId: '#aifoundation'`, `businessName: 'AI Foundation'`, `source: 'aifoundation'`.
  4. Browser **DOM-native `Blob`** (`text/plain;charset=utf-8`) execution for client and SuperAdmin `.txt` file downloads.

## 2. Multi-Model & MCP Compatibility Rules
This workflow is engineered to execute deterministically across all MCP-capable AI models (`gemini-3.5-flash-lite`, `gemini-4-hydrogen`, `claude-haiku-4.5`, `gpt-6-luna`):
- **Current Gemini Models**:
  - Stage 1 / Stage 2 (Client intake + Search grounding): `process.env.GEMINI_MODEL` (`gemini-3.5-flash-lite`)
  - Stage 3 (Async public documentation research & SuperAdmin brief): `process.env.GEMINI_FALLBACK_MODEL` (`gemini-4-hydrogen`)
  - Never use deprecated `gemini-2.5-*`, `gemini-2.0-*`, or `gemini-1.5-*` models.
- **Server-Enforced State Machine & Strict Zod Schemas**:
  - All inputs, outputs, Stripe metadata payloads, and Firestore documents are validated with strict `zod` `.strict()` schemas (`additionalProperties: false` in `data-contracts.md` and TypeScript interfaces in `strategy-plan.d.ts`).
  - The server drives the exact 6-question step counter (`currentStep` 1 -> 6) so low-cost or compact models can never skip questions, ask multiple questions at once, or leak system prompts.
- **Keyless Deterministic Fallback**:
  - When `process.env.GEMINI_API_KEY` is blank or unreachable, `strategy-plan.js` automatically runs a deterministic grounded-advisory fallback so the entire 6-step consultation, Stage 2 customer `.txt`, and Stage 3 SuperAdmin `.txt` continue operating reliably.

## 3. Service Context, RBAC & Audit Rules
- **Service Placement**: Attached to **Services - Google AI Strategy & First-Month Plan** (`30-day-roadmap` card in `#section-services2`), preserving existing navigation, themes, and page layouts.
- **Three Advisory Pillars**:
  1. First-month AI implementation & Google Gemini roadmap (Weeks 1–4 advisory action plan).
  2. Google Workspace integration & custom API/webhook connector recommendations (what to connect and why — zero live connections performed).
  3. Secure Google Cloud Platform / private workspace deployment guidance (recommended security settings, IAM posture, and Australian Privacy Act boundaries).
- **RBAC & Safety**:
  - Newly registered users MUST default to `role: 'supporter'` prior to any `'superadmin'` elevation.
  - Internal SuperAdmin brief endpoints (`/api/strategy-plan/superadmin/*`) and `aifoundation_strategy_superadmin_briefs` Firestore rules are strictly restricted to authenticated SuperAdmins (`isSuperAdmin`).
  - Deleting any SuperAdmin brief requires a mandatory 2-step **Confirm Delete** confirmation (`confirmDelete: true`).
  - Architectural changes, created files, and verification results are recorded in `SECRET_HISTORY.md`.

## 4. Stripe Payment Gate Protocol (AUD + 10% Exclusive GST)
Gate consultation access behind a verified Stripe Checkout session:
- **Price Resolution**: Uses the admin-configured AUD price for `30-day-roadmap` when set; otherwise defaults to `Number(process.env.STRATEGY_PLAN_PRICE_AUD_CENTS) || 29900` ($299.00 AUD ex-GST).
- **Required Stripe Checkout Parameters**:
  - `mode: 'payment'`
  - `currency: 'aud'`
  - `automatic_tax: { enabled: true }`
  - `tax_behavior: 'exclusive'` inside `price_data`
  - `customer_creation: 'always'`
  - `invoice_creation: { enabled: true }`
  - `metadata`: `{ tag: 'aifoundation', businessId: '#aifoundation', businessName: 'AI Foundation', source: 'aifoundation', kind: 'strategy_plan', uid, userId, serviceName: 'Services - Google AI Strategy & First-Month Plan', serviceType: 'google_ai_strategy_advisory_30_day' }`
- **Webhook-Free Unlock**: Never add Stripe webhooks or `STRIPE_WEBHOOK_SECRET`. Save the Checkout Session as pending before the redirect, then verify it idempotently with `stripe.checkout.sessions.retrieve(sessionId)` via `POST /api/strategy-plan/confirm`, on reload, or by SuperAdmin Verify pending payments (`POST /api/admin/payments/verify-pending`).

## 5. Stage 1 Runtime Agent: Grounded Search & 6-Step Advisory Intake
- Explicitly introduce the session as an **advisory consultation that accesses none of the user's accounts or files**.
- Upon receiving Q1 (industry/trade/team structure), run public Google Search grounding (`tools: [{ type: 'google_search' }]`) to identify common admin bottlenecks, Australian compliance norms, and Google Workspace/Gemini workflows for that niche.
- Ask exactly 6 questions one at a time with live progress (`Question X of 6 • ~5–8 minutes total`):
  1. **Business Structure & Daily Volume**: Sole trader, contractor, or growing team; headcount and daily inquiry/job volume.
  2. **Current Software & Google Edition**: Current use of Gmail/Workspace, Calendar, Drive, Docs, Sheets, and external business apps (accounting, booking, CRM) by name only.
  3. **Admin & Client Triage Friction**: Repetitive email handling, lead qualification, quoting, and follow-up bottlenecks.
  4. **Scheduling & Dispatch Friction**: Booking coordination, calendar conflicts, reminders, and team/contractor handoffs.
  5. **Document Processing Friction**: Manual handling of invoices, receipts, forms, PDFs, proposals, or checklists.
  6. **Privacy Needs & Day-30 Priorities**: Sensitivity of client data, private workspace preferences, and top 3 outcomes desired within 30 days.

## 6. Stage 2 Deliverable: Customer Preliminary Advisory `.txt`
Generate immediately upon Q6 submission as pure UTF-8 plain text (`Preliminary_Google_AI_Strategy_30_Day_Advisory_[SanitizedBusinessName]_[YYYY-MM-DD].txt`) using clean ASCII dividers (`============================================================`) and **zero raw Markdown/HTML artifacts**:
- **Mandatory Top Disclaimer Block**: States clearly that the report is an independent strategic advisory plan based solely on information shared during the session; zero external accounts, Workspace environments, or cloud systems were accessed or altered.
- **Required Advisory Sections**:
  1. Executive Summary & Estimated Weekly Admin Hours Recoverable
  2. Bottleneck Assessment (Admin, Client Triage, Scheduling, Document Processing)
  3. Pillar 1 Advisory: Week-by-Week First-Month Implementation & Gemini Roadmap (Days 1–7, 8–14, 15–21, 22–30)
  4. Pillar 2 Advisory: Recommended Google Workspace & Custom API / Webhook Connector Blueprint
  5. Pillar 3 Advisory: Recommended Google Cloud & Private Workspace Security Settings
  6. Customer Time Commitments (~2–4 hrs/week) & 24–48 Business Hour Lead Architect Review Notice

## 7. Stage 3 Deliverable: Async Public Research & SuperAdmin Advisory `.txt`
Run asynchronously in the backend without blocking the customer's `.txt` download (`GEMINI_FALLBACK_MODEL` = `gemini-4-hydrogen` with `tools: [{ type: 'google_search' }]`):
- Query **public documentation only** across Google Firebase, Google Cloud Console, GCP (`australia-southeast1`), Google AI Studio, Gemini API, and Google Workspace APIs / Apps Script to verify current capabilities, quotas, regional availability, and estimated AUD operational costs.
- Generate `SUPERADMIN_30_Day_Advisory_Recommendation_[SanitizedBusinessName]_[YYYY-MM-DD].txt` containing:
  - Client intake answers, Stripe Checkout Session ID, AUD amount paid, and business summary
  - Grounded public documentation findings across Firebase, Cloud Console, GCP, AI Studio, and Workspace APIs
  - Recommended 30-day advisory rollout clearly separating **Self-Service Workspace Settings** vs. **Optional Custom Engineering Items**
  - Estimated monthly Google Cloud / Gemini API operational cost in AUD and Australian Privacy Act / IAM considerations
- Persist as an unread brief in `aifoundation_strategy_superadmin_briefs` AND dispatch an internal unread message to `role: 'superadmin'` via `chat_interactions`, protected strictly by SuperAdmin RBAC and a mandatory **Confirm Delete** flow.
