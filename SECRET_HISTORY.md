# SECRET_HISTORY.md — Architecture & Security Audit Log

> **Security Policy**: This audit log records architectural additions, security boundaries, created/modified files, and verification runs. Never store API keys, passwords, private keys, tokens, or client PII here.

---

## Entry 1: `google-ai-strategy-plan` Paid Advisory Consultation Workflow
- **Date**: 2026-11-17
- **Skill Specifications**:
  - [.agents/skills/google-ai-strategy-plan/SKILL.md](.agents/skills/google-ai-strategy-plan/SKILL.md)
  - Global skill mirror (`C:/Users/david/.gemini/config/skills/google-ai-strategy-plan/SKILL.md`)

### Architectural & Security Boundaries Enforced
1. **Zero External Access**: Plain-text advisory intake only. No client Google Workspace, Gmail, Drive, Calendar, Cloud, or accounting OAuth scopes; zero `<input type="file">` controls inside `#strategyPlanModal`; drag-and-drop files blocked; strict Zod `.strict()` (`additionalProperties: false`) rejects extra file/attachment fields on `POST /api/strategy-plan/message`.
2. **Automatic Secret Scrubbing**: `redactSecrets()` in [strategy-plan.js](strategy-plan.js) detects and replaces Google API keys, Stripe/AI keys, webhook secrets, GitHub/Slack tokens, JWTs, PEM private keys, and labeled secret assignments with `[REDACTED_SECRET]` prior to any Gemini API call or Firestore write, returning an immediate warning notice.
3. **Stripe Payment Gate (AUD + 10% Exclusive GST)**:
   - Configured via admin `30-day-roadmap` AUD pricing or `STRATEGY_PLAN_PRICE_AUD_CENTS` (default `29900` = AUD $299.00 ex GST).
   - Enforces `currency: 'aud'`, `automatic_tax: { enabled: true }`, `tax_behavior: 'exclusive'`, and `invoice_creation: { enabled: true }`.
   - Dual atomic session unlock via `POST /api/stripe/webhook` (`express.raw`, `STRIPE_WEBHOOK_SECRET` verified) and `POST /api/strategy-plan/confirm`.
4. **Grounded Gemini Advisory & Multi-Model Fallbacks**:
   - Uses `@google/genai` `interactions.create` with `tools: [{ type: 'google_search' }]`, `GEMINI_MODEL` (`gemini-3.5-flash-lite`) for Stage 1/2, and `GEMINI_FALLBACK_MODEL` (`gemini-4-hydrogen`) for async Stage 3 public documentation research.
   - Deterministic offline/keyless fallback preserves full 6-step functionality whenever `GEMINI_API_KEY` is blank or unavailable.
5. **RBAC & Firestore Hardening**:
   - Hardened [firestore.rules](firestore.rules) via `firestore-rules-author`: added `aifoundation_strategy_sessions` and `aifoundation_strategy_superadmin_briefs` to `isProtectedCollection(name)`, denied all client writes to strategy sessions, restricted SuperAdmin brief reads/deletes/read-flag updates strictly to verified `isSuperAdmin()` accounts (`isValidStrategyBriefUpdate()`), and preserved default `role: 'supporter'` user creation rules.
   - SuperAdmin `.txt` brief deletion enforces a 2-step **Confirm Delete** flow (`confirmDelete: true`).

### Files Created & Updated
- **Created**: `strategy-plan.js`, `strategy-plan.d.ts`, `tests/strategy-plan.test.js`, `.agents/skills/google-ai-strategy-plan/SKILL.md`, `SECRET_HISTORY.md`
- **Updated**: `server.js`, `firestore.rules`, `public/index.html`, `public/projects.html`, `public/services.html`, `public/app.js`, `public/style.css`, `data-contracts.md`, `.env.example`, `.gitignore`, `package.json`, `tests/server-routes.test.js`

### Verification Log
- `firebase_validate_security_rules` (`firestore.rules`): `OK: No errors detected.`
- `tests/firestore-rules-test.js`: 83/83 passed + 26/26 targeted strategy-plan rules checks passed.
- `npm test` (including `tests/strategy-plan.test.js` and `tests/server-routes.test.js`): verified after final edits.

---

## Entry 2: `regional-education-ai-literacy` Paid Advisory & SuperAdmin Studio Workflow
- **Date**: 2026-11-17
- **Skill Specifications**:
  - [.agents/skills/regional-education-ai-literacy/SKILL.md](.agents/skills/regional-education-ai-literacy/SKILL.md)
  - Global skill mirror (`C:/Users/david/.gemini/config/skills/regional-education-ai-literacy/SKILL.md`)

