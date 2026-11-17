const path = require('path');
const { z } = require('zod');
const { PARTITION_KEY } = require('./strategy-plan');
const {
    SuperadminDraftSaveSchema,
    SuperadminFinalImproveSchema: SuperadminFinalToolAdvisorySchema,
    createSharedAdvisorySchemas,
    createAdvisoryWorkflowEngine
} = require('./advisory-workflow-engine');

const SESSIONS_COLLECTION = 'aifoundation_tool_governance_sessions';
const REVIEWS_COLLECTION = 'aifoundation_tool_governance_reviews';
const DEFAULT_SESSIONS_FILE = path.join(__dirname, 'data', 'tool-governance-sessions.json');
const DEFAULT_REVIEWS_FILE = path.join(__dirname, 'data', 'tool-governance-reviews.json');

const SERVICE_SLUG = 'stack-selection';
const SERVICE_NAME = 'Services - AI Tool Selection & Governance Advisory';
const SERVICE_TYPE = 'ai_tool_selection_governance_advisory';
const SERVICE_WORKFLOW = 'advisory_with_superadmin_improvement';
const DEFAULT_PRICE_AUD_CENTS = 39900;

const SESSION_ID_PATTERN = /^toolgov_[A-Za-z0-9_-]{6,120}$/;
const REVIEW_ID_PATTERN = /^tgrev_[A-Za-z0-9_-]{6,120}$/;

const INTAKE_QUESTIONS = [
    {
        step: 1,
        topic: 'Compliance Sector & Organization Scale',
        prompt: 'Question 1 of 6 (Compliance Sector & Organization Scale): What is your organization name, primary regulatory domain (Medical/Clinical, Higher Education/Research, Corporate/Legal/Financial, or Hybrid), jurisdiction, and user/seat count? (Zero-access advisory: never share PHI, logins, or keys.)'
    },
    {
        step: 2,
        topic: 'Multimodal Workflows Required',
        prompt: 'Question 2 of 6 (Multimodal Workflows Required): Which specific AI workflows do you need evaluated across text/reasoning, ambient voice/audio transcription, document/PDF/image vision, video/media, or structured data analysis?'
    },
    {
        step: 3,
        topic: 'Precision Thresholds & Verification Boundaries',
        prompt: 'Question 3 of 6 (Precision Thresholds & Verification Boundaries): What is your error/hallucination tolerance (e.g., admin scribing vs. regulated clinical/academic/board provenance) and where must human sign-off be enforced?'
    },
    {
        step: 4,
        topic: 'Deployment Boundary (Air-Gapped On-Premise vs. Secure Cloud)',
        prompt: 'Question 4 of 6 (Deployment Boundary): Does sensitivity require full offline air-gapped on-premise hosting, sovereign onshore AU cloud hosting with zero data retention, or a split hybrid model? Which certifications apply (IRAP, ISO 27001, AS ISO/IEC 42001, SOC 2 Type II, HIPAA)?'
    },
    {
        step: 5,
        topic: 'Existing Environment & Local Hardware Readiness (High-Level Only)',
        prompt: 'Question 5 of 6 (Environment & Local Hardware Readiness): By name only, which core ecosystems do you use (e.g., Google Workspace, M365, EHR/LMS/ERP category), and for any air-gapped/on-premise needs, do you have local GPU/server hardware or need VRAM sizing advice?'
    },
    {
        step: 6,
        topic: 'Budget & Top 30-Day Procurement Decisions',
        prompt: 'Question 6 of 6 (Budget & Top 30-Day Procurement Decisions): What target monthly cloud/licensing or capital hardware budget (AUD) do you have, and what are your top 3 tool-selection or governance procurement decisions for the next 30 days?'
    }
];

const ToolGovernanceIntakeSchema = z.object({
    organizationName: z.string().min(1).max(200),
    sectorAndScale: z.string().min(1).max(800),
    multimodalWorkflows: z.string().min(1).max(1200),
    precisionBoundaries: z.string().min(1).max(1200),
    deploymentBoundary: z.string().min(1).max(1200),
    environmentReadiness: z.string().min(1).max(1200),
    budgetAndProcurementGoals: z.string().min(1).max(1200)
}).strict();

