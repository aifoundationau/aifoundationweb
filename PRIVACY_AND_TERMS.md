# AI Foundation — Public Privacy Policy & Applications Terms of Service

> **Entity**: AI Foundation  
> **ABN**: 36 339 516 584  
> **Jurisdiction**: Queensland, Commonwealth of Australia  
> **Governing Standards**: Australian Privacy Act 1988 (Cth), Australian Privacy Principles (APPs 1–13), Australian Consumer Law (ACL), Corporations Act 2001 (Cth) s 286, PCI DSS v4.0 (SAQ A)  
> **Effective Date**: 24 October 2026  
> **Document Version**: `2026.1-STABLE`  
> **Hashtag Identifiers**: `#PrivacyPolicy` &bull; `#TermsOfService` &bull; `#AIFoundation` &bull; `#AustralianPrivacyPrinciples` &bull; `#TokenEconomy` &bull; `#SevenYearRetention`

---

## Document Navigation & Hashtag Index

* [Jump to Public Privacy Policy](#privacy-policy) &mdash; `#PrivacyPolicy`
  * [1. Architectural Scope & Multi-Tenant Framework](#1-architectural-scope-and-multi-tenant-framework)
  * [2. Solicited Personal Information We Collect](#2-solicited-personal-information-we-collect)
  * [3. Multi-Tenant Tag Partitioning & Chat Confidentiality](#3-multi-tenant-tag-partitioning-and-chat-confidentiality)
  * [4. Payment Card Processing & PCI DSS Scope Minimization](#4-payment-card-processing-and-pci-dss-scope-minimization)
  * [5. Uniform 7-Year Statutory Data Retention & Disposal](#5-uniform-7-year-statutory-data-retention-and-disposal)
  * [6. Media Storage, Open Graph Scraping & SSRF Safeguards](#6-media-storage-open-graph-scraping-and-ssrf-safeguards)
  * [7. Cookies, Local Storage & Security Safeguards](#7-cookies-local-storage-and-security-safeguards)
  * [8. Australian Privacy Principles (APPs 1–13) Rights & Redress](#8-australian-privacy-principles-compliance)
  * [9. Contacting the Privacy Officer & OAIC Escalation](#9-contacting-the-privacy-officer-and-oaic-escalation)
* [Jump to Applications Terms of Service](#terms-of-service) &mdash; `#TermsOfService`
  * [10. Acceptance of Terms & Eligibility](#10-acceptance-of-terms-and-eligibility)
  * [11. Ecosystem Portals & Connected Applications](#11-ecosystem-portals-and-connected-applications)
  * [12. Authentication, Account Roles & SuperAdmin Powers](#12-authentication-account-roles-and-superadmin-powers)
  * [13. Universal Token Economy & Balance Terms](#13-universal-token-economy-and-balance-terms)
  * [14. Financial Contributions, Donations & Tax Compliance](#14-financial-contributions-donations-and-tax-compliance)
  * [15. Acceptable Use Policy (AUP) & Security Rules](#15-acceptable-use-policy-and-security-rules)
  * [16. Intellectual Property & License Grants](#16-intellectual-property-and-license-grants)
  * [17. Australian Consumer Law (ACL) Guarantees & Disclaimers](#17-australian-consumer-law-guarantees-and-disclaimers)
  * [18. Limitation of Liability & Indemnification](#18-limitation-of-liability-and-indemnification)
  * [19. Termination, Suspension & Account Purge](#19-termination-suspension-and-account-purge)
  * [20. Governing Law, Venue & Severability](#20-governing-law-venue-and-severability)
* [Document Footer & Regulatory Labels](#document-footer) &mdash; `#RegulatoryNotice`

---

<a id="privacy-policy"></a>
# Part I: Public Privacy Policy

`#PrivacyPolicy` `#AustralianPrivacyPrinciples` `#DataProtection` `#APPCompliant`

The **AI Foundation** (ABN 36 339 516 584) is dedicated to safeguarding the privacy and personal information of our supporters, learners, educators, business partners, and platform visitors. This Privacy Policy outlines how we collect, hold, protect, use, and disclose personal data across our primary portal ([www.aifoundation.net.au](https://www.aifoundation.net.au/)) and all associated application services in accordance with the **Privacy Act 1988 (Cth)** and the **13 Australian Privacy Principles (APPs)**.

---

<a id="1-architectural-scope-and-multi-tenant-framework"></a>
### 1. Architectural Scope & Multi-Tenant Framework
`#MultiTenantIsolation` `#PrivacyArchitecture`

The AI Foundation ecosystem operates an integrated, multi-tenant digital infrastructure powered by Google Cloud Platform, Cloud Firestore, and edge computing runtimes.
1. **Multi-Tenant Partition Key Guarantee**: All system data stores, transactional registries, and audit records carry an immutable partition tag:
   ```json
   {
     "tag": "aifoundation",
     "businessId": "aifoundation",
     "businessName": "AI Foundation",
     "source": "aifoundation"
   }
   ```
2. **Tenant Data Isolation**: Database queries strictly filter and partition records by tenant scope. No tenant or third-party entity operating within our shared cloud database has access to, or visibility of, AI Foundation personal records or message exchanges.

---

<a id="2-solicited-personal-data-collected"></a>
### 2. Solicited Personal Information We Collect
`#PersonalInformation` `#APP3` `#APP5`

In accordance with APP 3 (Collection of solicited personal information) and APP 5 (Notification of the collection of personal information), we collect only information reasonably necessary to provide educational tools, artificial intelligence literacy programs, identity management, and platform security.

| Category | Data Fields Collected | Purpose of Collection | Ingestion Channel |
| :--- | :--- | :--- | :--- |
| **Authentication & Identity** | Unique Identifier (`uid`), Email Address, Display Name, Profile Photo URL (`photoURL`), Authentication Provider (`google`). | Account creation, single sign-on (SSO), authorization, and session verification. | Firebase Google OAuth 2.0 Identity Token verification. |
| **Supporter Profile (Optional)** | Full Name, Phone Number (E.164 format), Residential/Postal Address (unit, street, suburb, state, postcode, country). | Supporter engagement, issuance of statutory gift receipts, verification. | Supporter Registration Form in User Portal. |
| **Direct Communication** | First Name, Last Name, Subject Line, Message Body, Timestamp. | Responding to public inquiries, technical support, community feedback. | Contact Us Form (`mailto:support@aifoundation.net.au`). |
| **Supporter Chat Interactions** | Sender UID, Sender Email, Sender Display Name, Thread Identifier (`conv_{uid}`), Message Text, Embedded Links. | Asynchronous messaging between supporters and AI Foundation SuperAdmins. | Supporter Chat Console (`/api/chat/send`). |
| **Token Economy & Purchases** | Stripe Checkout Session ID (`cs_*`), Stripe PaymentIntent (`pi_*`), Token Quantities, Currency (`aud`/`usd`), Ledger Event IDs. | Crediting token balances, transaction history, audit trails, anti-fraud reconciliations. | Stripe Checkout webhooks and server sync. |
| **Technical Telemetry & Locality** | Country Code (`x-vercel-ip-country`), Suburb/State (from geo widget), Browser User-Agent, Session IP. | Correct statutory currency display (AUD in Australia vs USD international), localized weather/time widgets, abuse prevention. | Edge HTTP headers & client browser settings. |

> [!NOTE]
> **No Sensitive Data**: We do not solicit or store sensitive information (such as political opinions, religious beliefs, biometric data for identification, or philosophical memberships) unless required under Australian statutory law.

---

<a id="3-multi-tenant-tag-partitioning-and-chat-confidentiality"></a>
### 3. Multi-Tenant Tag Partitioning & Chat Confidentiality
`#ChatConfidentiality` `#TenantTagPrivacy`

Our integrated platform features a centralized administrative Message Box designed with strict privacy boundaries:
1. **Confidentiality of Tenant Discriminators**: Each message ingested contains an internal tenant routing discriminator (`tag`). This discriminator is classified as **Confidential System Metadata** and is accessible **strictly by SuperAdmins**. Standard supporters and non-superadmin users never receive tenant classification keys.
2. **Conversation Thread Isolation**: Supporter chat threads are strictly keyed to the user’s individual Firebase UID (`conv_${uid}`). Regular supporters can read and write exclusively within their own private conversation thread.
3. **Strict Ban on File Uploads**: To prevent unauthorized data transfer, malicious payload execution, and inadvertent leakage of sensitive personal files, the chat interface is strictly limited to text and verified URLs. The system parameter `hasUploads` is hard-enforced to `false`. Binary uploads are rejected at the server level.

---

<a id="4-payment-card-processing-and-pci-dss-scope-minimization"></a>
### 4. Payment Card Processing & PCI DSS Scope Minimization
`#PCIDSS` `#SAQ_A` `#StripeSecurity`

Financial contributions, donation payments, and token purchases are processed with the highest assurance security protocols:
1. **Zero Cardholder Storage**: The AI Foundation complies with the **Payment Card Industry Data Security Standard (PCI DSS v4.0)** under the **Self-Assessment Questionnaire A (SAQ A)** profile. We never receive, process, store, or transmit raw credit or debit card numbers (Primary Account Numbers, CVV/CVC, or card expiration dates).
2. **End-to-End Client Tokenization**: All payment inputs are entered directly into encrypted iframes hosted by Stripe (`js.stripe.com`) or within PayPal's secure checkout environment. Our servers receive and store only opaque, tokenized references (`pi_*`, `cs_*`, or PayPal Order IDs) with associated integer amounts.

---

<a id="5-uniform-7-year-statutory-data-retention-and-disposal"></a>
### 5. Uniform 7-Year Statutory Data Retention & Disposal
`#SevenYearRetention` `#CorporationsAct2001` `#APP11`

In compliance with statutory recordkeeping requirements under the **Corporations Act 2001 (Cth) Section 286**, the **Australian Taxation Office (ATO)**, and **Australian Privacy Principle 11.2**:
1. **Retention Period**: All financial transaction logs, tax receipts, donation records, payment audit entries, supporter chat interactions, and identity verification logs must be retained for exactly **7 years (2,557 days)** from the date of record generation.
2. **Immutable Audit Trails**: During the 7-year retention cycle, records are preserved against modification or unauthorized erasure to ensure legal compliance, financial auditability, and system integrity.
3. **Disposal & Anonymization Routine**: Upon the expiration of the 7-year lifecycle, non-financial personally identifiable records are securely deleted or irreversibly de-identified using cryptographically verified destruction protocols.

---

<a id="6-media-storage-open-graph-scraping-and-ssrf-safeguards"></a>
### 6. Media Storage, Open Graph Scraping & SSRF Safeguards
`#DataSanitization` `#SSRFProtection`

1. **Media Ingestion**: Image assets uploaded for approved community or project postings are processed through designated cloud CDN endpoints (ImgBB Cloud CDN). Media base64 buffers are held in ephemeral transit memory and purged immediately post-transmission.
2. **Metadata Previews & Server-Side Request Forgery (SSRF) Defense**: When URLs are submitted for Open Graph preview generation, our scraping microservice enforces strict validation. Requests directed toward RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), loopback addresses (`127.0.0.0/8`), link-local allocations (`169.254.0.0/16`), or internal cloud metadata servers are blocked immediately.
3. **XSS & Output Sanitization**: All content rendered on our platforms undergoes strict entity encoding (`&`, `<`, `>`, `"`, `'`) to protect users against Cross-Site Scripting (XSS).

---

<a id="7-cookies-local-storage-and-security-safeguards"></a>
### 7. Cookies, Local Storage & Security Safeguards
`#CookiesAndStorage` `#DataEncryption`

1. **Cookies & Tokens**: We use minimal functional cookies and local storage tokens strictly required for site operation:
   * `adminAuth`: Session verification cookie for authenticated management.
   * `aifoundation_locale`: Local storage cache preserving user-selected regional preferences (date/time formats and suburb/state).
2. **Encryption in Transit and at Rest**:
   * All network traffic across our portals is enforced via **TLS 1.3 / HTTPS** with HTTP Strict Transport Security (HSTS).
   * All Cloud Firestore records, user databases, and transaction ledgers are encrypted at rest using **AES-256** multi-region cloud encryption keys.
3. **Automated Security Controls**: Administrative and privileged API operations require valid Google OAuth 2.0 identity tokens evaluated server-side against role-based access control (RBAC) lists.

---

<a id="8-australian-privacy-principles-compliance"></a>
### 8. Australian Privacy Principles (APPs 1–13) Rights & Redress
`#APPCompliance` `#PrivacyRights`

Under the Australian Privacy Principles, you have enforceable rights concerning your personal information:
* **APP 1 (Open and transparent management)**: This policy clearly explains our information practices.
* **APP 6 (Use or disclosure)**: We do not sell, rent, license, or disclose your personal information to third-party data brokers or marketing aggregators. Information is used exclusively for AI Foundation operational and educational missions.
* **APP 8 (Cross-border disclosure)**: Personal data stored on cloud infrastructure is maintained within trusted enterprise cloud regions (Google Cloud Platform, Vercel Edge Network, Stripe). All cloud partners meet equivalent international privacy and security standards.
* **APP 10 (Quality of personal information)**: We take reasonable steps to ensure all personal data collected is accurate, complete, and up to date.
* **APP 12 (Access to personal information)**: You may request access to the personal information held about you by contacting our Privacy Officer.
* **APP 13 (Correction of personal information)**: You may request corrections to inaccurate, out-of-date, incomplete, or misleading personal data.

---

<a id="9-contacting-the-privacy-officer-and-oaic-escalation"></a>
### 9. Contacting the Privacy Officer & OAIC Escalation
`#PrivacyOfficer` `#OAIC` `#Inquiries`

If you have questions, wish to exercise your rights under the APPs, or wish to lodge a privacy grievance, please contact our designated Privacy Officer:

* **Entity**: AI Foundation Australia
* **Attention**: Privacy Officer
* **Email**: [support@aifoundation.net.au](mailto:support@aifoundation.net.au)
* **Website**: [www.aifoundation.net.au](https://www.aifoundation.net.au/)
* **ABN**: 36 339 516 584

We review and respond to formal privacy inquiries within thirty (30) business days. If you remain dissatisfied with our response, you have the right to lodge a formal complaint with the **Office of the Australian Information Commissioner (OAIC)**:
* **Online**: [www.oaic.gov.au](https://www.oaic.gov.au/)
* **Phone**: 1300 363 992
* **Postal**: GPO Box 5288, Sydney NSW 2001

---

<a id="terms-of-service"></a>
# Part II: Applications Terms of Service

`#TermsOfService` `#ApplicationsTerms` `#UserAgreement` `#AustralianConsumerLaw`

These Applications Terms of Service ("Terms") govern access to and use of all web applications, portals, software services, application programming interfaces (APIs), digital content, and utilities provided by **AI Foundation** (ABN 36 339 516 584) ("we", "us", or "our").

By accessing our sites, registering an account, purchasing tokens, or utilizing our services, you ("User" or "Supporter") agree to be bound by these Terms and our Privacy Policy. If you do not agree, you must cease using our platforms immediately.

---

<a id="10-acceptance-of-terms-and-eligibility"></a>
### 10. Acceptance of Terms & Eligibility
`#Eligibility` `#AcceptanceOfTerms`

1. **Contractual Capacity**: You represent and warrant that you are at least 18 years of age (or have obtained legal parental/guardian consent if between 15 and 17) and have full legal capacity to enter into a binding contract under Australian law.
2. **Entity Representation**: If you access our applications on behalf of a company, institution, registered training organization (RTO), or commercial enterprise, you warrant that you are authorized to bind that entity to these Terms.

---

<a id="11-ecosystem-portals-and-connected-applications"></a>
### 11. Ecosystem Portals & Connected Applications
`#ConnectedApps` `#Ecosystem`

These Terms govern user interaction across all connected AI Foundation platforms and child portals, including but not limited to:
* **AI Core**: [www.aifoundation.net.au](https://www.aifoundation.net.au/) &mdash; AI Literacy, Community Platforms & Public Showcase.
* **LMS Portal**: [lms.aifoundation.net.au](https://lms.aifoundation.net.au/) &mdash; Learning Management Systems & AI Course Delivery.
* **HR Solutions**: [hr.aifoundation.net.au](http://hr.aifoundation.net.au/) &mdash; Human Resources & Talent Orchestration.
* **Trades & Work**: [jobs.aifoundation.net.au](https://jobs.aifoundation.net.au/) &mdash; Field Work & "It's a Simple Job" Platforms.
* **PT & Fitness**: [pt.aifoundation.net.au](https://pt.aifoundation.net.au/) &mdash; Physical Training & Athletic Workflows.
* **Health Platforms**: [health.aifoundation.net.au](https://health.aifoundation.net.au/) &mdash; Health & Wellbeing Applications.
* **Vocational RTO**: [edu.aifoundation.net.au](https://edu.aifoundation.net.au/) &mdash; Vocational Education & RTO AI Workspaces.
* **Nihongo Portal**: [nihongo.aifoundation.net.au](https://nihongo.aifoundation.net.au/) &mdash; Japanese Language Learning Tools.
* **Finance Portal**: [finance.aifoundation.net.au](https://finance.aifoundation.net.au/) &mdash; Financial Modeling & Token Accounting.

---

<a id="12-authentication-account-roles-and-superadmin-powers"></a>
### 12. Authentication, Account Roles & SuperAdmin Powers
`#AccountSecurity` `#RBAC` `#Roles`

1. **Authentication via Google SSO**: Accounts are provisioned and authenticated via Firebase Google OAuth 2.0. Users are responsible for maintaining the security of their Google credentials.
2. **Role Classifications**:
   * **Supporter**: Default verified role granted to registered Google accounts. Supporters enjoy access to community features, personal chat threads, token management, and platform applications.
   * **SuperAdmin**: Privileged role restricted strictly to verified root administrators. SuperAdmins possess authority to modify service pricing, issue token grants, inspect cross-tenant message feeds, and manage system invariants.
3. **Account Integrity**: Users must notify AI Foundation immediately if unauthorized use of their account is detected. We reserve the right to suspend any account involved in fraudulent, abusive, or non-compliant conduct.

---

<a id="13-universal-token-economy-and-balance-terms"></a>
### 13. Universal Token Economy & Balance Terms
`#TokenEconomy` `#TokenRules` `#UtilityTokens`

The AI Foundation implements a unified, integer-based utility token economy across all connected applications:
1. **Nature of Tokens**: Tokens represent internal digital utility credits used exclusively to access specialized compute, AI agent workflows, educational resources, and service features across AI Foundation portals. Tokens are **not legal tender, currency, securities, or financial products**.
2. **Strict Integer Rule**: Token balances (`token_balance`) and token expenditures are strictly whole numbers (`Math.round`, positive integers). Fractional or decimal tokens are strictly disallowed.
3. **Purchase Increments & Limits**:
   * Tokens are purchased in multiples of 10 (minimum purchase: 10 tokens).
   * A single transaction is capped at 1,000,000,000 tokens to mitigate accidental input errors.
   * Total payment amount per transaction is subject to Stripe card boundaries (AUD/USD $0.50 to $999,999.99).
4. **Currency & Localization Rules**:
   * Visitors connecting from within Australia (`AU`) are presented with and billed in Australian Dollars (**AUD**).
   * Visitors connecting from outside Australia are presented with and billed in United States Dollars (**USD**). AUD pricing is never shown outside Australia.
   * If an AUD price is unspecified, the standard USD price applies at prevailing exchange rates.
5. **Universal Balance & Spending Invariant**:
   * Token balances are linked to the user's unified Google UID and are accessible across all authorized AI Foundation applications.
   * Token spending (`POST /api/tokens/spend`) executes under strict server-side idempotency keys (`spend_{app}_{reference}`). Duplicate requests are rejected, preventing double-spend events.
   * Balance cannot fall below zero (`0`). If available tokens are insufficient for a service invocation, the transaction is rejected with an HTTP 409 status code.
6. **Non-Refundability**: Because tokens are non-physical utility units credited immediately upon payment confirmation via atomic database commits, token purchases are non-refundable and non-exchangeable for fiat cash, except where mandatory refund rights apply under the **Australian Consumer Law**.

---

<a id="14-financial-contributions-donations-and-tax-compliance"></a>
### 14. Financial Contributions, Donations & Tax Compliance
`#Contributions` `#Donations` `#ATOCompliance`

1. **Voluntary Support**: Contributions and donations made through our portal directly fund community educational outreach, AI literacy research, and platform infrastructure.
2. **Contribution Boundaries**: The minimum single contribution accepted via our automated checkout is **AUD $50.00**.
3. **Receipting**: Automated electronic receipts are issued upon payment completion. Contributors are advised to seek independent advice from a registered Australian tax agent regarding personal or business deductibility.

---

<a id="15-acceptable-use-policy-and-security-rules"></a>
### 15. Acceptable Use Policy (AUP) & Security Rules
`#AcceptableUse` `#SecurityProtocols` `#ZeroTolerance`

Users agree to use AI Foundation services strictly for lawful purposes and must not:
1. **Security Interference**: Probe, scan, or test the vulnerability of our servers, edge endpoints, Firestore security rules, or APIs without express authorization.
2. **Tenant Partition Violations**: Attempt to forge, tamper with, or override multi-tenant partition keys (`tag`, `businessId`, `source`).
3. **Prohibited File Uploads**: Attempt to circumvent input filters to upload binary, executable, or unapproved files through message fields or chat interfaces.
4. **Malicious Automation**: Deploy denial-of-service (DoS) tools, scrapers, automated bot scripts, or high-frequency automated queries that degrade server stability.
5. **Harmful Content**: Transmit defamatory, harassing, sexually explicit, racially abusive, or unlawful material through our supporter chat or community discussion surfaces.
6. **SSRF Exploitation**: Provide malicious URLs targeting private internal network addresses, loopback ranges, or cloud service metadata instances.

---

<a id="16-intellectual-property-and-license-grants"></a>
### 16. Intellectual Property & License Grants
`#IntellectualProperty` `#Licensing`

1. **AI Foundation Ownership**: All platform code, software architectures, algorithms, visual styles, branding, logos, trademarks, and documentation are the exclusive intellectual property of AI Foundation or its licensors.
2. **Limited User License**: We grant you a revocable, non-exclusive, non-transferable, limited license to access and use our portals strictly in accordance with these Terms.
3. **User Content Grant**: By submitting public project entries, community posts, or feedback, you grant AI Foundation a non-exclusive, worldwide, royalty-free license to display, index, format, and syndicate that content across our educational platforms.

---

<a id="17-australian-consumer-law-guarantees-and-disclaimers"></a>
### 17. Australian Consumer Law (ACL) Guarantees & Disclaimers
`#AustralianConsumerLaw` `#StatutoryGuarantees`

1. **Non-Excludable Guarantees**: Nothing in these Terms excludes, restricts, or modifies any guarantee, condition, warranty, right, or remedy conferred on you by the **Australian Consumer Law (ACL)** (Schedule 2 of the *Competition and Consumer Act 2010* (Cth)) or any other applicable statutory law that cannot be lawfully excluded.
2. **As-Is Provision for AI Outputs**: To the maximum extent permitted by law, services involving artificial intelligence models, automated synthesis, and predictive agents are provided on an "as is" and "as available" basis. AI Foundation does not warrant that AI model outputs will be error-free, completely factual, or tailored to specific legal, medical, or accounting scenarios. Users must exercise independent judgment before relying on automated AI responses.

---

<a id="18-limitation-of-liability-and-indemnification"></a>
### 18. Limitation of Liability & Indemnification
`#LimitationOfLiability` `#Indemnification`

1. **Aggregate Liability Cap**: To the fullest extent permitted by Australian law, our aggregate liability for any loss, damage, or claim arising out of or related to these Terms or your use of the applications (whether in contract, tort, negligence, or statute) is strictly limited to:
   * The total amount paid by you to AI Foundation for services or tokens in the twelve (12) months preceding the incident; or
   * The resupply of the services or the cost of having the services resupplied.
2. **Exclusion of Consequential Losses**: In no event shall AI Foundation be liable for any indirect, incidental, special, punitive, exemplary, or consequential damages, including loss of profits, loss of revenue, business interruption, or loss of data.
3. **Indemnification**: You agree to defend, indemnify, and hold harmless AI Foundation, its directors, officers, contractors, and employees against any third-party claims, liabilities, damages, or costs (including reasonable legal fees) arising from your breach of these Terms or violation of applicable laws.

---

<a id="19-termination-suspension-and-account-purge"></a>
### 19. Termination, Suspension & Account Purge
`#Termination` `#AccountSuspension`

1. **Suspension for Cause**: We reserve the right to immediately suspend or terminate your account or revoke token utility if you violate these Terms, breach our Acceptable Use Policy, engage in fraudulent transactions, or compromise platform security.
2. **User Cancellation**: You may discontinue use of our platforms and request account deactivation at any time by contacting [support@aifoundation.net.au](mailto:support@aifoundation.net.au).
3. **Statutory Preservation**: Following account termination, transactional and audit data remains subject to the mandatory 7-year retention schedule specified in Section 5.

---

<a id="20-governing-law-venue-and-severability"></a>
### 20. Governing Law, Venue & Severability
`#GoverningLaw` `#Jurisdiction` `#QueenslandLaw`

1. **Governing Law**: These Terms and any dispute or controversy arising out of or in connection with them shall be governed by and construed in accordance with the laws of the **State of Queensland and the Commonwealth of Australia**.
2. **Jurisdiction**: The parties irrevocably submit to the non-exclusive jurisdiction of the courts of Queensland and the Federal Court of Australia.
3. **Severability**: If any provision of these Terms is deemed invalid or unenforceable by a court of competent jurisdiction, that provision will be severed to the minimum extent necessary, and the remaining provisions will remain in full force and effect.
4. **Entire Agreement**: These Terms, together with our Public Privacy Policy and technical Data Contracts, constitute the entire agreement between the user and AI Foundation regarding platform access.

---

<a id="document-footer"></a>
## Document Footer & Regulatory Labels
`#RegulatoryNotice` `#LegalFooter`

```
====================================================================================================
AI FOUNDATION AUSTRALIA | COMPREHENSIVE LEGAL SPECIFICATION & TERMS
====================================================================================================
ABN: 36 339 516 584                       | Primary Support: support@aifoundation.net.au
Classification: Public Legal Policy       | Version: 2026.1-STABLE
Regulatory Alignment: Privacy Act 1988    | Retention: 7 Years (Corporations Act 2001 s 286)
Payment Compliance: PCI DSS v4.0 SAQ A    | Consumer Law: ACL Competition & Consumer Act 2010
====================================================================================================
```

### Official Footer Badges & Metadata Labels

* `#PrivacyPolicy` &mdash; <small>**Australian Privacy Act 1988 (Cth)** &bull; **APPs 1–13 Compliant** &bull; **Zero Data Brokerage**</small>
* `#TermsOfService` &mdash; <small>**Application Terms of Service** &bull; **Australian Consumer Law Aligned** &bull; **Queensland Jurisdiction**</small>
* `#TokenEconomy` &mdash; <small>**Integer-Only Utility Tokens** &bull; **Non-Fractional** &bull; **Multi-Tenant Server-Verified Balance**</small>
* `#PCI_DSS_SAQ_A` &mdash; <small>**Direct Encrypted Stripe Elements** &bull; **Zero Raw Cardholder Server Storage**</small>
* `#SevenYearRetention` &mdash; <small>**7-Year Immutable Recordkeeping** &bull; **Corporations Act 2001 (Cth) s 286** &bull; **ATO Conforming**</small>
* `#TenantIsolation` &mdash; <small>**Firestore Tag Partition Invariant: `tag == 'aifoundation'`** &bull; **SuperAdmin Message Box Boundary**</small>

---
*End of AI Foundation Public Privacy Policy and Applications Terms of Service Document.*
