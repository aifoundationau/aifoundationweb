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
    "businessId": "#aifoundation",
    "businessName": "AI Foundation",
    "source": "aifoundation"
  }
  ```
- **Invariant Rule 2**: All database queries executing on shared multi-tenant collections (e.g., `transactions`, `activity_logs`) **MUST** include an explicit equality predicate on `tag == 'aifoundation'` to guarantee complete isolation from other tenants.

### 1.2 PCI DSS Scope Minimization (SAQ A)
- Under no circumstances does raw cardholder data (Primary Account Number [PAN], Card Verification Value [CVV/CVC], or Expiration Date) touch the application server or its local storage.
- All payment details are entered on Stripe's hosted Checkout page; the site loads no payment form of its own.
- The application server only handles Stripe Checkout Session identifiers (`cs_*`).
- Every payment is one-off (`mode: 'payment'`): there are no donations and no subscriptions. Historic donation records (including PayPal) remain in Firestore under the 7-year retention rule.

### 1.3 Uniform 7-Year Lifecycle & Retention Governance
In strict compliance with statutory recordkeeping under the Australian Corporations Act 2001 (s 286), the Australian Taxation Office (ATO), and the Privacy Act 1988 (Cth):
- **Retention Period**: All financial, billing, audit, communication, and inquiry logs must be retained for exactly **7 years** (2,557 days) from the date of creation.
- **Destruction Routine**: At the expiration of the 7-year lifecycle window, non-financial identifying personal records (PII) must be purged or irreversibly anonymized in accordance with Australian Privacy Principle 11.2.

---

## 2. Domain Entity Contracts

### Domain 1: Billing & Payments

#### Target Collections
- Primary: `transactions/{transactionId}`
- Provider Specific: `stripe_transactions/{transactionId}` (`paypal_transactions/{transactionId}` holds historic PayPal donation records only; nothing new is written there)

#### Data Fields Specification
| Field Name | Type | Ingestion Channel | Classification | Invariants & Constraints | Storage & Encryption |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `transactionId` | String | API Route (`/api/transactions/*`) | Internal Audit | Required. Pattern: `^(pi_\|cs_)[A-Za-z0-9]+$` (Stripe) or `^[A-Z0-9]{17}$` (PayPal). | Firestore Document ID. Indexed. Encrypted at rest. |
| `tag` | String Enum | Server Injection | Partition Key | **Constant**: `'aifoundation'`. Immutable. | Firestore root field. Indexed. |
| `businessId` | String Enum | Server Injection | Partition Key | **Constant**: `'#aifoundation'`. Immutable. | Firestore root field. |
| `businessName` | String | Server Injection | Internal Metadata | **Constant**: `'AI Foundation'`. | Firestore root field. |
| `source` | String | Server Injection | Internal Metadata | **Constant**: `'aifoundation'`. | Firestore root field. |
| `amount` | Integer | UI Form / API Route | Financial | Required. Range: `1 <= amount <= 1,000,000`. Strictly positive whole integer (AUD $). Decimals rejected. | Firestore numeric integer. |
| `currency` | String Enum | Server Default | Financial | Required. **Constant**: `'aud'`. Force lowercased. | Firestore root field. |
| `paymentMethod` | String Enum | UI Selector / API Route | Internal Audit | Required. Enum: `['stripe', 'paypal']`. | Firestore root field. |
| `paymentType` | String Enum | API Route | Financial Category | Required. Set by each checkout (`'tokens'` or the paid service's type). Default: `'payment'`. Historic records may hold `'donation'`. | Firestore root field. |
| `status` | String Enum | API Route / Stripe verify | Audit State | Required. State machine: `'initiated'` → `'processing'` → `'succeeded'` \| `'failed'` \| `'cancelled'`. | Firestore root field. Indexed. |
| `description` | String | API Route | Metadata | Max length: 255 characters. Default: `"Support AI Foundation Australia (AUD ${amount})"`. | Firestore root field. |
| `originUrl` | String (URI) | API Route / Client Header | Metadata | Valid URL. Sanitized against path traversal. | Firestore `metadata.originUrl`. |
| `customerEmail` | String (Email) | UI Form / API Route | PII | Optional. RFC 5322 regex. Trimmed, lowercased, max 254 characters. | Firestore `metadata.customerEmail`. AES-256 at rest. |
| `customerName` | String | UI Form / API Route | PII | Optional. Length: 1–100 characters. Trimmed, HTML-escaped. | Firestore `metadata.customerName`. AES-256 at rest. |
| `recordedAt` | String (Timestamp) | Server Generation | Audit | Required. ISO 8601 UTC timestamp format `YYYY-MM-DDTHH:mm:ss.sssZ`. | Firestore timestamp/string. Indexed. |
| `updatedAt` | String (Timestamp) | Server Generation | Audit | Required. ISO 8601 UTC timestamp format. Updated on each state transition. | Firestore timestamp/string. |

#### Stripe AUD + Automatic Tax Invariants
1. **Default Currency**: `'aud'` across all Stripe Checkout sessions.
2. **Automatic Stripe Tax**: `automatic_tax: { enabled: true }`. Stripe Checkout automatically detects the buyer's country on the payment page without requiring country parameters to be passed in advance.
3. **Tax Behavior**: `tax_behavior: 'exclusive'` inside `price_data`. Stripe adds 10% GST on top if the buyer is in Australia, and $0 tax if the buyer is outside Australia.
4. **Official Tax Invoices**: `invoice_creation: { enabled: true }` and `customer_creation: 'always'` on one-time payments (`mode: 'payment'`).
5. **No Manual Tax Rates**: All manual `tax_rates` (`txr_...` / `ensureAuGstTaxRateId`) logic is removed so Stripe Tax handles calculation and invoicing natively.
6. **UI Pricing Label**: Support the AI Foundation notices state `Prices exc. GST (+10% GST for Australia)` / `(exc. GST)`, and AUD prices for Australia display `(+ GST)`. New Zealand is never referenced as having GST.

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
| `imageUrl` | String (URI) | UI Admin / Metadata Scrape | Public | Required. Must be valid URI. The original post thumbnail (e.g. the article's `og:image`) and the only image displayed; never replaced by the ImgBB copy. An `i.ibb.co` URL only when the image was uploaded as a file, or default fallback `assets/logo.png`. | Flat JSON array. |
| `imageBackupUrl` | String (URI) | ImgBB Upload | Public | Optional. ImgBB backup copy (`i.ibb.co`) of the original thumbnail, made for `projects`, `tech` and `community` items. Empty when no copy was made. Never displayed. | Flat JSON array. |
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
- API Endpoint: `POST /api/extract-metadata` (Admin authentication required via Firebase ID token; implemented in [metadata-extractor.js](file:///Y:/Antigravity%20Projects/ai-foundation/metadata-extractor.js))
- Ingestion Context: Real-time metadata preview generator for bulk publishing.

#### Data Fields Specification
| Field Name | Type | Ingestion Channel | Classification | Invariants & Constraints | Security Boundary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `url` | String (URI / Snippet) | UI Scrape Input / API | Internal System | Required. Raw input max 4,096 chars; extracts embedded `https?://` URLs (including `<iframe src="...">`) and prepends `https://` to bare domains. Normalized HTTP/HTTPS URL max 2,048 chars. Maps `x.com` / `twitter.com` to `fxtwitter.com`, and canonicalizes LinkedIn `/embed/feed/update/<urn>` URLs. | **SSRF Protection Rule**: Enforced before fetch and on every manual redirect hop (max 5 hops) plus DNS lookup (`dns.promises.lookup`). Rejects `localhost`, `.local`/`.internal` hostnames, RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), CGNAT (`100.64.0.0/10`), Loopback (`127.0.0.0/8`), Link-Local (`169.254.0.0/16`), IPv6 private/link-local (`::`, `::1`, `fc00::/7`, `fe80::/10`, `::ffff:`-mapped private IPv4), and Cloud Metadata endpoints with HTTP 400. |
| Return: `title` | String | Server Response | Public | Output length clamped to 250 chars. Decoded from HTML named, decimal, and hex entities; LinkedIn author/topic boilerplate stripped; falls back to `'Update from link'`. | In-memory transient; returned to client. |
| Return: `summary` | String | Server Response | Public | Output length clamped to 3,000 chars. Extracted across OpenGraph (`og:description`), Twitter Cards (`twitter:description`), `meta[name=description]`, Schema.org `application/ld+json` (`SocialMediaPosting`/`Article`), and LinkedIn public embed fallback (`main-feed-activity-embed-card__commentary`). | In-memory transient. |
| Return: `imageUrl` | String (URI) | Server Response | Public | Extracted from `og:image`, `og:image:secure_url`, `twitter:image`, `application/ld+json` media, or LinkedIn embed media (`data-delayed-url` / video `poster`). Placeholder `static.licdn.com` ghosts and actor avatars deprioritized; HTML `&` entities decoded (`&amp;` → `&`). | In-memory transient. |
| Return: `platform` | String Enum | Server Response | Public | Classified based on resolved hostname (`detectPlatform`), including `linkedin.com` and `lnkd.in` → `'linkedin'`. | In-memory transient. |
| Return: `link` | String (URI) | Server Response | Public | Normalized input URL, or resolved canonical URL for `lnkd.in` shortlinks and LinkedIn embed URLs. | In-memory transient. |
| Return: `partial` | Boolean | Server Response | Internal UI State | `true` only when neither a real title, summary, nor image could be extracted; `false` otherwise. | In-memory transient. |

#### Strict Output Schema (`additionalProperties: false`)
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["title", "summary", "imageUrl", "platform", "link", "partial"],
  "properties": {
    "title": { "type": "string", "maxLength": 250 },
    "summary": { "type": "string", "maxLength": 3000 },
    "imageUrl": { "type": "string" },
    "platform": { "type": "string", "enum": ["linkedin", "instagram", "facebook", "twitter", "google", "google_business", "youtube", "website"] },
    "link": { "type": "string", "maxLength": 2048 },
    "partial": { "type": "boolean" }
  }
}
```

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
- UI Component: Contact Us Form ([index.html](file:///e:/Antigravity%20Projects/ai-foundation/public/index.html#contactForm))
- Ingestion Entrypoint: Footer Email Link (`#footerContactEmailLink`, `data-agent-id="footer-contact-email"`) routing directly into the Contact form across `index.html`, `projects.html`, `services.html`, `terms.html`, and `privacy.html`.
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
| `businessId` | String Enum | System Enforcement | Partition Key | **Constant**: `'#aifoundation'`. Immutable tenant discriminator. | Firestore root field. |
| `businessName` | String | System Enforcement | Metadata | **Constant**: `'AI Foundation'`. | Firestore root field. |
| `source` | String | System Enforcement | Metadata | **Constant**: `'aifoundation'`. | Firestore root field. |
| `authProvider` | String Enum | System Enforcement | Auth Metadata | Required. Value: `'google'`. | Firestore root field. |
| `phoneNumber` | String | Supporter Registration | PII | Optional. Australian or international E.164 phone format. | Stored in `users/{uid}`. AES-256 encrypted at rest. |
| `address` | Map / Object | Supporter Registration | PII | Optional. Contains `apartment`, `street`, `suburb`, `state`, `country`, `postcode`. | Stored in `users/{uid}`. AES-256 encrypted at rest. |
| `role` | String Enum | Server Verification | Access Control | Value: `'supporter'` \| `'admin'`. Admin verified strictly from list in Firebase (`system_settings/admin_emails` & admin records). | Firestore root field. |
| `status` | String Enum | Server / Client Sync | Account Status | Value: `'supporter'` (assigned immediately to any registering email not in Firebase admin list) \| `'admin'`. | Firestore root field. Indexed. |
| `detailsRegistered` | Boolean | Supporter Registration | Profile Status | Optional. `true` when user submits details form. | Firestore root field. |
| `registeredAt` | String (Timestamp) | Client / Server Sync | Audit | Required. ISO 8601 UTC timestamp of initial registration. | Firestore timestamp/string. |
| `lastLoginAt` | String (Timestamp) | Client / Server Sync | Audit | Required. ISO 8601 UTC timestamp of most recent authentication. | Firestore timestamp/string. 7-year retention. |
| `updatedAt` | String (Timestamp) | Client / Server Sync | Audit | Required. ISO 8601 UTC timestamp of profile sync. | Firestore timestamp/string. |

---

### Domain 9: Supporter Chat & Administrative Messaging

#### Target Collections
- Primary: `chat_interactions/{messageId}`

#### Data Fields Specification
| Field Name | Type | Ingestion Channel | Classification | Invariants & Constraints | Storage & Retention |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `messageId` / `id` | String | Server Generation | Message ID | Required. Unique identifier matching `^msg_[0-9]{13}_[a-z0-9]{7}$`. | Firestore Document ID. |
| `conversationId` | String | API Route (`/api/chat/send`) | Thread Identifier | Required. Format: `^conv_[A-Za-z0-9_-]+$`. Groups threads by supporter UID. | Firestore root field. Indexed. |
| `tag` | String Enum | System Enforcement | Partition Key & Privacy | Multi-tenant discriminator: `['aifoundation', 'pro-lms', 'healthlms', 'itsasimplejob', 'rto-ai']`. **Tag Privacy Invariant**: Readable **strictly by SuperAdmin**. Stripped for normal supporters. | Firestore root field. Indexed. |
| `businessId` | String Enum | System Enforcement | Partition Key | Tenant business code (`aifoundation`, `pro-lms`, `healthlms`, `itsasimplejob`, `rto-ai`). SuperAdmin only. | Firestore root field. |
| `businessName` | String | System Enforcement | Metadata | Source business/app name. SuperAdmin only. | Firestore root field. |
| `source` | String | System Enforcement | Metadata | Ingestion origin tenant code. SuperAdmin only. | Firestore root field. |
| `senderUid` | String | Authenticated Session | Identity | Required. Authenticated sender Firebase UID. | Firestore root field. |
| `senderEmail` | String (Email) | Authenticated Session | PII | Required. Valid RFC 5322 email. Lowercased. | Firestore root field. |
| `senderName` | String | Authenticated Session | Public Identity | Required. Trimmed, HTML-sanitized display name. | Firestore root field. |
| `senderRole` | String Enum | Authenticated Session | Role | Enum: `['supporter', 'superadmin']` (older records may say `'super_admin'`). `'superadmin'` only for the two SuperAdmins; everyone else, site admins included, is `'supporter'`. | Firestore root field. |
| `recipientUid` | String | Session / Route Target | Identity | Target recipient identifier (`'superadmin'` or supporter UID). | Firestore root field. |
| `recipientEmail` | String (Email) | Session / Route Target | PII | Target recipient email address. | Firestore root field. |
| `recipientName` | String | Session / Route Target | Identity | Target recipient display name. | Firestore root field. |
| `userMessage` | String | UI Chat Composer | Content | Required. Length: 1–4,000 characters. HTML entities encoded. Web links allowed. | Firestore root field. |
| `hasLinks` | Boolean | Server URL Extraction | Content Meta | `true` if valid `http://` or `https://` URLs are present in `userMessage`. | Firestore root field. |
| `links` | Array of Strings | Server URL Extraction | Content Meta | List of distinct validated URLs extracted from message. | Firestore root field. |
| `hasUploads` | Boolean | Strict Enforcement | Security / Media | **Constant**: `false`. File uploads are strictly prohibited and rejected. | Firestore root field. |
| `retentionYears` | Integer | Statutory Compliance | Regulatory | **Constant**: `7`. Exactly 7 years. | Firestore root field. |
| `retainedUntil` | String (Timestamp) | Statutory Compliance | Regulatory | ISO 8601 UTC timestamp calculated as exactly `timestamp + 7 years`. | Firestore root field. Indexed. |
| `statutoryRetention` | String | Statutory Compliance | Legal | Description: `'7-Year Corporations Act / APP 11 Compliance'`. | Firestore root field. |
| `createdAt` / `timestamp` | String (Timestamp) | Server Generation | Audit | Required. ISO 8601 UTC timestamp string. | Firestore timestamp/string. Indexed. |
| `updatedAt` | String (Timestamp) | Server Generation | Audit | Required. ISO 8601 UTC timestamp string. | Firestore timestamp/string. |

#### Domain 9 Multi-Tenant Invariants
- **Invariant 9.1 (SuperAdmin Multi-Tenant Aggregation)**: SuperAdmin accounts (`support@aifoundation.net.au`, `davidrobertson.info@gmail.com`) must be able to read and review all messages sent to SuperAdmin from all tenants in the shared Firebase database (`ai-foundation-firebase`).
- **Invariant 9.2 (Tenant Tag Confidentiality)**: Each message must have a tenant tag attached identifying its source application. This tag is confidential and readable **strictly by SuperAdmin**. APIs serving standard supporters must omit the tag and prevent cross-tenant message discovery.
- **Invariant 9.3 (Supporter Conversation Isolation)**: Regular supporters may only read and write messages within their own individual conversation thread (`conv_${uid}`).
- **Invariant 9.4 (Message Box)**: `GET /api/message-box` (`message-box.js`, the two SuperAdmins only) reads every `chat_interactions` document and keeps those sent to or by a SuperAdmin, matched by `recipientUid`, `recipientEmail`, `participants` or the sender. Each tenant's format is converted to one shape: this site uses `conversationId` / `userMessage`, the LMS (`tag: 'lms'`) uses `threadId` / `body` / `subject` / `participants`, and other apps' common field names are read too. AI assistant logs (documents with `assistantResponse`) are not messages to the SuperAdmin and are left out. Every conversation carries its tenant tag.
- **Invariant 9.5 (Tenant Tag Integrity)**: Messages written by this app always get `tag`, `businessId` and `source` `'aifoundation'` from the server, never from the request, so the Message Box shows each message's real source app. This app replies only into its own conversations (`conv_${uid}`); other tenants' threads are read in the Message Box and answered in their own app.
- **Invariant 9.6 (Who Can Message the SuperAdmin)**: Anyone signed in, including site admins who aren't SuperAdmins, writes to the SuperAdmin in their own conversation. Only the two SuperAdmins reply into other users' conversations.

---

### Domain 10: Service Pricing (Services 2)

#### Target Storage & Endpoints
- Firestore: `system_settings/aifoundation_service_prices` (one document). `firestore.rules` allows browser access to `system_settings` for SuperAdmins only, so the server reads and writes it with the service account.
- Local copy: `data/service-prices.json` (`prices` and `updatedAt` only). Used when Firestore can't be reached.
- API: `GET /api/services/prices` (public), `PUT /api/services/prices` (admin only; replaces every price), `GET /api/exchange-rates/usd-aud` (admin only; today's USD to AUD rate from Frankfurter, `exchange-rates.js`, kept for an hour, never stored).
- Shared rules: `public/service-pricing.js` (service list, token price group, price validation, currency choice), used by the server and the browser.
- Admin UI: Admin Panel > Services & Pricing. Typing a USD price fills in its AUD box at today's rate, rounded to the nearest dollar (token prices to the cent); the admin can still change it.

#### Data Fields Specification
| Field Name | Type | Ingestion Channel | Classification | Invariants & Constraints | Storage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `tag`, `businessId`, `businessName`, `source` | String | Server Injection | Partition Key | Constants from Invariant Rule 1. | Firestore root fields. |
| `prices` | Map | Admin Panel / `PUT /api/services/prices` | Public | `{ [serviceId]: { [part]: { usd, aud } } }`. Service IDs: `30-day-roadmap`, `regulatory-roadmap`, `stack-selection`, `ai-agent-hosting`, plus `tokens` (Domain 11). Part: `price`, or `setup` and `monthly` for `ai-agent-hosting`, or `perToken` (price of one token) for `tokens`. Each amount is `null` (blank) or a whole number of dollars from 1 to 1,000,000; decimals entered are rounded to the nearest dollar. Token prices (`tokens.perToken`) keep their cents: from 0.01 to 1,000,000, rounded to the cent. | Firestore map. |
| `updatedAt` | String (Timestamp) | Server Generation | Audit | ISO 8601 UTC timestamp of the last save. | Firestore timestamp. |
| `updatedBy` | String (Email) | Verified ID token | PII | Email of the admin who saved. Never returned by the public API or written to the local copy. | Firestore root field. |
| Return: `country` | String | `x-vercel-ip-country` request header | Public | ISO 3166-1 alpha-2 code, or `''` when unknown. Not stored; the response is sent with `Cache-Control: private, no-store`. | In-memory transient. |

#### Display Rule
- Visitors whose country is `AU` see the AUD price. When the AUD box is blank they see the USD price.
- All other visitors see the USD price. AUD prices are never shown outside Australia.
- With no price to show, the service card says "Price on request".
- When the server can't tell the country (local development), the browser uses the location bar's place.

---

### Domain 11: Tokens (one balance shared by all the owner's apps)

#### Target Storage & Endpoints
- Balance: `users/{uid}.token_balance` (integer), on the user profile every app shares. The LMS already uses this field. Only servers change it (service account); `firestore.rules` lists it in `privilegedFields`, so users can't change it themselves, and a new profile can only start with `token_balance` 0 or unset.
- Ledger: `token_ledger/{entryId}`, one entry per balance change, written in the same atomic commit as the change. Readable by the user it belongs to and admins; no browser writes.
- Pending checkouts: `aifoundation_token_checkouts/{uid}` (`pendingCheckouts`), Buy Tokens checkouts not paid yet. Server only. The owner's other apps (built from `token-kit/`, see `tokensetupguide.txt`) keep theirs in `token_checkouts/{appTag}_{uid}`, also server only.
- Billing records: each purchase is also recorded in `transactions` / `stripe_transactions` (Domain 1) with `paymentType: 'tokens'`.
- API (all need a signed-in user's Firebase ID token):
  - `GET /api/tokens`: balance and this visitor's price. It also credits checkouts paid since the user last looked.
  - `POST /api/tokens/checkout` (`{ tokens }`): answers a Stripe Checkout URL.
  - `POST /api/tokens/confirm` (`{ sessionId }`): the page Stripe returns to.
  - `POST /api/tokens/spend` (`{ tokens, app, reference, description }`): see Spending Rules.
  - `GET /api/tokens/accounts` (SuperAdmin): every profile with its balance.
  - `POST /api/tokens/grant` (SuperAdmin, `{ uid, tokens, requestId, note }`).
- Other apps' browsers may call `GET /api/tokens` and `POST /api/tokens/spend` when their site is listed in the `TOKEN_API_ORIGINS` environment variable (comma separated). Otherwise only this site can call them from a browser.
- Code: `token-balances.js` (balance, ledger, crediting, spending, grants), `public/service-pricing.js` (limits and totals, shared with the browser).
- UI: Admin Panel > Buy Tokens (SuperAdmin and supporter panels), Admin Panel > Token Accounts (SuperAdmin only).

#### Data Fields Specification
| Field Name | Type | Ingestion Channel | Classification | Invariants & Constraints | Storage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `token_balance` | Integer | Server (atomic increment, or a precondition-checked write when spending) | Account | Tokens the user has. Never below 0 when spent through `POST /api/tokens/spend` or the Spending Rules. | `users/{uid}`. |
| `token_balance_updated_at` | String (Timestamp) | Server Generation | Audit | ISO 8601 UTC of the last change. | `users/{uid}`. |
| `tag`, `businessId`, `businessName`, `source` | String | Server Injection | Partition Key | Constants from Invariant Rule 1 (the app that wrote the record: `aifoundation`). | Ledger entries, pending checkouts. |
| `uid` | String | Verified ID token / Stripe metadata | Identifier | Firebase UID of the account whose balance changed. | Ledger entries, pending checkouts. |
| `change` | Integer | Server | Account | Tokens added (positive) or spent (negative). | Ledger entry. |
| `kind` | String | Server | Operational | `purchase`, `grant` or `spend`. | Ledger entry. |
| `reference` | String | Stripe / browser / calling app | Operational | Purchase: the Stripe Checkout Session ID. Grant: the request ID. Spend: the calling app's purchase ID. | Ledger entry. |
| Entry ID | String | Server | Idempotency Key | `purchase_<sessionId>`, `grant_<requestId>` or `spend_<app>_<reference>`. Created with "must not exist", so each change is applied at most once. | Ledger document ID. |
| `amount`, `currency` | Number, String | Stripe (`amount_total`) | Financial | Purchases only: amount charged, as confirmed by Stripe. `usd` or `aud`. | Ledger entry. |
| `app` | String | Calling app | Operational | Spends only: the app's tag, lower case (e.g. `lms`). | Ledger entry. |
| `grantedBy` | String (Email) | Verified ID token | PII | Grants only: the SuperAdmin who added the tokens. | Ledger entry. |
| `description` | String | Server / calling app | Operational | Up to 200 characters. | Ledger entry. |
| `createdAt` | String (Timestamp) | Server Generation | Audit | ISO 8601 UTC. | Ledger entry. |
| `pendingCheckouts` | Array (String) | Server | Operational | Stripe Checkout Session IDs (`cs_*`) started but not yet credited. Removed when credited, expired, or unpaid after 7 days. | `aifoundation_token_checkouts/{uid}`. |

#### Purchase Rules
- Tokens are bought 10 at a time. The token box starts at 10; each + adds 10 and each - takes 10 off, with no upper limit. Buyers can also type any multiple of 10 (other amounts are rounded up to the next 10). One request is capped at 1,000,000,000 tokens to catch typing mistakes.
- The price is the admin's price per token (Domain 10, `tokens.perToken`), chosen by the Domain 10 display rule (AUD in Australia when set, otherwise USD). When the USD box is blank, a token costs the default USD $1 (`DEFAULT_TOKEN_PRICE`). Token prices keep their cents (e.g. AUD 1.43), and the total is tokens × price per token, rounded to the cent. It must be from 0.50 to 999,999.99, Stripe's limits for one card payment.
- The server works out every amount; the browser only sends the number of tokens.
- Tokens are credited only after Stripe reports the checkout as `paid`, in one atomic commit that creates the `purchase_<sessionId>` ledger entry (which must not exist yet) and increments `token_balance`.
- No token checkout is started while balances can't be reached or the buyer has no profile, so a payment is never taken that can't be credited.

#### Grant Rules (SuperAdmin)
- Token Accounts lists every profile in `users` (all apps) with its balance. The SuperAdmin chooses one and adds tokens. The box starts at 10, each + adds 10, and there is no upper limit.
- Each click sends a new `requestId`, used as the ledger entry's key, so a retried request is never added twice.

#### Spending Rules (for every app)
- Spend through `POST /api/tokens/spend` with the user's Firebase ID token, the app's tag and the app's own purchase ID as `reference`. Sending the same `app` and `reference` again never takes tokens twice (answer `already-spent`). Not enough tokens: HTTP 409 with the balance, and nothing is taken.
- An app that changes `token_balance` from its own server instead must follow the same rules: read the profile and its `updateTime`. Then, in one commit, create `token_ledger/spend_<app>_<reference>` with "must not exist" and write the lower balance with an `updateTime` precondition, retrying from the read if the commit is refused. Never change `token_balance` from a browser; `firestore.rules` refuses it.

---

### Domain 5: Portal Ecosystem & Cross-App Navigation

#### Authorized Ecosystem Destinations
| Destination ID | App / Service Name | Canonical URI | `data-agent-id` / `data-testid` |
| :--- | :--- | :--- | :--- |
| `ai` | AI Core Portal | `https://www.aifoundation.net.au/` | `footer-portal-ai` |
| `lms` | LMS Portal | `https://lms.aifoundation.net.au/` | `footer-portal-lms` |
| `hr` | HR Solutions | `https://easyhragency.com/` | `footer-portal-hr` |
| `jobs` | Trades & Work | `https://jobs.aifoundation.net.au/` | `footer-portal-jobs` |
| `pt` | PT & Fitness | `https://pt.aifoundation.net.au/` | `footer-portal-pt` |
| `health` | Health Platforms | `https://health.aifoundation.net.au/` | `footer-portal-health` |
| `edu` | Vocational RTO | `https://edu.aifoundation.net.au/` | `footer-portal-edu` |
| `nihongo` | Nihongo Kyoushitsu | `https://www.nihongokyoushitsu.com/` | `footer-portal-nihongo` |
| `eikaiwa` | Eikaiwa Kyoushitsu | `https://www.eikaiwakyoushitsu.com/` | `footer-portal-eikaiwa` |
| `finance` | Finance Portal | `https://finance.aifoundation.net.au/` | `footer-portal-finance` |
| `kangoo` | Kangoo Car Rental | `https://kangoo.aifoundation.net.au/` | `footer-portal-kangoo` |
| `socialradar` | Social Media (Social Radar) | `https://adradarhq.com/` | `footer-portal-socialradar` |
| `courier` | Courier | `https://itsasimplejob.com/` | `footer-portal-courier` |
| `suburbreport` | Suburb Report | `https://suburbreport.com/` | `footer-portal-suburbreport` |

- **Footer vs. Apps section**: `courier` and `suburbreport` appear in `.footer-portal-nav` only; the `#section-apps` cards and quick buttons (12 apps, including `eikaiwa`) do not include them.
- **Layout Invariants**: Rendered in `.footer-portal-nav` and `#section-apps` with fluid flex on desktop and 2-column centered grid on tablets/mobile. The footer has 14 items (even, so its 2-column grid has no lone last item). In the footer, an odd last child centers with equivalent column width (`width: 100%; max-width: 220px;`). Screen widths <= 340px collapse to 1 single full-width column to prevent text wrapping or overflow clipping. Minimum tap target height: 44px on touch devices. Accessible in Special Sections sidebar via `[data-target="section-apps"]` and hash `#apps`.

#### Header Download App (`#downloadAppBtn`)
- **Placement**: Top header on `index.html`, `projects.html`, `services.html`, `terms.html` and `privacy.html`; `data-agent-id` / `data-testid` = `header-download-app`. Label "Download App", "Get App" at <= 600px, icon only at <= 359px (and at <= 600px on the Terms/Privacy pages, which have three header buttons).
- **Behaviour** (`install-app.js`): installs the site as an app from `site.webmanifest` (`display: standalone`; icons `assets/app-icon-192.png`, `assets/app-icon-512.png`; iOS `assets/apple-touch-icon.png`). Chromium browsers show their own install prompt (`beforeinstallprompt`); iOS/iPadOS, Safari and Firefox get a how-to dialog (`data-testid="install-help-dialog"`). The button is hidden when the site is already open as an installed app. No data is collected or stored.

#### Unified Multi-Database SuperAdmin Message Box (`GET /api/message-box`, `POST /api/chat/send`)
- **Aggregated Databases & Tags**:
  - `aifoundation`: `(default)` database, `chat_interactions` collection (`tag: "aifoundation"`).
  - `lms`: `(default)` database, `chat_interactions` collection (`kind: "lms_message"`, `tag: "lms"`).
  - `hr`: `human-resources` database, `hr_conversations/{convId}` + `messages` subcollection (`tag: "hr"`).
  - `ad-radar`: `ad-radar` database, `admin_messages` collection (`tag: "ad-radar"`).
  - `itsasimplejob`: `itsasimplejob` database, `mailboxes/superadmin/inbox` & `sent` (`tag: "itsasimplejob"`).
  - `trainerdavid`: `trainerdavid` database, `creator_messages` collection (`tag: "trainerdavid"`).
  - `rto-ai`: `(default)` database, `superadmin_messages` & `notifications` collections (`tag: "rto-ai"`).
  - Additional named databases (`finance`, `kangoorental`, `lawyerselect`) and tags (`health`, `nihongo`): `chat_interactions` / `admin_messages`.
- **Two-Way Reply Contract (`replyToConversation`)**: SuperAdmin replies from the Message Box write directly back to the originating Firestore database and collection in that app's native schema with 7-year statutory retention.
- **UI Presentation Invariants**: All website database tags (`KNOWN_WEBSITE_TAGS`) are listed directly under the Message Box heading. The Conversations Box displays smaller text with Name and Email only (`0.78rem` / `0.7rem`), and message bubbles inside `.admin-thread-feed` use compact `0.8rem` typography for readability.

---

### Domain 10: Google AI Strategy & First-Month Plan Advisory Service

#### Target Endpoints & Collections
- API Endpoints:
  - `GET /api/strategy-plan/session` (`requireAuth`)
  - `POST /api/strategy-plan/checkout` (`requireAuth`)
  - `POST /api/strategy-plan/confirm` (`requireAuth`)
  - `POST /api/strategy-plan/message` (`requireAuth`, plain-text only)
  - `POST /api/admin/payments/verify-pending` (`requireSuperAdmin`; manual verification, as there are no Stripe webhooks)
  - `GET /api/strategy-plan/superadmin/briefs` (`requireSuperAdmin`)
  - `POST /api/strategy-plan/superadmin/briefs/:id/read` (`requireSuperAdmin`)
  - `DELETE /api/strategy-plan/superadmin/briefs/:id` (`requireSuperAdmin`, requires `confirmDelete: true`)
- Firestore Collections:
  - `aifoundation_strategy_sessions/{sessionId}` (owner + SuperAdmin read; server Service Account write only)
  - `aifoundation_strategy_superadmin_briefs/{briefId}` (SuperAdmin read/update/delete; server Service Account create only)
- Implementation: [strategy-plan.js](file:///Y:/Antigravity%20Projects/ai-foundation/strategy-plan.js) and [strategy-plan.d.ts](file:///Y:/Antigravity%20Projects/ai-foundation/strategy-plan.d.ts).

#### Security, Redaction & Payment Invariants
- **Zero External Access & Zero File Uploads**: Plain-text chat input only (`StrategyChatTurnInputSchema` with `.strict()` / `additionalProperties: false` rejecting any attachment or file key). Zero Google Workspace/GCP client OAuth scopes requested.
- **Secret Scrubbing (`redactSecrets`)**: All user inputs matching Google API keys (`AIza...`), Stripe/AI secret keys (`sk-...`, `rk_...`, `whsec_...`), GitHub/Slack tokens, JWTs, PEM private keys, or labeled `password=/api_key=/secret=` values are scrubbed to `[REDACTED_SECRET]` prior to any Gemini API call or Firestore persistence, and the client receives a `redactedWarning` notice.
- **Stripe AUD Exclusive GST Gate**: Always bills in `currency: 'aud'` with `automatic_tax: { enabled: true }`, `tax_behavior: 'exclusive'`, `invoice_creation: { enabled: true }`, using the admin `30-day-roadmap` AUD price when set or `STRATEGY_PLAN_PRICE_AUD_CENTS` (default `29900` = AUD $299.00 ex GST). Payment methods come from the Stripe Dashboard (`payment_method_types` is never sent; Stripe rejects it). Keep delayed methods such as bank debits switched off there. No Stripe webhooks: the session is saved as pending before the redirect and unlocked idempotently with `stripe.checkout.sessions.retrieve()` by `POST /api/strategy-plan/confirm`, on reload, or by SuperAdmin Verify pending payments.
- **Stage 2 & Stage 3 Plain-Text `.txt` Deliverables**:
  - Customer `.txt`: `Preliminary_Google_AI_Strategy_30_Day_Advisory_[SanitizedBusinessName]_[YYYY-MM-DD].txt` (pure UTF-8, ASCII `===` dividers, zero Markdown/HTML, mandatory zero-access top disclaimer, 6 advisory sections).
  - SuperAdmin `.txt`: `SUPERADMIN_30_Day_Advisory_Recommendation_[SanitizedBusinessName]_[YYYY-MM-DD].txt` generated asynchronously via `GEMINI_FALLBACK_MODEL` (`gemini-4-hydrogen`) + public Google Search grounding and dispatched unread to SuperAdmin (`confirmDelete: true` required before deletion).

#### Strict Input/Output JSON Schemas (`additionalProperties: false`)
```json
{
  "title": "StrategyChatTurnInput",
  "type": "object",
  "additionalProperties": false,
  "required": ["sessionId", "message"],
  "properties": {
    "sessionId": { "type": "string", "pattern": "^strat_[A-Za-z0-9_-]{6,140}$" },
    "message": { "type": "string", "minLength": 1, "maxLength": 3000 }
  }
}
```
```json
{
  "title": "StrategyStripeMetadata",
  "type": "object",
  "additionalProperties": false,
  "required": ["tag", "businessId", "businessName", "source", "kind", "uid", "userId", "serviceName", "serviceType"],
  "properties": {
    "tag": { "const": "aifoundation" },
    "businessId": { "const": "#aifoundation" },
    "businessName": { "const": "AI Foundation" },
    "source": { "const": "aifoundation" },
    "kind": { "const": "strategy_plan" },
    "uid": { "type": "string", "minLength": 1, "maxLength": 128 },
    "userId": { "type": "string", "minLength": 1, "maxLength": 128 },
    "serviceName": { "const": "Services - Google AI Strategy & First-Month Plan" },
    "serviceType": { "const": "google_ai_strategy_advisory_30_day" }
  }
}
```

### Domain 11: Regional Education & AI Literacy Advisory (`regional-edu-plan.js`)
Strict zero-access, plain-text advisory consultation and SuperAdmin `.txt` refinement contracts (`additionalProperties: false`):

1. **`RegionalEduChatTurnInput`** (`POST /api/regional-edu/message`) — rejects file upload or arbitrary metadata keys:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["sessionId", "message"],
  "properties": {
    "sessionId": { "type": "string", "pattern": "^regedu_[A-Za-z0-9_-]{6,120}$" },
    "message": { "type": "string", "minLength": 2, "maxLength": 4000 }
  }
}
```

2. **`ClientNeedsSummary`** (persisted on `aifoundation_regional_edu_sessions` & `aifoundation_regional_edu_reviews`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "organizationName",
    "region",
    "learnerProfile",
    "connectivityProfile",
    "dailyLiteracyGoals",
    "privacyConstraints",
    "oversightNeeds",
    "budgetAndTimeline"
  ],
  "properties": {
    "organizationName": { "type": "string", "minLength": 1, "maxLength": 200 },
    "region": { "type": "string", "minLength": 1, "maxLength": 400 },
    "learnerProfile": { "type": "string", "minLength": 1, "maxLength": 800 },
    "connectivityProfile": { "type": "string", "minLength": 1, "maxLength": 1000 },
    "dailyLiteracyGoals": { "type": "string", "minLength": 1, "maxLength": 1200 },
    "privacyConstraints": { "type": "string", "minLength": 1, "maxLength": 1200 },
    "oversightNeeds": { "type": "string", "minLength": 1, "maxLength": 1200 },
    "budgetAndTimeline": { "type": "string", "minLength": 1, "maxLength": 1200 }
  }
}
```

3. **`SuperadminDraftSaveInput`** (`PUT /api/regional-edu/superadmin/reviews/:id/draft`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["improvedTxtContent"],
  "properties": {
    "improvedTxtContent": { "type": "string", "minLength": 20, "maxLength": 60000 },
    "superadminNote": { "type": "string", "maxLength": 4000 }
  }
}
```

4. **`SuperadminImprovedPlanInput`** (`POST /api/regional-edu/superadmin/reviews/:id/approve`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["improvedTxtContent", "confirmApprove"],
  "properties": {
    "improvedTxtContent": { "type": "string", "minLength": 50, "maxLength": 60000 },
    "executiveNote": { "type": "string", "maxLength": 4000 },
    "confirmApprove": { "const": true }
  }
}
```

5. **`RegionalEduStripeMetadata`** (`POST /api/regional-edu/checkout` & `POST /api/admin/payments/verify-pending`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "tag",
    "businessId",
    "businessName",
    "source",
    "kind",
    "uid",
    "userId",
    "serviceSlug",
    "serviceName",
    "serviceType",
    "workflow"
  ],
  "properties": {
    "tag": { "const": "aifoundation" },
    "businessId": { "const": "#aifoundation" },
    "businessName": { "const": "AI Foundation" },
    "source": { "const": "aifoundation" },
    "kind": { "const": "regional_edu_advisory" },
    "uid": { "type": "string", "minLength": 1, "maxLength": 128 },
    "userId": { "type": "string", "minLength": 1, "maxLength": 128 },
    "serviceSlug": { "const": "regulatory-roadmap" },
    "serviceName": { "const": "Services - Regional Education & AI Literacy" },
    "serviceType": { "const": "regional_education_ai_literacy_advisory" },
    "workflow": { "const": "advisory_with_superadmin_improvement" }
  }
}
```

### Domain 12: AI Tool Selection & Governance Advisory (`tool-governance-plan.js`)
Strict zero-access high-compliance AI tool evaluation, multimodal vetting, and air-gap/secure cloud advisory contracts (`additionalProperties: false`):

1. **`ToolGovernanceChatTurnInput`** (`POST /api/tool-governance/message`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["sessionId", "message"],
  "properties": {
    "sessionId": { "type": "string", "pattern": "^toolgov_[A-Za-z0-9_-]{6,120}$" },
    "message": { "type": "string", "minLength": 2, "maxLength": 4000 }
  }
}
```

2. **`ToolGovernanceIntakeSummary`** (persisted on `aifoundation_tool_governance_sessions` & `aifoundation_tool_governance_reviews`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "organizationName",
    "sectorAndScale",
    "multimodalWorkflows",
    "precisionBoundaries",
    "deploymentBoundary",
    "environmentReadiness",
    "budgetAndProcurementGoals"
  ],
  "properties": {
    "organizationName": { "type": "string", "minLength": 1, "maxLength": 200 },
    "sectorAndScale": { "type": "string", "minLength": 1, "maxLength": 800 },
    "multimodalWorkflows": { "type": "string", "minLength": 1, "maxLength": 1200 },
    "precisionBoundaries": { "type": "string", "minLength": 1, "maxLength": 1200 },
    "deploymentBoundary": { "type": "string", "minLength": 1, "maxLength": 1200 },
    "environmentReadiness": { "type": "string", "minLength": 1, "maxLength": 1200 },
    "budgetAndProcurementGoals": { "type": "string", "minLength": 1, "maxLength": 1200 }
  }
}
```

3. **`ToolGovernanceStripeMetadata`** (`POST /api/tool-governance/checkout` & `POST /api/admin/payments/verify-pending`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["tag", "businessId", "businessName", "source", "kind", "uid", "userId", "serviceSlug", "serviceName", "serviceType", "workflow"],
  "properties": {
    "tag": { "const": "aifoundation" },
    "businessId": { "const": "#aifoundation" },
    "businessName": { "const": "AI Foundation" },
    "source": { "const": "aifoundation" },
    "kind": { "const": "tool_governance_advisory" },
    "uid": { "type": "string", "minLength": 1, "maxLength": 128 },
    "userId": { "type": "string", "minLength": 1, "maxLength": 128 },
    "serviceSlug": { "const": "stack-selection" },
    "serviceName": { "const": "Services - AI Tool Selection & Governance Advisory" },
    "serviceType": { "const": "ai_tool_selection_governance_advisory" },
    "workflow": { "const": "advisory_with_superadmin_improvement" }
  }
}
```

4. **`SuperadminFinalToolAdvisoryInput`** (`POST /api/tool-governance/superadmin/reviews/:id/approve`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["improvedTxtContent", "confirmApprove"],
  "properties": {
    "improvedTxtContent": { "type": "string", "minLength": 50, "maxLength": 60000 },
    "executiveNote": { "type": "string", "maxLength": 4000 },
    "confirmApprove": { "const": true }
  }
}
```

### Domain 13: Managed AI Agent Hosting & Maintenance (`managed-agent-plan.js`)
Strict zero-access agent runtime topology, MCP/prompt design, and continuous maintenance advisory contracts (`additionalProperties: false`):

1. **`ManagedAgentChatTurnInput`** (`POST /api/managed-agent/message`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["sessionId", "message"],
  "properties": {
    "sessionId": { "type": "string", "pattern": "^mgagent_[A-Za-z0-9_-]{6,120}$" },
    "message": { "type": "string", "minLength": 2, "maxLength": 4000 }
  }
}
```

2. **`ManagedAgentIntakeSummary`** (persisted on `aifoundation_managed_agent_sessions` & `aifoundation_managed_agent_reviews`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "organizationName",
    "industryAndWorkflows",
    "agentTasksAndTools",
    "slaAndLatency",
    "hostingAndSafety",
    "observabilityAndMaintenance",
    "budgetAndMilestones"
  ],
  "properties": {
    "organizationName": { "type": "string", "minLength": 1, "maxLength": 200 },
    "industryAndWorkflows": { "type": "string", "minLength": 1, "maxLength": 1000 },
    "agentTasksAndTools": { "type": "string", "minLength": 1, "maxLength": 1200 },
    "slaAndLatency": { "type": "string", "minLength": 1, "maxLength": 1200 },
    "hostingAndSafety": { "type": "string", "minLength": 1, "maxLength": 1200 },
    "observabilityAndMaintenance": { "type": "string", "minLength": 1, "maxLength": 1200 },
    "budgetAndMilestones": { "type": "string", "minLength": 1, "maxLength": 1200 }
  }
}
```

3. **`ManagedAgentStripeMetadata`** (`POST /api/managed-agent/checkout` & `POST /api/admin/payments/verify-pending`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["tag", "businessId", "businessName", "source", "kind", "uid", "userId", "serviceSlug", "serviceName", "serviceType", "workflow"],
  "properties": {
    "tag": { "const": "aifoundation" },
    "businessId": { "const": "#aifoundation" },
    "businessName": { "const": "AI Foundation" },
    "source": { "const": "aifoundation" },
    "kind": { "const": "managed_agent_advisory" },
    "uid": { "type": "string", "minLength": 1, "maxLength": 128 },
    "userId": { "type": "string", "minLength": 1, "maxLength": 128 },
    "serviceSlug": { "const": "ai-agent-hosting" },
    "serviceName": { "const": "Services - Managed AI Agent Hosting & Maintenance" },
    "serviceType": { "const": "managed_ai_agent_hosting_maintenance_advisory" },
    "workflow": { "const": "advisory_with_superadmin_improvement" }
  }
}
```

4. **`SuperadminFinalManagedAgentInput`** (`POST /api/managed-agent/superadmin/reviews/:id/approve`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["improvedTxtContent", "confirmApprove"],
  "properties": {
    "improvedTxtContent": { "type": "string", "minLength": 50, "maxLength": 60000 },
    "executiveNote": { "type": "string", "maxLength": 4000 },
    "confirmApprove": { "const": true }
  }
}
```

### Domain 14: Annual Membership & Members Chat (`membership.js`)

- **Price**: AUD \$90.00 per year before GST (`MEMBERSHIP_PRICE_AUD_CENTS`, default `9000`), Stripe Checkout `mode: 'subscription'`, inline `price_data` with `recurring: { interval: 'year' }`, `tax_behavior: 'exclusive'`, `automatic_tax: { enabled: true }`, metadata `{ tag: 'aifoundation', businessId: '#aifoundation', kind: 'membership', uid }` on the session and the subscription.
- **Routes**: `GET /api/membership`, `POST /api/membership/checkout`, `POST /api/membership/confirm`, `POST /api/membership/portal` (`requireAuth`); `GET|POST /api/members-chat` (`requireAuth` + active member or admin); `DELETE /api/members-chat/:id` (`requireAdmin`, body `{ "confirmDelete": true }`).
- **Webhook**: `POST /api/stripe/webhook` (raw body, `stripe-signature` checked with `STRIPE_WEBHOOK_SECRET`). Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`. Every event re-reads the subscription from Stripe, so duplicates and out-of-order delivery are harmless.
- **Access**: active while `status` is `active` or `trialing` and `currentPeriodEnd` is in the future. `past_due` pauses access. **SuperAdmins get every subscription service free**: `GET /api/membership` answers `status: "complimentary"` (member access, Telegram link, chat) with no Stripe Checkout and no membership record, and `POST /api/membership/checkout` refuses them with `409` so they are never charged. The Telegram link (`TELEGRAM_INVITE_URL`, must match `^https://t\.me/`) is only sent to active members.
- **Firestore**: `aifoundation_members/{uid}` and `aifoundation_member_chat/{messageId}` are written by the server only. Rules: a member may `get` their own membership doc; SuperAdmins may read both collections; no client writes.

#### Membership Checkout Request (`POST /api/membership/checkout`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "returnPath": { "type": "string", "maxLength": 200, "pattern": "^/(?!/)[A-Za-z0-9._~\\-/]*$" }
  }
}
```

#### Membership Confirm Request (`POST /api/membership/confirm`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": ["sessionId"],
  "properties": {
    "sessionId": { "type": "string", "pattern": "^cs_(test|live)_[A-Za-z0-9]{10,200}$" }
  }
}
```

#### Membership Record (`aifoundation_members/{uid}`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": ["uid", "status", "stripeCustomerId", "stripeSubscriptionId", "currentPeriodEnd", "cancelAtPeriodEnd", "tag", "businessId", "updatedAt"],
  "properties": {
    "uid": { "type": "string", "pattern": "^[A-Za-z0-9_-]{6,128}$" },
    "status": { "enum": ["active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"] },
    "stripeCustomerId": { "type": "string", "pattern": "^cus_[A-Za-z0-9]+$" },
    "stripeSubscriptionId": { "type": "string", "pattern": "^sub_[A-Za-z0-9]+$" },
    "currentPeriodEnd": { "type": "string", "format": "date-time" },
    "cancelAtPeriodEnd": { "type": "boolean" },
    "tag": { "const": "aifoundation" },
    "businessId": { "const": "#aifoundation" },
    "updatedAt": { "type": "string", "format": "date-time" }
  }
}
```

#### Members Chat Message Request (`POST /api/members-chat`)
Control characters are stripped and the text trimmed before the length check. Text only: never rendered as HTML.
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": ["topic", "text"],
  "properties": {
    "topic": { "enum": ["joint-projects", "jobs", "asean-projects", "cambodia-ai-centre", "student-collaboration"] },
    "text": { "type": "string", "minLength": 1, "maxLength": 2000 }
  }
}
```
Rate limit: one message per member every 3 seconds. Stored as `{ topic, text, authorUid, authorName, createdAt, tag: "aifoundation", businessId: "#aifoundation" }`; `authorUid` is never sent to browsers.

---

## 3. Regulatory Compliance & Governance Alignment

1. **Australian Privacy Act 1988 & Australian Privacy Principles (APPs)**:
   - **APP 1 (Open and transparent management)**: This data contract serves as the transparent architectural standard for all ingested information.
   - **APP 3 & 5 (Collection of solicited personal information & notification)**: Contact inquiries and payment receipts collect only necessary contact identifiers.
   - **APP 6 (Use or disclosure)**: Transaction metadata tagged with `'aifoundation'` is partitioned strictly for AI Foundation activities.
   - **APP 11 (Security of personal information)**: All communications use TLS 1.3 in transit; all Cloud Firestore documents are encrypted with AES-256 at rest.
2. **PCI Data Security Standard (PCI DSS v4.0)**:
   - Evaluated under **Self-Assessment Questionnaire A (SAQ A)**.
   - Web application servers do not store, process, or transmit cardholder data. All card inputs are entered on Stripe's hosted Checkout page.
3. **Australian Taxation Office (ATO) & Corporations Act Recordkeeping**:
   - All financial transaction logs, receipts, order numbers, and Stripe reference numbers (and historic PayPal references) are subject to the mandatory **7-year retention period** (Corporations Act 2001, section 286).

---

## 4. System Integrity Checklist for Engineers & Automated Agents

- [x] **Partition Key Guarantee**: Verify `tag: "aifoundation"` is present on all Firestore writes.
- [x] **Server-Side Amounts**: Every checkout amount is worked out on the server from the admin price (paid services) or the price per token; the browser never sends an amount to charge.
- [x] **SSRF Prevention**: Block private subnet resolution on `/api/extract-metadata`.
- [x] **Sanitization Enforcement**: Run all HTML-rendered text through entity encodings.
- [x] **Audit Durability**: Ensure all transactions log both initiated and completed states with 7-year storage lifecycle compliance.

---
*Signed and ratified into the repository root as the immutable system data contract.*
