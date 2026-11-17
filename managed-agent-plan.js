const path = require('path');
const { z } = require('zod');
const { PARTITION_KEY } = require('./strategy-plan');
const {
    SuperadminDraftSaveSchema,
    SuperadminFinalImproveSchema: SuperadminFinalManagedAgentSchema,
    createSharedAdvisorySchemas,
    createAdvisoryWorkflowEngine
} = require('./advisory-workflow-engine');

const SESSIONS_COLLECTION = 'aifoundation_managed_agent_sessions';
const REVIEWS_COLLECTION = 'aifoundation_managed_agent_reviews';
const DEFAULT_SESSIONS_FILE = path.join(__dirname, 'data', 'managed-agent-sessions.json');
const DEFAULT_REVIEWS_FILE = path.join(__dirname, 'data', 'managed-agent-reviews.json');

const SERVICE_SLUG = 'ai-agent-hosting';
const SERVICE_NAME = 'Services - Managed AI Agent Hosting & Maintenance';
const SERVICE_TYPE = 'managed_ai_agent_hosting_maintenance_advisory';
const SERVICE_WORKFLOW = 'advisory_with_superadmin_improvement';
const DEFAULT_PRICE_AUD_CENTS = 34900;

const SESSION_ID_PATTERN = /^mgagent_[A-Za-z0-9_-]{6,120}$/;
const REVIEW_ID_PATTERN = /^marev_[A-Za-z0-9_-]{6,120}$/;

const INTAKE_QUESTIONS = [
    {
        step: 1,
        topic: 'Organization, Industry & Fragmented Workflows',
        prompt: 'Question 1 of 6 (Industry & Fragmented Workflows): What is your organization name and sector, and which fragmented manual workflows, institutional tasks, or live operations are slowing your team down? (Zero-access advisory: never share passwords, SSH keys, API tokens, or PII.)'
    },
    {
        step: 2,
        topic: 'Target Agent Tasks & MCP/Tool Interfaces',
        prompt: 'Question 2 of 6 (Agent Programming & Tool Interfaces): Which repeatable tasks should autonomous or human-in-the-loop agents execute, what external tool/MCP integrations or structured JSON outputs are needed (by name only), and where must humans approve actions?'
    },
    {
        step: 3,
        topic: 'Zero-Downtime SLA, Latency & Concurrency',
        prompt: 'Question 3 of 6 (Zero-Downtime SLA & Throughput): What daily task volume, peak concurrency, response-latency targets, and uptime/failover SLAs must the hosted agent runtime sustain without downtime?'
    },
    {
        step: 4,
        topic: 'Hosting Boundary & Safety Guardrails',
        prompt: 'Question 4 of 6 (Hosting Topology & Safety): Do you require sovereign Australian regional hosting (e.g., australia-southeast1 Cloud Run / Vertex / Vercel), strict prompt-injection and PII redaction gates, and per-run cost/rate circuit breakers?'
    },
    {
        step: 5,
        topic: 'Observability, Drift Evaluation & Maintenance Cadence',
        prompt: 'Question 5 of 6 (Monitoring, Drift & Maintenance): What live tracing/alerting metrics, model-version regression tests, error alerting channels, and monthly maintenance schedules does your operations team require?'
    },
    {
        step: 6,
        topic: 'Budget & Top 30-Day Launch Priorities',
        prompt: 'Question 6 of 6 (Budget & Top 30-Day Priorities): What target setup and monthly operational budget in AUD (including model tokens and hosting) are realistic, and which top workflows must run reliably in production by Day 30?'
    }
];

const ManagedAgentIntakeSchema = z.object({
    organizationName: z.string().min(1).max(200),
    industryAndWorkflows: z.string().min(1).max(1000),
    agentTasksAndTools: z.string().min(1).max(1200),
    slaAndLatency: z.string().min(1).max(1200),
    hostingAndSafety: z.string().min(1).max(1200),
    observabilityAndMaintenance: z.string().min(1).max(1200),
    budgetAndMilestones: z.string().min(1).max(1200)
}).strict();

const PreliminaryBlueprintSectionsSchema = z.object({
    operationalProfile: z.string().min(20).max(5000),
    pillar1HostingSetup: z.string().min(20).max(6000),
    pillar2AgentProgramming: z.string().min(20).max(6000),
    pillar3MonitoringMaintenance: z.string().min(20).max(6000),
    thirtyDayRolloutCadence: z.string().min(20).max(6000)
}).strict();

