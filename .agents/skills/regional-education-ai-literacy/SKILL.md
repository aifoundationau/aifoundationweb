---
name: regional-education-ai-literacy
description: Builds, audits, and maintains the strictly advisory-only "Services - Regional Education & AI Literacy" paid client consultation workflow. Enforces zero external account access, automatic secret scrubbing, Stripe AUD exclusive-GST checkout with promo codes, a 6-step search-grounded AI needs-discovery interview, immediate preliminary TXT advisory generation, asynchronous regulatory research dispatch, and an interactive SuperAdmin Document Analysis and Improvement Studio to deliver a final reviewed TXT plan.
---

# Services - Regional Education & AI Literacy (Advisory-Only Skill)

## 1. Ironclad Zero-Access & Purely Client Advisory Scope
This workflow exists strictly to **understand a client's needs and advise them on what to do**. It **accesses nothing** in any client environment:
- **Zero External Account Access**: NEVER request or configure OAuth scopes for any client Google Workspace, Google Classroom, LMS, student database, or cloud account (`gmail.*`, `classroom.*`, `drive.*`, `cloud-platform`, etc.).
- **Zero Client File Uploads or Credentials**: Provide plain-text Q&A chat only in the customer advisory modal (`#regionalEduModal` must contain zero `<input type="file">` elements). NEVER request student PII, passwords, API keys, or service account JSONs.
- **SuperAdmin-Only Local `.txt` Loader**: Local `.txt` file loading via DOM `FileReader` (`<input type="file" accept=".txt,text/plain">`) is strictly confined to the authenticated SuperAdmin `#admin-regional-edu-studio` workspace for offline specialist refinement, never exposed to client views.
- **Automatic Credential Redaction**: Warn users immediately and scrub secret/API key/password/token patterns to `[REDACTED_SECRET]` using `redactSecrets()` prior to any AI call or Firestore persistence.
- **Advisory Framing Only**: Frame every output section practically as step-by-step guidance telling the client what governance policies, regulatory checks, low-bandwidth Google tools, privacy safeguards, and week-by-week training steps they should execute themselves. Never frame deliverables as managed software deployed into client servers.

## 2. Partition Key, RBAC & UI Protection Rules
- **Tenant & Partition Alignment**: Satisfy `data-contracts.md` Invariant Rule 1 using `tag: 'aifoundation'`, `businessId: '#aifoundation'`, `businessName: 'AI Foundation'`, and `source: 'aifoundation'` across all Firestore documents and Stripe metadata payloads.
- **Role-Based Access Control**:
  - Newly registered database users MUST default to `role: 'supporter'` prior to any `'superadmin'` elevation.
  - Strictly restrict SuperAdmin review inbox, research analysis, draft editing, approval/delivery, and deletion endpoints (`/api/regional-edu/superadmin/*`) and Firestore rules (`aifoundation_regional_edu_reviews`) to authenticated users with `role === 'superadmin'`.
  - Keep `#admin-regional-edu-studio` strictly in SuperAdmin navigation (`SUPER_ADMIN_TABS` / `#adminSuperTabs`) and out of `#adminSupporterTabs`.
- **Two-Step Confirm Delete**: Every delete action (deleting a SuperAdmin review record or draft) requires explicit two-step confirmation (`Confirm Delete` button / `confirmDelete: true`).
- **UI Protection**: Inspect existing routing/UI first and ask explicit developer permission before modifying unrelated navigation, global themes, or existing page layouts. All interactive elements require `data-agent-id`, `data-testid`, and `aria-*` bindings.

## 3. Customer Landing View, Focus Areas & Time Estimate Banner
In `#regionalEduModal`, display:
- **Category**: *Services — Client Governance & Literacy Advisory*
- **Title**: *Regional Education & AI Literacy*
- **Subtitle**: *Bridging the digital divide across regional Australia and Southeast Asia. We deliver open educational platforms, subsidized training, and grassroots community learning.*
- **Four Advisory Focus Areas**:
  1. *Regulatory verification & algorithmic auditing* — practical checks you should run to verify fairness and accuracy.
  2. *Organizational AI governance policy formulation* — clear policies and acceptable-use rules to put in place.
  3. *Privacy preservation & compliance assurance* — step-by-step safeguards to keep learner and community data private.
  4. *Regulatory Roadmap* — your tailored 30-day action plan of what to do week by week.
- **Zero-Access Advisory Notice**: *"Purely Advisory — Zero Account Access: We ask focused questions to understand your needs and advise you on exactly what to do. Our system accesses nothing in your accounts, LMS, or learner records."*
- **Customer Time Estimate Banner**:
  - **Checkout**: ~1 minute (subsidized training promo codes supported)
  - **AI Needs-Discovery Chat**: ~5–8 minutes (6 plain-language questions)
  - **Preliminary Advisory Draft (`.txt`)**: Instant download in ~30–60 seconds
  - **Human Specialist Review & Improved Final Plan (`.txt`)**: Analysed, refined, and delivered to your account within 24–48 business hours