const PreliminaryDraftSectionsSchema = z.object({
    section1Profile: z.string().min(20).max(5000),
    section2Pillar1ToolStack: z.string().min(20).max(6000),
    section3Pillar2MultimodalVetting: z.string().min(20).max(6000),
    section4Pillar3AirGapOrCloudCompliance: z.string().min(20).max(6000),
    section5GovernancePolicyRoadmap: z.string().min(20).max(6000)
}).strict();

const AsyncVendorAuditSectionsSchema = z.object({
    cloudVendorAndCertifications: z.string().min(20).max(6000),
    airGapModelsAndVramSpecs: z.string().min(20).max(6000),
    sectorRegulatoryTripwires: z.string().min(20).max(6000),
    specialistImprovementChecklist: z.string().min(20).max(6000)
}).strict();

const sharedSchemas = createSharedAdvisorySchemas({
    sessionIdPattern: SESSION_ID_PATTERN,
    reviewIdPattern: REVIEW_ID_PATTERN,
    stripeKind: 'tool_governance_advisory',
    serviceSlug: SERVICE_SLUG,
    serviceName: SERVICE_NAME,
    serviceType: SERVICE_TYPE,
    workflow: SERVICE_WORKFLOW,
    needsSummarySchema: ToolGovernanceIntakeSchema
});

function detectComplianceSector(q1Text) {
    const low = String(q1Text || '').toLowerCase();
    if (/(medical|clinic|health|patient|hospital|gp|ahpra|tga|hipaa|ehr)/.test(low)) return 'Medical & Clinical';
    if (/(university|research|academic|higher ed|teqsa|school|lms|faculty)/.test(low)) return 'Higher Education & Research';
    if (/(corporate|legal|finance|financial|bank|asic|aicd|board|law)/.test(low)) return 'Corporate & Financial Governance';
    return 'High-Compliance Multi-Sector';
}

