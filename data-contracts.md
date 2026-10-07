# Data Contracts & System Integrity Specification
**Project**: AI Foundation Australia (`aifoundationau/aifoundationweb`)  
**Specification Version**: `1.0.0-IMMUTABLE`  
**Classification**: Single Source of Truth (SSOT)  
**Effective Date**: October 2026  
**Auditor**: Data Architect & System Integrity Engineer  
**Mandatory Retention Period**: **7 Years** (Australian Corporations Act 2001 s 286, ATO Tax Compliance, APP 11)

---

## 1. Architectural Foundations & System Invariants

### 1.1 Multi-Tenant Shared Database Boundary
The application operates within a Google Cloud Firestore project (`ai-foundation-firebase`) shared among multiple distinct commercial and educational entities.
- **Invariant Rule 1**: Every single database record, audit entry, and transaction created by this application **MUST** include the immutable partition key:
  ```json
  {
    "tag": "aifoundation",
    "businessId": "aifoundation",
    "businessName": "AI Foundation",
    "source": "aifoundation"
  }
  ```
- **Invariant Rule 2**: All database queries executing on shared multi-tenant collections (e.g., `transactions`, `activity_logs`) **MUST** include an explicit equality predicate on `tag == 'aifoundation'` to guarantee complete isolation from other tenants.

### 1.2 PCI DSS Scope Minimization (SAQ A)
- Under no circumstances does raw cardholder data (Primary Account Number [PAN], Card Verification Value [CVV/CVC], or Expiration Date) touch the application server or its local storage.
- All payment element inputs are rendered inside isolated iframes hosted directly by Stripe (`js.stripe.com`) or processed within PayPal's secure checkout environment (`paypal.com`).
- The application server only handles tokenized PaymentIntent identifiers (`pi_*`), Checkout Session identifiers (`cs_*`), or PayPal Order identifiers.

### 1.3 Uniform 7-Year Lifecycle & Retention Governance
In strict compliance with statutory recordkeeping under the Australian Corporations Act 2001 (s 286), the Australian Taxation Office (ATO), and the Privacy Act 1988 (Cth):
- **Retention Period**: All financial, billing, audit, communication, and inquiry logs must be retained for exactly **7 years** (2,557 days) from the date of creation.
- **Destruction Routine**: At the expiration of the 7-year lifecycle window, non-financial identifying personal records (PII) must be purged or irreversibly anonymized in accordance with Australian Privacy Principle 11.2.

---

## 2. Domain Entity Contracts

### Domain 1: Billing & Financial Contributions

#### Target Collections
- Primary: `transactions/{transactionId}`
- Provider Specific: `stripe_transactions/{transactionId}` and `paypal_transactions/{transactionId}`

#### Data Fields Specification
| Field Name | Type | Ingestion Channel | Classification | Invariants & Constraints | Storage & Encryption |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `transactionId` | String | API Route (`/api/transactions/*`) | Internal Audit | Required. Pattern: `^(pi_\|cs_)[A-Za-z0-9]+$` (Stripe) or `^[A-Z0-9]{17}$` (PayPal). | Firestore Document ID. Indexed. Encrypted at rest. |
| `tag` | String Enum | Server Injection | Partition Key | **Constant**: `'aifoundation'`. Immutable. | Firestore root field. Indexed. |
| `businessId` | String Enum | Server Injection | Partition Key | **Constant**: `'aifoundation'`. Immutable. | Firestore root field. |
| `businessName` | String | Server Injection | Internal Metadata | **Constant**: `'AI Foundation'`. | Firestore root field. |
| `source` | String | Server Injection | Internal Metadata | **Constant**: `'aifoundation'`. | Firestore root field. |
| `amount` | Integer | UI Form / API Route | Financial | Required. Range: `1 <= amount <= 1,000,000`. Strictly positive whole integer (AUD $). Decimals rejected. | Firestore numeric integer. |
| `currency` | String Enum | Server Default | Financial | Required. **Constant**: `'aud'`. Force lowercased. | Firestore root field. |
| `paymentMethod` | String Enum | UI Selector / API Route | Internal Audit | Required. Enum: `['stripe', 'paypal']`. | Firestore root field. |
| `paymentType` | String Enum | API Route | Financial Category | Required. Default: `'donation'`. | Firestore root field. |
| `status` | String Enum | API Route / Webhook | Audit State | Required. State machine: `'initiated'` → `'processing'` → `'succeeded'` \| `'failed'` \| `'cancelled'`. | Firestore root field. Indexed. |
| `description` | String | API Route | Metadata | Max length: 255 characters. Default: `"Support AI Foundation Australia (AUD ${amount})"`. | Firestore root field. |
| `originUrl` | String (URI) | API Route / Client Header | Metadata | Valid URL. Sanitized against path traversal. | Firestore `metadata.originUrl`. |
| `customerEmail` | String (Email) | UI Form / API Route | PII | Optional. RFC 5322 regex. Trimmed, lowercased, max 254 characters. | Firestore `metadata.customerEmail`. AES-256 at rest. |
| `customerName` | String | UI Form / API Route | PII | Optional. Length: 1–100 characters. Trimmed, HTML-escaped. | Firestore `metadata.customerName`. AES-256 at rest. |
| `recordedAt` | String (Timestamp) | Server Generation | Audit | Required. ISO 8601 UTC timestamp format `YYYY-MM-DDTHH:mm:ss.sssZ`. | Firestore timestamp/string. Indexed. |
| `updatedAt` | String (Timestamp) | Server Generation | Audit | Required. ISO 8601 UTC timestamp format. Updated on each state transition. | Firestore timestamp/string. |