const AsyncRuntimeResearchSectionsSchema = z.object({
    googleCloudRuntimeTopology: z.string().min(20).max(6000),
    mcpAndPromptOptimization: z.string().min(20).max(6000),
    observabilitySafetyAndSla: z.string().min(20).max(6000),
    specialistImprovementChecklist: z.string().min(20).max(6000)
}).strict();

const sharedSchemas = createSharedAdvisorySchemas({
    sessionIdPattern: SESSION_ID_PATTERN,
    reviewIdPattern: REVIEW_ID_PATTERN,
    stripeKind: 'managed_agent_advisory',
    serviceSlug: SERVICE_SLUG,
    serviceName: SERVICE_NAME,
    serviceType: SERVICE_TYPE,
    workflow: SERVICE_WORKFLOW,
    needsSummarySchema: ManagedAgentIntakeSchema
});

function detectOpsCategory(q1Text) {
    const low = String(q1Text || '').toLowerCase();
    if (/(educat|university|rto|school|lms|training)/.test(low)) return 'Education & Institutional Ops';
    if (/(health|clinic|medical|care)/.test(low)) return 'Healthcare Operations';
    if (/(ecommerce|retail|support|crm|sales|dispatch|trade)/.test(low)) return 'Commercial & Service Ops';
    return 'Production Agent Operations';
}