### Architectural & Security Boundaries Enforced
1. **Zero External Access & Plain-Text Client Intake**: Zero client Google Workspace, Google Classroom, LMS, or cloud OAuth scopes; `#regionalEduModal` includes zero `<input type="file">` controls and blocks file drag-and-drop; strict Zod `.strict()` (`additionalProperties: false`) on `RegionalEduChatTurnInputSchema` rejects unexpected fields on `POST /api/regional-edu/message`.
2. **Automatic Secret Scrubbing**: Reuses `redactSecrets()` and `stripMarkdownAndHtml()` from [strategy-plan.js](strategy-plan.js) to scrub credentials/keys to `[REDACTED_SECRET]` prior to Gemini calls or Firestore persistence.
3. **Stripe Payment Gate (AUD + 10% Exclusive GST + Promo Codes)**:
   - Reads admin `regulatory-roadmap` AUD pricing or falls back to `REGIONAL_EDU_PLAN_PRICE_AUD_CENTS` (`19900` = AUD $199.00 ex GST).
   - Enforces `currency: 'aud'`, `automatic_tax: { enabled: true }`, `tax_behavior: 'exclusive'`, `invoice_creation: { enabled: true }`, and `allow_promotion_codes: true`.
   - Unlocks `aifoundation_regional_edu_sessions/{sessionId}` to `status: 'paid_intake_ready'` via raw Stripe webhook (`checkout.session.completed`) or `POST /api/regional-edu/confirm`.
4. **Grounded 6-Step Discovery, Preliminary `.txt` & Async Regulatory Research**:
   - Uses `@google/genai` `interactions.create` with `{ type: 'google_search' }`: `GEMINI_MODEL` (`gemini-3.5-flash-lite`) for Q1 regional search & preliminary draft generation (`PRELIMINARY_Regional_Education_AI_Advisory_[Org]_[Date].txt`), and `GEMINI_FALLBACK_MODEL` (`gemini-4-hydrogen`) for async public regulatory research (Australian Schools AI Framework, TEQSA/ASQA, APPs, UNESCO/ASEAN AI Governance, low-bandwidth Google tools) + unread dispatch to `aifoundation_regional_edu_reviews` and `chat_interactions`.
   - Seamless deterministic keyless fallback whenever `GEMINI_API_KEY` is blank.
5. **SuperAdmin Document Analysis & Improvement Studio & Strict RBAC**:
   - Interactive `#admin-regional-edu-studio` workspace restricted strictly to verified `role === 'superadmin'` users (`requireSuperAdmin` + `#adminSuperTabs`).
   - Supports saving working drafts (`PUT .../draft`), downloading working `.txt` via DOM `Blob`, loading offline specialist edits via SuperAdmin-only DOM `FileReader` (`#regEduLocalFileInput`), 2-step **Approve & Send Improved Plan** (`FINAL_REVIEWED_Regional_Education_AI_Advisory_[Org]_[Date].txt`, `status: 'final_improved_delivered'`, client notification), and 2-step **Confirm Delete** (`confirmDelete: true`).
6. **Hardened Firestore Rules (`firestore.rules`)**:
   - Updated via `firestore-rules-author`: added `docMatchesPartition`/`partitionMatches('aifoundation')` helpers, protected collections `'aifoundation_regional_edu_sessions'` and `'aifoundation_regional_edu_reviews'`, owner/SuperAdmin read-only session access from clients, and schema/monotonic-transition-validated SuperAdmin review updates/deletes while keeping default `role: 'supporter'` user creation intact.

### Files Created & Updated
- **Created**: `regional-edu-plan.js`, `regional-edu-plan.d.ts`, `tsconfig.json`, `tests/regional-edu-plan.test.js`, `.agents/skills/regional-education-ai-literacy/SKILL.md`
- **Updated**: `server.js`, `firestore.rules`, `data-contracts.md` (Domain 11), `SECRET_HISTORY.md`, `public/index.html`, `public/projects.html`, `public/services.html`, `public/app.js`, `public/style.css`, `package.json`, `tests/server-routes.test.js`, `.env`, `.env.example`, `.gitignore`

### Verification Log
- `firebase_validate_security_rules` (`firestore.rules`): `OK: No errors detected.`
- `npx.cmd tsc --noEmit`: exited `0` (strict check on `*.d.ts`).
- `node --check` (`server.js`, `strategy-plan.js`, `regional-edu-plan.js`, `public/app.js`, `tests/regional-edu-plan.test.js`, `tests/server-routes.test.js`): all exited `0`.
- `npm test`: **94/94 passed, 0 failed** (`tests/service-pricing.test.js`, `tests/server-routes.test.js`, `tests/message-box.test.js`, `tests/token-balances.test.js`, `tests/exchange-rates.test.js`, `tests/metadata-extractor.test.js`, `tests/strategy-plan.test.js`, `tests/regional-edu-plan.test.js`).