---

### Domain 2: Content Publishing & Syndication

#### Target Files
- Featured Content: [data/posts.json](file:///d:/Agy/AI%20Foundation/data/posts.json)
- Projects & Systems: [data/projects.json](file:///d:/Agy/AI%20Foundation/data/projects.json)
- Community Initiatives: [data/community.json](file:///d:/Agy/AI%20Foundation/data/community.json)
- Technical R&D: [data/tech.json](file:///d:/Agy/AI%20Foundation/data/tech.json)

#### Data Fields Specification
| Field Name | Type | Ingestion Channel | Classification | Invariants & Constraints | Storage & Retention |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | String | Server Generation | Internal Identifier | Required. Format: `^(post\|proj\|comm\|tech)_[0-9]{13}$`. Unique. | Array item key in local JSON. 7-year lifecycle / until admin purge. |
| `title` | String | UI Admin / API Route | Public | Required. Length: 1–250 chars. Trimmed. HTML special entities escaped (`&`, `<`, `>`, `"`, `'`). | Flat JSON array. |
| `summary` | String | UI Admin / API Route | Public | Optional. Length: 0–3,000 chars. Trimmed. Display cards auto-truncate to first 30 words. | Flat JSON array. |
| `link` | String (URI) | UI Admin / API Route | Public | Required. Valid URI matching `^https?://[^\s/$.?#].[^\s]*$`. Max length 2,048 chars. | Flat JSON array. |
| `imageUrl` | String (URI) | UI Admin / ImgBB Upload | Public | Required. Must be valid URI. Non-post images strictly hosted on `i.ibb.co` CDN or default fallback `assets/logo.png`. | Flat JSON array. |
| `platform` | String Enum | UI Admin / Auto-Detect | Public | Required. Enum: `['linkedin', 'instagram', 'facebook', 'twitter', 'google', 'google_business', 'youtube', 'website']`. | Flat JSON array. |
| `author` | String | UI Admin / API Route | Public | Required. Length: 1–100 chars. Defaults to `'AI Foundation Australia'` or `'Admin'`. | Flat JSON array. |
| `date` | String (Timestamp) | Server Generation | Public | Required. ISO 8601 UTC timestamp string. Auto-populated at creation. | Flat JSON array. |

---

### Domain 3: Media Hosting & Asset Ingestion (ImgBB Proxy)

#### Target Endpoints & Cloud Storage
- API Endpoint: `POST /api/upload-imgbb`
- Remote Storage: ImgBB Cloud CDN (`api.imgbb.com/1/upload`), Album ID: `1MZdyd`

#### Data Fields Specification
| Field Name | Type | Ingestion Channel | Classification | Invariants & Constraints | Lifecycle |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `image` / `imageBase64` | String (Base64) | UI File Dropzone / API | Internal Media | Required if `imageUrl` absent. Regex: `^data:image\/(png\|jpeg\|jpg\|webp\|gif);base64,`. Max payload size: 10 MB. | Ephemeral server transit buffer; immediately purged from memory post-upload. |
| `imageUrl` | String (URI) | UI Input / API Route | Public | Required if `imageBase64` absent. Valid HTTP/HTTPS image URL. | Proxied to CDN. |
| `name` | String | UI Input / API Route | Public Metadata | Optional. Length: 1–128 chars. Regex: `^[a-zA-Z0-9_\-\. ]+$`. Stripped of path navigation (`..`, `/`, `\`). | Stored as image title on CDN. |
| `apiKey` | String | API Header / Body | Credential | Optional override. 32-character hexadecimal key. Falls back to server `.env` key. | Never persisted to database. |

---

### Domain 4: Web Scraping & Open Graph Metadata Extraction

#### Target Endpoints
- API Endpoint: `POST /api/extract-metadata`
- Ingestion Context: Real-time metadata preview generator for bulk publishing.

#### Data Fields Specification
| Field Name | Type | Ingestion Channel | Classification | Invariants & Constraints | Security Boundary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `url` | String (URI) | UI Scrape Input / API | Internal System | Required. Must be valid HTTP/HTTPS URL. Max length 2,048 chars. Automatically maps `x.com` and `twitter.com` to `fxtwitter.com`. | **SSRF Protection Rule**: Connections to RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), Loopback (`127.0.0.0/8`), Link-Local (`169.254.0.0/16`), and Cloud Metadata services are strictly rejected. |
| Return: `title` | String | Server Response | Public | Output length clamped to 300 chars. Decoded from HTML entities. | In-memory transient; returned to client. |
| Return: `summary` | String | Server Response | Public | Output length clamped to 1,000 chars. Extracted from `og:description` or `meta[name=description]`. | In-memory transient. |
| Return: `imageUrl` | String (URI) | Server Response | Public | Extracted from `og:image` or `twitter:image`. | In-memory transient. |
| Return: `platform` | String Enum | Server Response | Public | Classified based on hostname analysis (`detectPlatform`). | In-memory transient. |

---

### Domain 5: Administrative Access & Security Authentication

#### Target Components
- UI Component: Admin Access Modal ([index.html](file:///d:/Agy/AI%20Foundation/public/index.html#L485))
- Verification Gate: Firebase Google OAuth 2.0 Identity Token Verification (`/api/auth/admin-verify`)

#### Data Fields Specification
| Field Name | Type | Ingestion Channel | Classification | Invariants & Constraints | Storage & Security |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `email` | String (Email) | Google OAuth 2.0 | Identity Token | Required. Must match authorized AI Foundation administrator domain or verified admin email address. | Evaluated via backend server; encrypted audit log. |
| `uid` | String | Firebase SDK | Unique User ID | Required. Standard Firebase UID format. | Stored in `users/{uid}` with role `'admin'`. |
| `adminAuth` | Cookie (String) | Browser Cookie Store | Session Token | Value: `'true'`. Path: `/`. Max-Age: `31536000` seconds (1 year). | Stored in client browser cookie jar. |

---

### Domain 6: Public Inquiries & Community Communication

#### Target Components
- UI Component: Contact Us Form ([index.html](file:///d:/Agy/AI%20Foundation/public/index.html#L385))
- Dispatch Protocol: Client Mail User Agent (`mailto:support@aifoundation.net.au`)

#### Data Fields Specification
| Field Name | Type | Ingestion Channel | Classification | Invariants & Constraints | Retention & Privacy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `contactFirstName` | String | UI Form Input | PII | Required. Length: 1–50 chars. Trimmed. Strip all control characters. | Dispatched to corporate mail server. 7-year retention. |
| `contactLastName` | String | UI Form Input | PII | Required. Length: 1–50 chars. Trimmed. Strip all control characters. | Dispatched to corporate mail server. 7-year retention. |
| `contactSubject` | String | UI Form Input | PII / Inquiry | Required. Length: 1–150 chars. Trimmed. Newlines stripped to prevent header injection. | Dispatched to corporate mail server. 7-year retention. |
| `contactMessage` | String | UI Form Textarea | PII / Free Text | Required. Length: 1–5,000 chars. Sanitized of script tags and raw HTML. | Dispatched to corporate mail server. 7-year retention. |

---

### Domain 7: AI Agent Tool Calls & Conversational Extraction Slots

#### Target System
- Engine: Antigravity Agent Runtime / Gemini Platform SDK
- Integration: Tool calling schemas and conversational slot parsing

#### Extraction Slots & Invariant Rules
| Tool / Slot Name | Type | Channel | Classification | Validation & Hallucination Traps | Fail-Safe Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `amount_slot` | Integer | AI Tool Call | Financial | Clamped strictly to integer range `1 <= value <= 10,000`. Rejects vague strings (`"a lot"`, `"standard"`). | Reprompt: *"Please specify a whole Australian Dollar amount of at least AUD $1."* |
| `category_slot` | String Enum | AI Tool Call | Internal Taxonomy | Must be one of `['articles', 'projects', 'tech', 'community']`. No hallucinated categories allowed. | Reject with schema violation error and emit allowed enum list. |
| `url_slot` | String (URI) | AI Tool Call | System Input | Must pass strict URI validation. Blocks loopback and private subnets. | Abort call; return `INVALID_URI_SCHEME` to agent planner. |
| `tag_enforcement` | String Enum | Tool Parameter | System Partition | **Immutable Slot**: Must always be set to `'aifoundation'`. Any override attempt is ignored and overwritten. | Hardcoded server-side default overrides tool call parameter. |

---

### Domain 8: User Identity & Firebase Google Authentication

#### Target Collections & Auth Service
- Authentication Provider: Firebase Google Auth (`ai-foundation-firebase.firebaseapp.com`)
- Target Collection: `users/{uid}`
- Ingestion Channel: Google OAuth 2.0 / Firebase Client Popup SDK (`signInWithPopup`) & Server Sync (`POST /api/auth/sync`)

#### Data Fields Specification
| Field Name | Type | Ingestion Channel | Classification | Invariants & Constraints | Storage & Retention |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `uid` | String | Google OAuth / Firebase SDK | Unique User ID | Required. Firebase UID format. | Firestore Document ID. Indexed. |
| `email` | String (Email) | Google Account Profile | PII | Required. Valid RFC 5322 email. Lowercased, trimmed. | Stored in `users/{uid}`. AES-256 encrypted at rest. 7-year audit retention. |
| `displayName` | String | Google Account Profile | Public Identity | Optional. Max length: 120 chars. Trimmed, HTML-escaped. | Firestore root field. |
| `photoURL` | String (URI) | Google Account Profile | Public Identity | Optional. Valid HTTP/HTTPS avatar URI (Google CDN). | Firestore root field. |
| `tag` | String Enum | System Enforcement | Partition Key | **Constant**: `'aifoundation'`. Immutable tenant discriminator. | Firestore root field. Indexed. |
| `businessId` | String Enum | System Enforcement | Partition Key | **Constant**: `'aifoundation'`. Immutable tenant discriminator. | Firestore root field. |
| `businessName` | String | System Enforcement | Metadata | **Constant**: `'AI Foundation'`. | Firestore root field. |
| `source` | String | System Enforcement | Metadata | **Constant**: `'aifoundation'`. | Firestore root field. |
| `authProvider` | String Enum | System Enforcement | Auth Metadata | Required. Value: `'google'`. | Firestore root field. |
| `phoneNumber` | String | Supporter Registration | PII | Optional. Australian or international E.164 phone format. | Stored in `users/{uid}`. AES-256 encrypted at rest. |
| `address` | Map / Object | Supporter Registration | PII | Optional. Contains `apartment`, `street`, `suburb`, `state`, `country`, `postcode`. | Stored in `users/{uid}`. AES-256 encrypted at rest. |
| `role` | String Enum | Server Verification | Access Control | Value: `'supporter'` \| `'admin'`. Admin verified via server rules. | Firestore root field. |
| `lastLoginAt` | String (Timestamp) | Client / Server Sync | Audit | Required. ISO 8601 UTC timestamp of most recent authentication. | Firestore timestamp/string. 7-year retention. |
| `updatedAt` | String (Timestamp) | Client / Server Sync | Audit | Required. ISO 8601 UTC timestamp of profile sync. | Firestore timestamp/string. |

---

## 3. Regulatory Compliance & Governance Alignment

1. **Australian Privacy Act 1988 & Australian Privacy Principles (APPs)**:
   - **APP 1 (Open and transparent management)**: This data contract serves as the transparent architectural standard for all ingested information.
   - **APP 3 & 5 (Collection of solicited personal information & notification)**: Contact inquiries and donation receipts collect only necessary contact identifiers.
   - **APP 6 (Use or disclosure)**: Transaction metadata tagged with `'aifoundation'` is partitioned strictly for AI Foundation activities.
   - **APP 11 (Security of personal information)**: All communications use TLS 1.3 in transit; all Cloud Firestore documents are encrypted with AES-256 at rest.
2. **PCI Data Security Standard (PCI DSS v4.0)**:
   - Evaluated under **Self-Assessment Questionnaire A (SAQ A)**.
   - Web application servers do not store, process, or transmit cardholder data. All card inputs are hosted on Stripe servers via secure Elements.
3. **Australian Taxation Office (ATO) & Corporations Act Recordkeeping**:
   - All financial donation logs, receipts, order numbers, and Stripe/PayPal reference numbers are subject to the mandatory **7-year retention period** (Corporations Act 2001, section 286).

---

## 4. System Integrity Checklist for Engineers & Automated Agents

- [x] **Partition Key Guarantee**: Verify `tag: "aifoundation"` is present on all Firestore writes.
- [x] **Financial Integer Validation**: Ensure `amount` is an integer `>= 1` before invoking Stripe or PayPal APIs.
- [x] **SSRF Prevention**: Block private subnet resolution on `/api/extract-metadata`.
- [x] **Sanitization Enforcement**: Run all HTML-rendered text through entity encodings.
- [x] **Audit Durability**: Ensure all transactions log both initiated and completed states with 7-year storage lifecycle compliance.

---
*Signed and ratified into the repository root as the immutable system data contract.*