function createManagedAgentService(options = {}) {
    const engine = createAdvisoryWorkflowEngine({
        logLabel: 'Managed Agent',
        studioLabel: 'Managed Agent Studio',
        adminPageUrl: '/services.html#admin-managed-agent-studio',
        sessionsCollection: SESSIONS_COLLECTION,
        reviewsCollection: REVIEWS_COLLECTION,
        defaultSessionsFile: DEFAULT_SESSIONS_FILE,
        defaultReviewsFile: DEFAULT_REVIEWS_FILE,
        sessionIdPattern: SESSION_ID_PATTERN,
        reviewIdPattern: REVIEW_ID_PATTERN,
        sessionPrefix: 'mgagent_',
        reviewPrefix: 'marev_',
        stripeKind: 'managed_agent_advisory',
        serviceSlug: SERVICE_SLUG,
        serviceName: SERVICE_NAME,
        serviceType: SERVICE_TYPE,
        workflow: SERVICE_WORKFLOW,
        priceEnvVar: 'MANAGED_AGENT_ADVISORY_PRICE_AUD_CENTS',
        defaultPriceAudCents: DEFAULT_PRICE_AUD_CENTS,
        readAudPriceFromStore: saved => saved?.prices?.[SERVICE_SLUG]?.setup?.aud,
        checkoutDescription: 'Managed AI Agent Hosting, Custom Programming & Continuous Maintenance Advisory (Strictly Advisory-Only + Architect Review)',
        returnQueryKey: 'managed_agent',
        preliminaryFilePrefix: 'PRELIMINARY_Managed_AI_Agent_Hosting_Advisory',
        finalFilePrefix: 'FINAL_REVIEWED_Managed_AI_Agent_Hosting_Advisory',
        finalBannerTitle: 'FINAL REVIEWED MANAGED AI AGENT HOSTING & MAINTENANCE PLAN',
        introWelcomeLine: 'Payment confirmed. Welcome to your strictly advisory-only Managed AI Agent Hosting & Maintenance consultation.',
        introPrivacyLine: 'Zero-Access Architectural Guarantee: We access NONE of your servers, cloud accounts, Git repositories, CRM/ERP databases, or SSH/API credentials, and accept zero file uploads. Never share keys, passwords, or PII.',
        questions: INTAKE_QUESTIONS,
        schemas: sharedSchemas,
        extractSectorOrTag: detectOpsCategory,
        async runStage1Grounding({ q1Answer, runGeminiInteraction, stripMarkdownAndHtml }) {
            const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
            const systemInstruction = 'You are an enterprise AI Agent Operations & Google Cloud Systems Architect. Perform a brief public search on reliable multi-step AI agent patterns and SLA practices relevant to the workflows described below. Reply in 2-3 concise plain-text sentences. No Markdown, no HTML, zero claims of accessing private servers.';
            const aiText = await runGeminiInteraction({
                model,
                systemInstruction,
                input: `Industry and workflow profile: ${q1Answer}`,
                useSearch: true
            });
            if (aiText) return stripMarkdownAndHtml(aiText).slice(0, 1200);
            const category = detectOpsCategory(q1Answer);
            return `${category} workloads achieve highest reliability with stateless worker containers pinned in australia-southeast1, strict Zod-enforced tool schemas, deterministic idempotency keys, and OpenTelemetry tracing for zero-downtime retries.`;
        },
        async generateStepFollowUp({ step, answer, orgName, groundingSummary, nextQuestion, questionTopic, runGeminiInteraction, stripMarkdownAndHtml }) {
            const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
            const systemInstruction = 'You are a Managed AI Agent Hosting & Maintenance advisor. Acknowledge the answer in 1-2 short plain-text sentences (strictly advisory, zero system access), output a blank line, and ask the exact next question verbatim. Plain text only.';
            const aiText = await runGeminiInteraction({
                model,
                systemInstruction,
                input: [
                    `Organization: ${orgName}`,
                    `Step ${step} (${questionTopic}): ${answer}`,
                    groundingSummary ? `Architecture Context: ${groundingSummary}` : '',
                    `Exact Next Question: ${nextQuestion.prompt}`
                ].filter(Boolean).join('\n'),
                useSearch: false
            });
            if (aiText) return stripMarkdownAndHtml(aiText).slice(0, 2200);
            const prefix = step === 1 && groundingSummary
                ? `Scoped for ${orgName}. ${groundingSummary}`
                : `Recorded for ${orgName} — incorporated into your hosting topology and maintenance cadence.`;
            return `${prefix}\n\n${nextQuestion.prompt}`;
        },
        buildNeedsSummary(orgName, categoryLabel, answers) {
            const byStep = new Map(answers.map(a => [a.step, a.answer]));
            return ManagedAgentIntakeSchema.parse({
                organizationName: orgName,
                industryAndWorkflows: `${categoryLabel}: ${(byStep.get(1) || orgName).slice(0, 900)}`,
                agentTasksAndTools: (byStep.get(2) || 'Autonomous triage, structured extraction, and human approval checkpoints.').slice(0, 1180),
                slaAndLatency: (byStep.get(3) || 'Zero-downtime failover, bounded retries, low p95 latency.').slice(0, 1180),
                hostingAndSafety: (byStep.get(4) || 'australia-southeast1 regional isolation, PII scrubbing, budget caps.').slice(0, 1180),
                observabilityAndMaintenance: (byStep.get(5) || 'OpenTelemetry spans, drift evaluation, monthly prompt/model reviews.').slice(0, 1180),
                budgetAndMilestones: (byStep.get(6) || '30-day controlled rollout and predictable token budget.').slice(0, 1180)
            });
        },
        async generatePreliminaryTxt({ session, dateStr, runGeminiInteraction, parseJsonFromModelText, stripMarkdownAndHtml }) {
            const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
            const qaSummary = session.answers.map(a => `Q${a.step} (${a.topic}): ${a.answer}`).join('\n');
            const systemInstruction = [
                'Generate the preliminary plain-text advisory blueprint for "Services - Managed AI Agent Hosting & Maintenance".',
                'STRICT ADVISORY RULE: Describe the recommended zero-downtime hosting topology, custom agent programming / MCP schemas, and continuous monitoring & maintenance cadence without claiming live access to any client servers.',
                'Return STRICT JSON ONLY with keys: operationalProfile, pillar1HostingSetup, pillar2AgentProgramming, pillar3MonitoringMaintenance, thirtyDayRolloutCadence.',
                'Plain text only inside values (no Markdown, no HTML).'
            ].join('\n');

            const raw = await runGeminiInteraction({
                model,
                systemInstruction,
                input: [
                    `Organization: ${session.clientOrganizationName} (${session.sectorOrWorkflowTag})`,
                    `Operational Context: ${session.groundingSummary}`,
                    'Scoping Q&A:',
                    qaSummary
                ].join('\n\n'),
                useSearch: false
            });

            const parsed = parseJsonFromModelText(raw, PreliminaryBlueprintSectionsSchema);
            const ns = session.needsSummary;
            const s = parsed ? {
                operationalProfile: stripMarkdownAndHtml(parsed.operationalProfile),
                pillar1HostingSetup: stripMarkdownAndHtml(parsed.pillar1HostingSetup),
                pillar2AgentProgramming: stripMarkdownAndHtml(parsed.pillar2AgentProgramming),
                pillar3MonitoringMaintenance: stripMarkdownAndHtml(parsed.pillar3MonitoringMaintenance),
                thirtyDayRolloutCadence: stripMarkdownAndHtml(parsed.thirtyDayRolloutCadence)
            } : {
                operationalProfile: [
                    `Organization: ${session.clientOrganizationName}`,
                    `Operational Focus: ${ns?.industryAndWorkflows || session.sectorOrWorkflowTag}`,
                    `Target Tasks & Tools: ${ns?.agentTasksAndTools || 'Multi-step agent workflows'}`,
                    `Reliability & Budget: ${ns?.slaAndLatency || 'High availability'} | ${ns?.budgetAndMilestones || '30-day milestone'}`
                ].join('\n'),
                pillar1HostingSetup: [
                    '- Zero-Downtime Topology: Run stateless agent orchestrators on Google Cloud Run (min-instances >= 1) pinned in australia-southeast1 with Cloud Tasks / Pub/Sub durable queues so traffic spikes or cold starts never drop workflows.',
                    '- State & Secrets Isolation: Persist durable workflow checkpoints in Firestore with partition isolation and inject runtime credentials via Google Secret Manager or Vercel encrypted env vars (never repo-committed).',
                    `- Failover Routing: Pair primary fast-tier model (${process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'}) with automatic fallback (${process.env.GEMINI_FALLBACK_MODEL || 'gemini-4-hydrogen'}) and exponential backoff.`
                ].join('\n'),
                pillar2AgentProgramming: [
                    '- Structured Orchestration: Define strict Zod / JSON Schema contracts (additionalProperties: false) on every MCP tool call and model output so invalid payloads fail closed before touching downstream systems.',
                    '- Prompt & Token Optimization: Separate stable system instructions cleanly for context caching, bound max steps/tokens per agent turn, and enforce deterministic x-idempotency-key headers on all side-effecting tool calls.',
                    '- Human Approval Gates: Pause high-impact external actions (payments, deletes, client emails) behind explicit operator sign-off.'
                ].join('\n'),
                pillar3MonitoringMaintenance: [
                    '- Safety Guardrails: Scrub incoming/outgoing API keys, tokens, and PII to [REDACTED_SECRET], enforce prompt-injection boundary checks, and cap per-tenant daily spend.',
                    `- Live Telemetry & Alerting: Emit OpenTelemetry traces per agent run measuring p95 latency, tool error rate, token cost AUD, and queue lag (${ns?.observabilityAndMaintenance || 'real-time alerts'}).`,
                    '- Continuous Maintenance Cadence: Weekly automated golden-set regression evals, monthly model benchmark upgrades, and zero-downtime canary rollouts.'
                ].join('\n'),
                thirtyDayRolloutCadence: [
                    'Week 1: Finalize workflow state machine diagrams, strict JSON tool contracts, and Secret Manager topology.',
                    'Week 2: Configure container/edge runtime in australia-southeast1 with durable retry queues and telemetry spans.',
                    'Week 3: Execute shadow/sandbox regression testing across edge cases, secret scrubbing, and failover routing.',
                    'Week 4: Launch monitored production canary with automated drift alerts and monthly maintenance SLA schedule.'
                ].join('\n')
            };

            const div = '='.repeat(68);
            const sub = '-'.repeat(68);
            return stripMarkdownAndHtml([
                div,
                'PRELIMINARY AGENT HOSTING & MAINTENANCE BLUEPRINT - QUEUED FOR SUPERADMIN ANALYSIS (24-48 HRS)',
                SERVICE_NAME.toUpperCase(),
                div,
                `Organization     : ${session.clientOrganizationName}`,
                `Workflow Scope   : ${session.sectorOrWorkflowTag}`,
                `Generated Date   : ${dateStr}`,
                `Stripe Session   : ${session.stripeSessionId}`,
                'Zero-Access Proof: Strictly architectural advisory - touches ZERO client servers, repos, or keys.',
                '',
                sub,
                'SECTION 1 - OPERATIONAL WORKFLOW & SLA PROFILE',
                sub,
                s.operationalProfile,
                '',
                sub,
                'SECTION 2 - PILLAR 1: MANAGED AI AGENT HOSTING & INFRASTRUCTURE SETUP',
                sub,
                s.pillar1HostingSetup,
                '',
                sub,
                'SECTION 3 - PILLAR 2: CUSTOM AGENT PROGRAMMING & PROMPT OPTIMIZATION',
                sub,
                s.pillar2AgentProgramming,
                '',
                sub,
                'SECTION 4 - PILLAR 3: CONTINUOUS MONITORING, SAFETY & SYSTEM MAINTENANCE',
                sub,
                s.pillar3MonitoringMaintenance,
                '',
                sub,
                'SECTION 5 - 30-DAY DEPLOYMENT & MAINTENANCE CADENCE (WEEKS 1-4)',
                sub,
                s.thirtyDayRolloutCadence,
                div
            ].join('\n'));
        },
        async generateAsyncResearch({ session, qaDigest, model, runGeminiInteraction, parseJsonFromModelText, stripMarkdownAndHtml }) {
            const systemInstruction = [
                'You are AI Foundation Principal Systems Architect performing async public Google Cloud, Vercel & AI agent runtime research.',
                'Search public documentation to verify:',
                '1) Google Cloud Run / Vertex AI Agent Engine / Vercel Fluid Compute zero-downtime topology & australia-southeast1 latency/pricing',
                '2) MCP structured tool calling, idempotency, prompt caching, and token optimization',
                '3) Continuous OpenTelemetry monitoring, drift evaluation, prompt-injection defense, and maintenance SLA cadences.',
                'Return STRICT JSON ONLY with keys: googleCloudRuntimeTopology, mcpAndPromptOptimization, observabilitySafetyAndSla, specialistImprovementChecklist.',
                'Plain text only.'
            ].join('\n');

            const raw = await runGeminiInteraction({
                model,
                systemInstruction,
                input: [
                    `Client: ${session.clientOrganizationName} (${session.sectorOrWorkflowTag})`,
                    `Context: ${session.groundingSummary}`,
                    qaDigest
                ].join('\n\n'),
                useSearch: true
            });

            const parsed = parseJsonFromModelText(raw, AsyncRuntimeResearchSectionsSchema);
            const research = parsed ? {
                googleCloudRuntimeTopology: stripMarkdownAndHtml(parsed.googleCloudRuntimeTopology),
                mcpAndPromptOptimization: stripMarkdownAndHtml(parsed.mcpAndPromptOptimization),
                observabilitySafetyAndSla: stripMarkdownAndHtml(parsed.observabilitySafetyAndSla),
                specialistImprovementChecklist: stripMarkdownAndHtml(parsed.specialistImprovementChecklist)
            } : {
                googleCloudRuntimeTopology: 'Cloud Run (australia-southeast1) with min-instances=1, Cloud Tasks durable retry queues, or Vercel Fluid Compute + Queues eliminates cold starts and provides multi-zone resilience.',
                mcpAndPromptOptimization: 'Enforce strict additionalProperties: false tool schemas, x-idempotency-key headers, explicit turn budgets, and fast-tier primary routing with fallback failover.',
                observabilitySafetyAndSla: 'Export OpenTelemetry spans covering model latency, retry depth, token spend, and automated golden-dataset regression tests prior to any model upgrade.',
                specialistImprovementChecklist: [
                    '- Calibrate concurrency limits and estimated monthly AUD token + Cloud Run bill in Section 2.',
                    '- Add explicit runbook steps for stuck queue dead-letter replay.',
                    '- Verify human-approval boundaries before approving final blueprint.'
                ].join('\n')
            };

            const div = '='.repeat(68);
            const sub = '-'.repeat(68);
            const researchSummary = stripMarkdownAndHtml([
                div,
                'ASYNC GOOGLE CLOUD AGENT RUNTIME & OBSERVABILITY RESEARCH (SUPERADMIN BRIEF)',
                div,
                `Model Used: ${model}`,
                '',
                sub,
                'CLOUD RUN / VERTEX / VERCEL ZERO-DOWNTIME TOPOLOGY',
                sub,
                research.googleCloudRuntimeTopology,
                '',
                sub,
                'MCP TOOL CONTRACTS, IDEMPOTENCY & PROMPT OPTIMIZATION',
                sub,
                research.mcpAndPromptOptimization,
                '',
                sub,
                'CONTINUOUS MONITORING, SAFETY GUARDRAILS & MAINTENANCE SLA',
                sub,
                research.observabilitySafetyAndSla,
                '',
                sub,
                'RECOMMENDED ARCHITECT REFINEMENTS BEFORE CLIENT DELIVERY',
                sub,
                research.specialistImprovementChecklist,
                div
            ].join('\n'));

            return {
                researchSummary,
                reviewSubject: `[Action Required: Analyse & Improve] Managed AI Agent Hosting - ${session.clientOrganizationName}`,
                chatSummaryLine: `Runtime Research: ${research.googleCloudRuntimeTopology.slice(0, 900)}`
            };
        }
    }, options);

    return {
        getManagedAgentPricing: engine.getPricing,
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
    ManagedAgentIntakeSchema,
    SuperadminDraftSaveSchema,
    SuperadminFinalManagedAgentSchema,
    ManagedAgentStripeMetadataSchema: sharedSchemas.StripeMetadataSchema,
    ManagedAgentCheckoutInputSchema: sharedSchemas.CheckoutInputSchema,
    ManagedAgentConfirmInputSchema: sharedSchemas.ConfirmInputSchema,
    ManagedAgentChatTurnInputSchema: sharedSchemas.ChatTurnInputSchema,
    ManagedAgentSessionSchema: sharedSchemas.SessionSchema,
    ManagedAgentReviewSchema: sharedSchemas.ReviewSchema,
    createManagedAgentService
};