function createToolGovernanceService(options = {}) {
    const engine = createAdvisoryWorkflowEngine({
        logLabel: 'Tool Governance',
        studioLabel: 'Tool Governance Studio',
        adminPageUrl: '/services.html#admin-tool-governance-studio',
        sessionsCollection: SESSIONS_COLLECTION,
        reviewsCollection: REVIEWS_COLLECTION,
        defaultSessionsFile: DEFAULT_SESSIONS_FILE,
        defaultReviewsFile: DEFAULT_REVIEWS_FILE,
        sessionIdPattern: SESSION_ID_PATTERN,
        reviewIdPattern: REVIEW_ID_PATTERN,
        sessionPrefix: 'toolgov_',
        reviewPrefix: 'tgrev_',
        stripeKind: 'tool_governance_advisory',
        serviceSlug: SERVICE_SLUG,
        serviceName: SERVICE_NAME,
        serviceType: SERVICE_TYPE,
        workflow: SERVICE_WORKFLOW,
        priceEnvVar: 'AI_TOOL_GOVERNANCE_PRICE_AUD_CENTS',
        defaultPriceAudCents: DEFAULT_PRICE_AUD_CENTS,
        readAudPriceFromStore: saved => saved?.prices?.[SERVICE_SLUG]?.price?.aud,
        checkoutDescription: 'AI Tool Selection, Multimodal Vetting & Air-Gapped/Cloud Compliance Advisory (Strictly Advisory-Only + Architect Review)',
        returnQueryKey: 'tool_governance',
        preliminaryFilePrefix: 'PRELIMINARY_AI_Tool_Selection_Governance_Advisory',
        finalFilePrefix: 'FINAL_VETTED_AI_Tool_Selection_Governance_Advisory',
        finalBannerTitle: 'FINAL VETTED AI TOOL SELECTION & GOVERNANCE PLAN',
        introWelcomeLine: 'Payment confirmed. Welcome to your strictly advisory-only AI Tool Selection & Governance consultation.',
        introPrivacyLine: 'Zero-Access Guarantee: We access NONE of your EHR/clinical software, university LMS, corporate workspace, or on-premise LAN, and accept no file uploads. Never paste PHI, patient names, internal IPs, passwords, or API keys.',
        questions: INTAKE_QUESTIONS,
        schemas: sharedSchemas,
        extractSectorOrTag: detectComplianceSector,
        async runStage1Grounding({ q1Answer, runGeminiInteraction, stripMarkdownAndHtml }) {
            const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
            const systemInstruction = 'You are a high-compliance AI procurement and governance architect. Run a brief public web search matching the client sector and jurisdiction (e.g., TGA/Ahpra/OAIC for medical; TEQSA/research integrity for academic; ASIC/AICD/AS ISO/IEC 42001/IRAP for corporate). Reply in 2-3 concise plain-text sentences. No Markdown, no HTML, zero claims of accessing private systems.';
            const aiText = await runGeminiInteraction({
                model,
                systemInstruction,
                input: `Sector and scale answer: ${q1Answer}`,
                useSearch: true
            });
            if (aiText) return stripMarkdownAndHtml(aiText).slice(0, 1200);
            const sector = detectComplianceSector(q1Answer);
            return `${sector} deployments in Australia must verify zero-data-retention vendor agreements, OAIC APP security controls, IRAP/ISO 42001/SOC 2 Type II assurances, or physically segmented air-gapped inference before processing regulated workloads.`;
        },
        async generateStepFollowUp({ step, answer, orgName, groundingSummary, nextQuestion, questionTopic, runGeminiInteraction, stripMarkdownAndHtml }) {
            const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
            const systemInstruction = 'You are an AI Tool Selection & Governance advisor. Acknowledge the answer in 1-2 short plain-text sentences (strictly advisory, never request credentials, PHI, or file uploads), add a blank line, and ask the exact next question verbatim. Plain text only.';
            const aiText = await runGeminiInteraction({
                model,
                systemInstruction,
                input: [
                    `Organization: ${orgName}`,
                    `Step ${step} (${questionTopic}): ${answer}`,
                    groundingSummary ? `Regulatory Context: ${groundingSummary}` : '',
                    `Exact Next Question: ${nextQuestion.prompt}`
                ].filter(Boolean).join('\n'),
                useSearch: false
            });
            if (aiText) return stripMarkdownAndHtml(aiText).slice(0, 2200);
            const prefix = step === 1 && groundingSummary
                ? `Scoped for ${orgName}. ${groundingSummary}`
                : `Noted for ${orgName} — factored into your tool selection and compliance matrix.`;
            return `${prefix}\n\n${nextQuestion.prompt}`;
        },
        buildNeedsSummary(orgName, sectorLabel, answers) {
            const byStep = new Map(answers.map(a => [a.step, a.answer]));
            return ToolGovernanceIntakeSchema.parse({
                organizationName: orgName,
                sectorAndScale: `${sectorLabel}: ${(byStep.get(1) || orgName).slice(0, 740)}`,
                multimodalWorkflows: (byStep.get(2) || 'Text, reasoning, and document workflows.').slice(0, 1180),
                precisionBoundaries: (byStep.get(3) || 'Mandatory human sign-off prior to external release.').slice(0, 1180),
                deploymentBoundary: (byStep.get(4) || 'Onshore AU zero-retention cloud vs air-gapped evaluation.').slice(0, 1180),
                environmentReadiness: (byStep.get(5) || 'Standard workspace ecosystem; hardware sizing requested.').slice(0, 1180),
                budgetAndProcurementGoals: (byStep.get(6) || '30-day controlled pilot procurement and governance charter.').slice(0, 1180)
            });
        },
        async generatePreliminaryTxt({ session, dateStr, runGeminiInteraction, parseJsonFromModelText, stripMarkdownAndHtml }) {
            const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
            const qaSummary = session.answers.map(a => `Q${a.step} (${a.topic}): ${a.answer}`).join('\n');
            const systemInstruction = [
                'Generate the preliminary plain-text advisory plan for "Services - AI Tool Selection & Governance Advisory".',
                'STRICT ADVISORY RULE: Tell the client which exact AI tools, enterprise/API/self-hosted tiers, and air-gapped or sovereign cloud settings to procure and configure (zero automated external provisioning, zero clinical/legal representation, zero access to private systems).',
                'Return STRICT JSON ONLY with keys: section1Profile, section2Pillar1ToolStack, section3Pillar2MultimodalVetting, section4Pillar3AirGapOrCloudCompliance, section5GovernancePolicyRoadmap.',
                'Plain text only inside values (no Markdown, no HTML).'
            ].join('\n');

            const raw = await runGeminiInteraction({
                model,
                systemInstruction,
                input: [
                    `Organization: ${session.clientOrganizationName} (${session.sectorOrWorkflowTag})`,
                    `Public Regulatory Grounding: ${session.groundingSummary}`,
                    'Scoping Q&A:',
                    qaSummary
                ].join('\n\n'),
                useSearch: false
            });

            const parsed = parseJsonFromModelText(raw, PreliminaryDraftSectionsSchema);
            const ns = session.needsSummary;
            const s = parsed ? {
                section1Profile: stripMarkdownAndHtml(parsed.section1Profile),
                section2Pillar1ToolStack: stripMarkdownAndHtml(parsed.section2Pillar1ToolStack),
                section3Pillar2MultimodalVetting: stripMarkdownAndHtml(parsed.section3Pillar2MultimodalVetting),
                section4Pillar3AirGapOrCloudCompliance: stripMarkdownAndHtml(parsed.section4Pillar3AirGapOrCloudCompliance),
                section5GovernancePolicyRoadmap: stripMarkdownAndHtml(parsed.section5GovernancePolicyRoadmap)
            } : {
                section1Profile: [
                    `Organization: ${session.clientOrganizationName}`,
                    `Sector & Scale: ${ns?.sectorAndScale || session.sectorOrWorkflowTag}`,
                    `Modalities Requested: ${ns?.multimodalWorkflows || 'Text, documents, voice/vision vetting'}`,
                    `Deployment Boundary: ${ns?.deploymentBoundary || 'Onshore zero-retention cloud and/or air-gapped evaluation'}`
                ].join('\n'),
                section2Pillar1ToolStack: [
                    '- Primary Compliant Stack: Procure enterprise/API tiers with contractual zero-data-retention (e.g., Google Vertex AI / Gemini Enterprise pinned to australia-southeast1, or Microsoft Azure AI Foundry Australia East) alongside segmented self-hosted inference where required.',
                    '- Explicitly Prohibited Tiers: Block all consumer/free web chat plans (personal ChatGPT/Gemini consumer/free accounts) that retain prompts or offer no BAAs/DPAs.',
                    `- Estimated Cost Bracket: Align initial licenses to ${ns?.budgetAndProcurementGoals || 'AUD pilot thresholds'} using token-metered API caps plus fixed workspace seats.`
                ].join('\n'),
                section3Pillar2MultimodalVetting: [
                    '- Text & Reasoning: Enforce structured output validation, source citation extraction, and mandatory human sign-off for regulated outputs.',
                    '- Ambient Voice / Audio Transcription: Procure onshore/zero-retention transcription pipelines; mandate verbal participant consent and auto-purge raw audio after verified note sign-off.',
                    '- Document / PDF / Image Vision: De-identify headers/PII prior to cloud vision parsing or route sensitive scans strictly to isolated VPC / air-gapped OCR.',
                    `- Human-in-the-Loop Precision Controls: Enforce "${ns?.precisionBoundaries || 'mandatory specialist review'}" on every non-trivial draft.`
                ].join('\n'),
                section4Pillar3AirGapOrCloudCompliance: [
                    '- If Air-Gapped On-Premise Applies: Deploy open-weight Apache 2.0 / commercial-permitted models (e.g., Qwen2.5/Qwen3 or Gemma 3 enterprise weights) on isolated offline vLLM/Ollama nodes, verify zero-telemetry egress firewall deny rules, validate quantization fidelity (Q6_K/FP8 minimum), and size single/multi-GPU VRAM (24-96 GB class depending on concurrency).',
                    '- If Secure Onshore Cloud Applies: Configure Google Cloud australia-southeast1/2 with VPC Service Controls, Cloud KMS Customer-Managed Encryption Keys (CMEK), IAM least privilege, OAIC APP 11 security logging, and contractual zero-training enforcement.'
                ].join('\n'),
                section5GovernancePolicyRoadmap: [
                    'Week 1: Ratify Acceptable AI Tool Register & Consumer Tier Blocklist + align AS ISO/IEC 42001 / sector accountability owner.',
                    'Week 2: Complete Vendor DPA / IRAP / ISO 27001 / SOC 2 Type II or offline VRAM hardware validation.',
                    'Week 3: Run non-sensitive pilot testing multimodal provenance and hallucination rates under human sign-off.',
                    'Week 4: Finalize procurement PO, immutable audit logging settings, and staff governance briefing.'
                ].join('\n')
            };

            const div = '='.repeat(68);
            const sub = '-'.repeat(68);
            return stripMarkdownAndHtml([
                div,
                'PRELIMINARY ADVISORY DRAFT - QUEUED FOR SUPERADMIN ANALYSIS & IMPROVEMENT (24-48 HRS)',
                SERVICE_NAME.toUpperCase(),
                div,
                `Organization     : ${session.clientOrganizationName}`,
                `Compliance Sector: ${session.sectorOrWorkflowTag}`,
                `Generated Date   : ${dateStr}`,
                `Stripe Session   : ${session.stripeSessionId}`,
                'Zero-Access Proof: Accesses NOTHING in your EHR, LMS, corporate, or on-premise systems.',
                '',
                sub,
                'SECTION 1 - COMPLIANCE, MODALITY & DEPLOYMENT PROFILE',
                sub,
                s.section1Profile,
                '',
                sub,
                'SECTION 2 - PILLAR 1: HIGH-PRECISION AI TOOL EVALUATION & STACK SELECTION',
                sub,
                s.section2Pillar1ToolStack,
                '',
                sub,
                'SECTION 3 - PILLAR 2: MULTIMODAL WORKFLOW, SOFTWARE & PLATFORM VETTING',
                sub,
                s.section3Pillar2MultimodalVetting,
                '',
                sub,
                'SECTION 4 - PILLAR 3: ON-PREMISE AIR-GAPPED / SECURE CLOUD TOOL COMPLIANCE',
                sub,
                s.section4Pillar3AirGapOrCloudCompliance,
                '',
                sub,
                'SECTION 5 - SECTOR GOVERNANCE POLICY & 30-DAY PROCUREMENT CHECKLIST (WEEKS 1-4)',
                sub,
                s.section5GovernancePolicyRoadmap,
                div
            ].join('\n'));
        },
        async generateAsyncResearch({ session, qaDigest, model, runGeminiInteraction, parseJsonFromModelText, stripMarkdownAndHtml }) {
            const systemInstruction = [
                'You are AI Foundation Lead Compliance Architect performing async public vendor & infrastructure verification.',
                'Search public vendor trust centers, model cards/licenses, cloud regional residency tables, and regulatory publications to verify:',
                '1) Cloud vendor zero-data-retention terms, minimum enterprise seat traps, AU onshore region availability, IRAP/ISO 27001/AS ISO/IEC 42001/SOC 2 Type II status',
                '2) Air-gapped / open-weight commercial licenses (Apache 2.0 vs active-user caps), quantization accuracy trade-offs, offline telemetry flags, GPU VRAM sizing',
                '3) Sector regulatory tripwires (TGA ARTG Software as Medical Device, Ahpra consent/indemnity, OAIC APPs, TEQSA academic integrity, ASIC/AICD director duties).',
                'Return STRICT JSON ONLY with keys: cloudVendorAndCertifications, airGapModelsAndVramSpecs, sectorRegulatoryTripwires, specialistImprovementChecklist.',
                'Plain text only.'
            ].join('\n');

            const raw = await runGeminiInteraction({
                model,
                systemInstruction,
                input: [
                    `Client: ${session.clientOrganizationName} (${session.sectorOrWorkflowTag})`,
                    `Grounding: ${session.groundingSummary}`,
                    qaDigest
                ].join('\n\n'),
                useSearch: true
            });

            const parsed = parseJsonFromModelText(raw, AsyncVendorAuditSectionsSchema);
            const research = parsed ? {
                cloudVendorAndCertifications: stripMarkdownAndHtml(parsed.cloudVendorAndCertifications),
                airGapModelsAndVramSpecs: stripMarkdownAndHtml(parsed.airGapModelsAndVramSpecs),
                sectorRegulatoryTripwires: stripMarkdownAndHtml(parsed.sectorRegulatoryTripwires),
                specialistImprovementChecklist: stripMarkdownAndHtml(parsed.specialistImprovementChecklist)
            } : {
                cloudVendorAndCertifications: 'Verify enterprise Zero Data Retention addenda, minimum seat commitments, Australia-Southeast1 residency, and current IRAP / ISO 27001 / AS ISO/IEC 42001 / SOC 2 Type II attestations before procurement.',
                airGapModelsAndVramSpecs: 'Confirm Apache 2.0 / unrestricted commercial model licenses, block offline telemetry env flags (DO_NOT_TRACK / HF_HUB_OFFLINE), prefer Q6_K/FP8 quantization for high-precision tasks, and size 48-96 GB VRAM nodes for 32B-70B class models.',
                sectorRegulatoryTripwires: 'Cross-check TGA Software as Medical Device (SaMD) exclusion vs ARTG requirements, Ahpra practitioner verification duty, OAIC APP 5/11 transparency, TEQSA assessment provenance, or ASIC/AICD board AI governance oversight.',
                specialistImprovementChecklist: [
                    '- Confirm whether mixed air-gapped + cloud tiering simplifies procurement cost in Section 2.',
                    '- Add explicit vendor contract SLA / BAA / zero-training clause checks for SuperAdmin approval.',
                    '- Verify exact GPU VRAM headroom before approving FINAL_VETTED TXT delivery.'
                ].join('\n')
            };

            const div = '='.repeat(68);
            const sub = '-'.repeat(68);
            const researchSummary = stripMarkdownAndHtml([
                div,
                'ASYNC VENDOR, AIR-GAP HARDWARE & REGULATORY RESEARCH (SUPERADMIN BRIEF)',
                div,
                `Model Used: ${model}`,
                '',
                sub,
                'CLOUD VENDOR ZDR TERMS, SEAT TRAPS & CERTIFICATIONS',
                sub,
                research.cloudVendorAndCertifications,
                '',
                sub,
                'AIR-GAP OPEN-WEIGHT LICENSES, QUANTIZATION & GPU VRAM SPECS',
                sub,
                research.airGapModelsAndVramSpecs,
                '',
                sub,
                'SECTOR REGULATORY TRIPWIRES (TGA / AHPRA / OAIC / TEQSA / ASIC / AICD)',
                sub,
                research.sectorRegulatoryTripwires,
                '',
                sub,
                'RECOMMENDED ARCHITECT REFINEMENTS BEFORE FINAL DELIVERY',
                sub,
                research.specialistImprovementChecklist,
                div
            ].join('\n'));

            return {
                researchSummary,
                reviewSubject: `[Action Required: Analyse & Improve] AI Tool Selection & Governance - ${session.clientOrganizationName} (${session.sectorOrWorkflowTag})`,
                chatSummaryLine: `Key Compliance Audit: ${research.sectorRegulatoryTripwires.slice(0, 900)}`
            };
        }
    }, options);

    return {
        getToolGovernancePricing: engine.getPricing,
        ...engine
    };
}

module.exports = {
    SESSIONS_COLLECTION,
    REVIEWS_COLLECTION,
    SERVICE_SLUG,
    SERVICE_NAME,
    SERVICE_TYPE,
    SERVICE_WORKFLOW,
    DEFAULT_PRICE_AUD_CENTS,
    INTAKE_QUESTIONS,
    PARTITION_KEY,
    ToolGovernanceIntakeSchema,
    SuperadminDraftSaveSchema,
    SuperadminFinalToolAdvisorySchema,
    ToolGovernanceStripeMetadataSchema: sharedSchemas.StripeMetadataSchema,
    ToolGovernanceCheckoutInputSchema: sharedSchemas.CheckoutInputSchema,
    ToolGovernanceConfirmInputSchema: sharedSchemas.ConfirmInputSchema,
    ToolGovernanceChatTurnInputSchema: sharedSchemas.ChatTurnInputSchema,
    ToolGovernanceSessionSchema: sharedSchemas.SessionSchema,
    ToolGovernanceReviewSchema: sharedSchemas.ReviewSchema,
    createToolGovernanceService
};