## 4. Stripe Checkout Gate (AUD + Exclusive GST + Promo Codes)
- **Pricing Source**: Read live AUD price for `regulatory-roadmap` from `servicePrices.read()` when positive integer cents exist; otherwise fallback to `Number(process.env.REGIONAL_EDU_PLAN_PRICE_AUD_CENTS) || 19900` ($199.00 AUD ex GST).
- **Stripe Session Parameters**:
  - `mode: 'payment'`
  - `currency: 'aud'`
  - `automatic_tax: { enabled: true }`
  - `tax_behavior: 'exclusive'` inside `price_data`
  - `invoice_creation: { enabled: true }`
  - `allow_promotion_codes: true`
  - `metadata`: `{ userId, businessId: '#aifoundation', tag: 'aifoundation', source: 'aifoundation', serviceSlug: 'regulatory-roadmap', serviceName: 'Services - Regional Education & AI Literacy', workflow: 'advisory_with_superadmin_improvement' }`
- **Session Unlock (no webhooks)**: Never add Stripe webhooks or `STRIPE_WEBHOOK_SECRET`. Save the Checkout Session as pending before the redirect, then verify it idempotently with `stripe.checkout.sessions.retrieve()` via `POST /api/regional-edu/confirm`, on reload, or by SuperAdmin Verify pending payments to unlock `aifoundation_regional_edu_sessions/{sessionId}` at `status: 'paid_intake_ready'`.

## 5. Stage 1 & Stage 2: 6-Step Needs Discovery & Preliminary `.txt` + Async Research
- **Model & SDK**: Use `@google/genai` `interactions.create({ model, input, system_instruction, tools: [{ type: 'google_search' }] })` dynamically imported (`await import('@google/genai')`).
  - Stage 1 & Stage 2a use `process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'`, enabling Google Search grounding on Q1 so follow-up phrasing reflects public regional realities across regional Australia or Southeast Asia.
  - Stage 2b asynchronous specialist research uses `process.env.GEMINI_FALLBACK_MODEL || 'gemini-4-hydrogen'` with Google Search grounding.
  - When `GEMINI_API_KEY` is blank, seamlessly degrade to deterministic keyless fallback advisory synthesis without throwing runtime errors.
- **6 Focused Questions** (progress indicator `"Question X of 6 — ~Y mins remaining | Advisory Intake"`):
  1. *Q1. Who You Serve & Where* (organization/community type, regional Australia or Southeast Asia location, learner age groups, team size)
  2. *Q2. Connectivity & Everyday Tools* (internet reliability, mobile vs desktop devices, everyday low-bandwidth tools)
  3. *Q3. Daily Work & Literacy Goals* (manual bottlenecks, practical AI literacy outcomes sought)
  4. *Q4. Privacy & Student/Community Rules* (regional privacy/child-safety constraints, zero-PII boundaries)
  5. *Q5. Fairness, Accuracy & Oversight Needs* (practical verification and bias-check needs)
  6. *Q6. Budget, Time & 30-Day Priorities* (subsidized budget limits, weekly time capacity, top 30-day milestone)
- **Stage 2a Preliminary Deliverable**: Generate `PRELIMINARY_Regional_Education_AI_Advisory_[OrgSlug]_[YYYYMMDD].txt`, strip Markdown/HTML to clean UTF-8 plain text, unlock `status: 'awaiting_superadmin_improvement'`, display *"Under Superadmin Analysis — Final Improved Plan arriving within 24–48 business hours"*, and offer immediate DOM `Blob` (`text/plain;charset=utf-8`) download.
- **Stage 2b Async Research & Dispatch**: Research Australian Schools AI Framework, TEQSA/ASQA VET/higher-ed guidelines, Australian Privacy Principles (APPs), UNESCO/ASEAN AI Governance guidance, and low-bandwidth Google tools; persist full packet to unread `aifoundation_regional_edu_reviews/{reviewId}` (`status: 'unread_analysis'`); and dispatch a concise (< 4,000 chars) notification via `sendChatMessage` to `chat_interactions`.

## 6. Stage 3: SuperAdmin Document Analysis & Improvement Studio
- **Interactive Workspace (`#admin-regional-edu-studio`)**:
  - **Left Queue**: Filterable list of client reviews (`unread_analysis`, `in_review_editing`, `final_improved_delivered`), unread counter badge, 2-step `Confirm Delete`.
  - **Right Two-Column Analysis & Improvement Editor**:
    - Client Profile, 6 Q&A summary, AI Research Findings, and Preliminary `.txt` side-by-side reference.
    - DOM `<textarea>` editor pre-populated with preliminary `.txt` (or saved working draft), plus `Executive Note` `<textarea>`.
    - Controls: `Save Draft`, `Download Working .txt` (DOM `Blob`), `Load Edited .txt` (SuperAdmin-only DOM `FileReader` restricted to `.txt` files), and 2-step `Approve & Send Improved Plan`.
- **Approval & Client Delivery**: Generate `FINAL_REVIEWED_Regional_Education_AI_Advisory_[OrgSlug]_[YYYYMMDD].txt`, validate via strict `zod` `.strict()` schemas, update `aifoundation_regional_edu_sessions` to `status: 'final_improved_delivered'`, mark review `'final_improved_delivered'`, and notify the client session banner + `chat_interactions` feed so the client downloads the final reviewed `.txt` plan via DOM `Blob`.

## 7. Verification & Audit Checklist
1. Enforce Zod `.strict()` (`additionalProperties: false`) schemas on all inputs/outputs and document under **Domain 11** in `data-contracts.md`.
2. Harden `firestore.rules` for `aifoundation_regional_edu_sessions` and `aifoundation_regional_edu_reviews` via the `firestore-rules-author` specialist subagent.
3. Verify `npx tsc --noEmit`, `node --check`, and full `npm test` suite pass with zero failures, and log created files, schemas, routes, and test results in `SECRET_HISTORY.md`.
