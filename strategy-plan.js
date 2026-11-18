/**
 * AI Foundation - Services: Google AI Strategy & First-Month Plan (Advisory-Only)
 *
 * Enforces:
 * - Zero external client OAuth/API connections and zero file uploads (plain-text intake only)
 * - Automatic secret/credential redaction to [REDACTED_SECRET] before AI calls or persistence
 * - Stripe AUD exclusive-GST payment gating (no webhooks: pending session verified with sessions.retrieve on return, reload or SuperAdmin verify)
 * - 6-step grounded advisory intake using @google/genai + Google Search (with offline fallback)
 * - Immediate Stage 2 Customer Preliminary Advisory .txt generation (pure UTF-8, ASCII dividers)
 * - Async Stage 3 public ecosystem research + unread SuperAdmin brief & message dispatch
 */

const fs = require('fs');
const path = require('path');
const { z } = require('zod');

const SESSIONS_COLLECTION = 'aifoundation_strategy_sessions';
const BRIEFS_COLLECTION = 'aifoundation_strategy_superadmin_briefs';
const DEFAULT_SESSIONS_FILE = path.join(__dirname, 'data', 'strategy-sessions.json');
const DEFAULT_BRIEFS_FILE = path.join(__dirname, 'data', 'strategy-superadmin-briefs.json');
const SERVICE_NAME = 'Services - Google AI Strategy & First-Month Plan';
const SERVICE_TYPE = 'google_ai_strategy_advisory_30_day';
const DEFAULT_PRICE_AUD_CENTS = 29900;
const SESSION_ID_PATTERN = /^strat_[A-Za-z0-9_-]{6,140}$/;
const BRIEF_ID_PATTERN = /^brief_[A-Za-z0-9_-]{6,140}$/;
const STRIPE_SESSION_PATTERN = /^cs_(?:test_|live_)?[A-Za-z0-9]{4,}$/;

const PARTITION_KEY = Object.freeze({
    tag: 'aifoundation',
    businessId: '#aifoundation',
    businessName: 'AI Foundation',
    source: 'aifoundation'
});

const INTAKE_QUESTIONS = Object.freeze([
    {
        step: 1,
        topic: 'Business Structure & Daily Volume',
        prompt: 'Question 1 of 6 (~5-8 mins total) - Business Structure & Daily Volume: Are you a sole trader, contractor, or growing team? Please share your business name, industry or trade, team headcount, and typical daily inquiry or job volume (plain text only — never share passwords, keys, or confidential files).'
    },
    {
        step: 2,
        topic: 'Current Software & Google Edition',
        prompt: 'Question 2 of 6 - Current Software & Google Edition: Which Google Workspace or Gmail tools (Calendar, Drive, Docs, Sheets) and external business apps (e.g., Xero, MYOB, ServiceM8, Cliniko, HubSpot) do you currently use, by name only?'
    },
    {
        step: 3,
        topic: 'Admin & Client Triage Friction',
        prompt: 'Question 3 of 6 - Admin & Client Triage Friction: Where do repetitive emails, lead qualification, quoting, or client follow-ups slow down your week the most?'
    },
    {
        step: 4,
        topic: 'Scheduling & Dispatch Friction',
        prompt: 'Question 4 of 6 - Scheduling & Dispatch Friction: What causes your biggest bottlenecks with booking coordination, calendar conflicts, reminders, or team/contractor handoffs?'
    },
    {
        step: 5,
        topic: 'Document Processing Friction',
        prompt: 'Question 5 of 6 - Document Processing Friction: Which manual document tasks (invoices, receipts, PDFs, intake forms, proposals, or compliance checklists) consume the most time?'
    },
    {
        step: 6,
        topic: 'Privacy Needs & Day-30 Priorities',
        prompt: 'Question 6 of 6 (Final Question) - Privacy Needs & Day-30 Priorities: What client privacy or data-isolation rules matter most to you, and what are your top 3 outcomes you want achieved within Day 30?'
    }
]);

// --- Strict Zod Schemas (additionalProperties: false) ---

const StrategyStripeMetadataSchema = z.object({
    tag: z.literal('aifoundation'),
    businessId: z.literal('#aifoundation'),
    businessName: z.literal('AI Foundation'),
    source: z.literal('aifoundation'),
    kind: z.literal('strategy_plan'),
    uid: z.string().min(1).max(128),
    userId: z.string().min(1).max(128),
    serviceName: z.literal(SERVICE_NAME),
    serviceType: z.literal(SERVICE_TYPE)
}).strict();

const StrategyCheckoutInputSchema = z.object({
    returnPath: z.string().max(256).optional()
}).strict();

const StrategyConfirmInputSchema = z.object({
    sessionId: z.string().trim().regex(STRIPE_SESSION_PATTERN, 'Invalid Stripe session ID.')
}).strict();

const StrategyChatTurnInputSchema = z.object({
    sessionId: z.string().trim().regex(SESSION_ID_PATTERN, 'Invalid strategy session ID.'),
    message: z.string().trim().min(1, 'Please enter a response before sending.').max(3000, 'Please keep each answer under 3,000 characters.')
}).strict();

const StrategyIntakeAnswerSchema = z.object({
    step: z.number().int().min(1).max(6),
    topic: z.string().min(1).max(120),
    question: z.string().min(1).max(600),
    answer: z.string().min(1).max(3000),
    hadSecrets: z.boolean(),
    answeredAt: z.string().min(1)
}).strict();

const StrategyChatMessageSchema = z.object({
    role: z.enum(['assistant', 'user']),
    step: z.number().int().min(0).max(6),
    content: z.string().min(1).max(8000),
    createdAt: z.string().min(1)
}).strict();

const StrategyDeliverableFileSchema = z.object({
    fileName: z.string().min(1).max(200),
    generatedAt: z.string().min(1),
    content: z.string().min(1).max(60000)
}).strict();

const StrategySessionSchema = z.object({
    id: z.string().regex(SESSION_ID_PATTERN),
    tag: z.literal('aifoundation'),
    businessId: z.enum(['#aifoundation', 'aifoundation']),
    businessName: z.literal('AI Foundation'),
    source: z.literal('aifoundation'),
    uid: z.string().min(1).max(128),
    userEmail: z.string().max(254),
    userName: z.string().max(200),
    stripeSessionId: z.string().min(1).max(200),
    paymentStatus: z.enum(['pending', 'paid', 'failed']),
    amountPaidExGstAud: z.number().min(0),
    currency: z.literal('AUD'),
    status: z.enum(['pending_payment', 'intake', 'completed']),
    currentStep: z.number().int().min(0).max(6),
    totalSteps: z.literal(6),
    clientBusinessName: z.string().max(120),
    nicheGroundingSummary: z.string().max(4000),
    answers: z.array(StrategyIntakeAnswerSchema).max(6),
    messages: z.array(StrategyChatMessageSchema).max(30),
    preliminaryReport: StrategyDeliverableFileSchema.nullable(),
    superadminBriefId: z.string().nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1)
}).strict();

const SuperAdminBriefSchema = z.object({
    id: z.string().regex(BRIEF_ID_PATTERN),
    tag: z.literal('aifoundation'),
    businessId: z.enum(['#aifoundation', 'aifoundation']),
    businessName: z.literal('AI Foundation'),
    source: z.literal('aifoundation'),
    strategySessionId: z.string().regex(SESSION_ID_PATTERN),
    stripeSessionId: z.string().min(1).max(200),
    uid: z.string().min(1).max(128),
    clientEmail: z.string().max(254),
    clientBusinessName: z.string().min(1).max(120),
    amountPaidExGstAud: z.number().min(0),
    fileName: z.string().min(1).max(200),
    summary: z.string().min(1).max(4000),
    content: z.string().min(1).max(80000),
    read: z.boolean(),
    modelUsed: z.string().min(1).max(120),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1)
}).strict();

const Stage2AdvisoryOutputSchema = z.object({
    executiveSummary: z.string().min(10).max(2500),
    weeklyHoursRecoverable: z.string().min(2).max(300),
    bottleneckAssessment: z.string().min(10).max(3000),
    pillar1Roadmap: z.string().min(10).max(4500),
    pillar2Connectors: z.string().min(10).max(3500),
    pillar3Security: z.string().min(10).max(3000),
    customerCommitments: z.string().min(10).max(2000)
}).strict();

const Stage3ResearchOutputSchema = z.object({
    publicDocsFindings: z.string().min(10).max(6000),
    selfServiceActions: z.string().min(10).max(4500),
    optionalEngineeringItems: z.string().min(10).max(4500),
    estimatedMonthlyAudCost: z.string().min(4).max(1500),
    privacyAndRisks: z.string().min(10).max(3000)
}).strict();

const SECRET_PATTERNS = [
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi,
    /\bAIza[0-9A-Za-z_-]{20,}\b/g,
    /\b(?:sk|rk|pk)_(?:live|test)_[0-9A-Za-z]{16,}\b/g,
    /\bsk-[A-Za-z0-9_-]{16,}\b/g,
    /\bwhsec_[0-9A-Za-z]{16,}\b/g,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/g,
    /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
];

const LABELED_SECRET_REGEX = /((?:password|passwd|pwd|api[_-]?key|secret[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|private[_-]?key)\s*[:=]\s*['"]?)([^\s'",;]{4,})(['"]?)/gi;

function redactSecrets(input) {
    let text = String(input || '');
    let hadSecrets = false;

    for (const pattern of SECRET_PATTERNS) {
        text = text.replace(pattern, () => {
            hadSecrets = true;
            return '[REDACTED_SECRET]';
        });
    }

    text = text.replace(LABELED_SECRET_REGEX, (_full, prefix, _secret, suffix) => {
        hadSecrets = true;
        return `${prefix}[REDACTED_SECRET]${suffix}`;
    });

    return {
        scrubbedText: text.trim(),
        hadSecrets
    };
}

function stripMarkdownAndHtml(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, '')
        .replace(/```[a-zA-Z0-9_-]*\n?/g, '')
        .replace(/```/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function sanitizeBusinessSlug(rawName) {
    const cleaned = String(rawName || '')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
    return cleaned || 'Client_Business';
}

function inferBusinessNameFromQ1(answerText, fallbackUserName = '') {
    const clean = String(answerText || '').trim();
    const explicitMatch = clean.match(/(?:business(?:\s+name)?|company|firm|called|named)\s*(?:is|:|-)\s*([A-Za-z0-9][A-Za-z0-9 &'.,-]{1,50})/i);
    if (explicitMatch && explicitMatch[1]) {
        return explicitMatch[1].split(/[.,;\n]/)[0].trim().slice(0, 60);
    }
    const firstClause = clean.split(/[.;\n]/)[0].trim();
    if (firstClause && firstClause.length <= 50 && !/\[REDACTED_SECRET\]/.test(firstClause)) {
        return firstClause;
    }
    return fallbackUserName ? String(fallbackUserName).trim().slice(0, 60) : 'Client Business';
}

function formatUtcDate(dateObj) {
    return dateObj.toISOString().slice(0, 10);
}

function createHttpError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

function createStrategyPlanService(options = {}) {
    const firebase = options.firebase || require('./firebase-service');
    const getStripe = options.getStripe || (() => null);
    const getServicePrices = options.getServicePrices || (async () => ({ prices: {} }));
    const sessionsFilePath = options.sessionsFilePath || DEFAULT_SESSIONS_FILE;
    const briefsFilePath = options.briefsFilePath || DEFAULT_BRIEFS_FILE;
    const now = options.now || (() => new Date());
    const pendingResearchTasks = new Set();

    let cachedGenAi = options.aiClient || null;

    async function getAiClient() {
        if (cachedGenAi) return cachedGenAi;
        if (process.env.AI_SKILLS_ENABLED === 'false') return null;
        const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
        if (!apiKey) return null;
        try {
            const { GoogleGenAI } = await import('@google/genai');
            cachedGenAi = new GoogleGenAI({ apiKey });
            return cachedGenAi;
        } catch (e) {
            console.warn('[Strategy Plan] Could not initialize @google/genai:', e.message);
            return null;
        }
    }

    function readJsonMap(filePath) {
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }

    function writeJsonMap(filePath, map) {
        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify(map, null, 2));
        } catch (e) {
            console.warn(`[Strategy Plan] Could not write local copy ${filePath}:`, e.message);
        }
    }

    async function saveSession(session) {
        const validated = StrategySessionSchema.parse(session);
        const map = readJsonMap(sessionsFilePath);
        map[validated.id] = validated;
        writeJsonMap(sessionsFilePath, map);
        try {
            await firebase.writeDocument(SESSIONS_COLLECTION, validated.id, validated, true);
        } catch (e) {
            console.warn('[Strategy Plan] Firestore session save fallback:', e.message);
        }
        return validated;
    }

    async function getSessionById(sessionId) {
        if (!SESSION_ID_PATTERN.test(String(sessionId || ''))) return null;
        let doc = null;
        try {
            doc = await firebase.getDocument(SESSIONS_COLLECTION, sessionId);
        } catch {
            doc = null;
        }
        if (doc && doc.id) {
            const parsed = StrategySessionSchema.safeParse(doc);
            if (parsed.success) return parsed.data;
        }
        const map = readJsonMap(sessionsFilePath);
        const local = map[sessionId];
        if (!local) return null;
        const parsed = StrategySessionSchema.safeParse(local);
        return parsed.success ? parsed.data : null;
    }

    async function listSessionsForUser(uid) {
        const byId = new Map();
        const localMap = readJsonMap(sessionsFilePath);
        for (const item of Object.values(localMap)) {
            if (item && item.uid === uid) {
                const parsed = StrategySessionSchema.safeParse(item);
                if (parsed.success) byId.set(parsed.data.id, parsed.data);
            }
        }
        try {
            const docs = await firebase.listDocuments(SESSIONS_COLLECTION);
            if (Array.isArray(docs)) {
                for (const d of docs) {
                    if (d.fields && d.fields.uid === uid) {
                        const parsed = StrategySessionSchema.safeParse(d.fields);
                        if (parsed.success) byId.set(parsed.data.id, parsed.data);
                    }
                }
            }
        } catch (e) {
            console.warn('[Strategy Plan] Firestore session list note:', e.message);
        }
        return [...byId.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    async function saveBrief(brief) {
        const validated = SuperAdminBriefSchema.parse(brief);
        const map = readJsonMap(briefsFilePath);
        map[validated.id] = validated;
        writeJsonMap(briefsFilePath, map);
        try {
            await firebase.writeDocument(BRIEFS_COLLECTION, validated.id, validated, true);
        } catch (e) {
            console.warn('[Strategy Plan] Firestore brief save fallback:', e.message);
        }
        return validated;
    }

    async function getBriefById(briefId) {
        if (!BRIEF_ID_PATTERN.test(String(briefId || ''))) return null;
        try {
            const doc = await firebase.getDocument(BRIEFS_COLLECTION, briefId);
            const parsed = SuperAdminBriefSchema.safeParse(doc);
            if (parsed.success) return parsed.data;
        } catch {
            // Fall through to local copy
        }
        const local = readJsonMap(briefsFilePath)[briefId];
        const parsed = SuperAdminBriefSchema.safeParse(local);
        return parsed.success ? parsed.data : null;
    }

    async function listSuperAdminBriefs() {
        const byId = new Map();
        const localMap = readJsonMap(briefsFilePath);
        for (const item of Object.values(localMap)) {
            const parsed = SuperAdminBriefSchema.safeParse(item);
            if (parsed.success) byId.set(parsed.data.id, parsed.data);
        }
        try {
            const docs = await firebase.listDocuments(BRIEFS_COLLECTION);
            if (Array.isArray(docs)) {
                for (const d of docs) {
                    const parsed = SuperAdminBriefSchema.safeParse(d.fields);
                    if (parsed.success) byId.set(parsed.data.id, parsed.data);
                }
            }
        } catch (e) {
            console.warn('[Strategy Plan] Firestore brief list note:', e.message);
        }
        const briefs = [...byId.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const unreadCount = briefs.filter(b => !b.read).length;
        return { briefs, unreadCount };
    }

    async function markBriefRead(briefId) {
        const brief = await getBriefById(briefId);
        if (!brief) throw createHttpError('Advisory brief not found.', 404);
        if (brief.read) return brief;
        return saveBrief({
            ...brief,
            read: true,
            updatedAt: now().toISOString()
        });
    }

    async function deleteSuperAdminBrief(briefId, { confirmed = false } = {}) {
        if (!BRIEF_ID_PATTERN.test(String(briefId || ''))) {
            throw createHttpError('Invalid advisory brief ID.', 400);
        }
        if (confirmed !== true) {
            throw createHttpError('Please confirm deletion before removing this advisory brief.', 400);
        }
        const existing = await getBriefById(briefId);
        if (!existing) {
            throw createHttpError('Advisory brief not found.', 404);
        }
        const map = readJsonMap(briefsFilePath);
        delete map[briefId];
        writeJsonMap(briefsFilePath, map);
        try {
            await firebase.deleteDocument(BRIEFS_COLLECTION, briefId);
        } catch (e) {
            console.warn('[Strategy Plan] Firestore brief delete note:', e.message);
        }
        return { success: true, id: briefId };
    }

    async function getStrategyPlanPricing() {
        let exGstCents = Number(process.env.STRATEGY_PLAN_PRICE_AUD_CENTS) || DEFAULT_PRICE_AUD_CENTS;
        try {
            const saved = await getServicePrices();
            const audAmount = saved?.prices?.['30-day-roadmap']?.price?.aud;
            if (typeof audAmount === 'number' && Number.isFinite(audAmount) && audAmount > 0) {
                exGstCents = Math.round(audAmount * 100);
            }
        } catch {
            // Keep env/default fallback
        }
        if (!Number.isInteger(exGstCents) || exGstCents < 100) {
            exGstCents = DEFAULT_PRICE_AUD_CENTS;
        }
        const gstCents = Math.round(exGstCents * 0.10);
        return {
            exGstCents,
            exGstAud: exGstCents / 100,
            gstAud: gstCents / 100,
            totalIncGstAud: (exGstCents + gstCents) / 100,
            currency: 'AUD'
        };
    }

    async function runGeminiInteraction({ model, systemInstruction, input, useSearch = true }) {
        const client = await getAiClient();
        if (!client || !client.interactions || typeof client.interactions.create !== 'function') {
            return null;
        }
        try {
            const payload = {
                model,
                input,
                system_instruction: systemInstruction
            };
            if (useSearch) {
                payload.tools = [{ type: 'google_search' }];
            }
            const interaction = await client.interactions.create(payload);
            const text = typeof interaction?.output_text === 'string' ? interaction.output_text.trim() : '';
            return text || null;
        } catch (e) {
            console.warn(`[Strategy Plan] Gemini call (${model}) fell back:`, e.message);
            return null;
        }
    }

    function parseJsonFromModelText(rawText, schema) {
        if (!rawText) return null;
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            const checked = schema.safeParse(parsed);
            return checked.success ? checked.data : null;
        } catch {
            return null;
        }
    }

    async function createCheckoutSession({ user, origin, returnPath = '/' }) {
        StrategyCheckoutInputSchema.parse({ returnPath });
        const stripe = getStripe();
        if (!stripe) {
            throw createHttpError('Card payments are not configured yet. Please try again later.', 503);
        }

        const safeReturnPath = typeof returnPath === 'string' && /^\/(?!\/)[A-Za-z0-9._~\-/]*$/.test(returnPath)
            ? returnPath
            : '/';

        const pricing = await getStrategyPlanPricing();
        const metadata = StrategyStripeMetadataSchema.parse({
            ...PARTITION_KEY,
            kind: 'strategy_plan',
            uid: user.uid,
            userId: user.uid,
            serviceName: SERVICE_NAME,
            serviceType: SERVICE_TYPE
        });

        const stripeSession = await stripe.checkout.sessions.create({
            mode: 'payment',
            currency: 'aud',
            automatic_tax: { enabled: true },
            customer_creation: 'always',
            invoice_creation: { enabled: true },
            line_items: [{
                quantity: 1,
                price_data: {
                    currency: 'aud',
                    tax_behavior: 'exclusive',
                    unit_amount: pricing.exGstCents,
                    product_data: {
                        name: SERVICE_NAME,
                        description: '30-Day Google AI Strategy & First-Month Advisory Blueprint (Strictly Advisory-Only)'
                    }
                }
            }],
            customer_email: user.email || undefined,
            client_reference_id: user.uid,
            metadata,
            payment_intent_data: { metadata },
            success_url: `${origin}${safeReturnPath}?strategy_plan=success&session_id={CHECKOUT_SESSION_ID}#services2`,
            cancel_url: `${origin}${safeReturnPath}?strategy_plan=cancelled#services2`
        });

        const timestamp = now().toISOString();
        const sessionId = `strat_${stripeSession.id}`;
        await saveSession({
            id: sessionId,
            ...PARTITION_KEY,
            uid: user.uid,
            userEmail: user.email || '',
            userName: user.name || '',
            stripeSessionId: stripeSession.id,
            paymentStatus: 'pending',
            amountPaidExGstAud: pricing.exGstAud,
            currency: 'AUD',
            status: 'pending_payment',
            currentStep: 0,
            totalSteps: 6,
            clientBusinessName: '',
            nicheGroundingSummary: '',
            answers: [],
            messages: [],
            preliminaryReport: null,
            superadminBriefId: null,
            createdAt: timestamp,
            updatedAt: timestamp
        });

        try {
            await firebase.recordTransaction({
                transactionId: stripeSession.id,
                amount: pricing.exGstAud,
                currency: 'aud',
                paymentMethod: 'stripe',
                paymentType: SERVICE_TYPE,
                status: 'initiated',
                description: `${SERVICE_NAME} (AUD $${pricing.exGstAud.toFixed(2)} ex GST)`,
                originUrl: `${origin}${safeReturnPath}`,
                customerEmail: user.email || '',
                customerName: user.name || '',
                metadata: { userId: user.uid, serviceType: SERVICE_TYPE }
            });
        } catch (fbErr) {
            console.warn('[Strategy Plan] Transaction log note:', fbErr.message);
        }

        return { url: stripeSession.url, sessionId, stripeSessionId: stripeSession.id, pricing };
    }

    async function unlockPaidCheckout(stripeSession) {
        if (!stripeSession || stripeSession.metadata?.kind !== 'strategy_plan') {
            return null;
        }
        if (stripeSession.payment_status !== 'paid') {
            return null;
        }

        const sessionId = `strat_${stripeSession.id}`;
        const existing = await getSessionById(sessionId);
        if (existing && existing.paymentStatus === 'paid') {
            return existing;
        }

        const timestamp = now().toISOString();
        const uid = existing?.uid || stripeSession.metadata?.uid || stripeSession.metadata?.userId || stripeSession.client_reference_id;
        if (!uid) {
            throw createHttpError('Checkout session is missing user identity.', 400);
        }

        const amountExGstAud = existing?.amountPaidExGstAud || ((stripeSession.amount_subtotal || stripeSession.amount_total || DEFAULT_PRICE_AUD_CENTS) / 100);
        const introMessage = {
            role: 'assistant',
            step: 1,
            createdAt: timestamp,
            content: [
                'Payment confirmed. Welcome to your strictly advisory-only Google AI Strategy & First-Month Plan consultation.',
                'Important Privacy Guarantee: This service accesses NONE of your Google Workspace, Gmail, Drive, Cloud, or accounting accounts, and accepts no file uploads. Please never paste passwords, API keys, or confidential secrets.',
                '',
                INTAKE_QUESTIONS[0].prompt
            ].join('\n')
        };

        const unlocked = await saveSession({
            id: sessionId,
            ...PARTITION_KEY,
            uid,
            userEmail: existing?.userEmail || stripeSession.customer_email || '',
            userName: existing?.userName || '',
            stripeSessionId: stripeSession.id,
            paymentStatus: 'paid',
            amountPaidExGstAud: amountExGstAud,
            currency: 'AUD',
            status: 'intake',
            currentStep: 1,
            totalSteps: 6,
            clientBusinessName: existing?.clientBusinessName || '',
            nicheGroundingSummary: existing?.nicheGroundingSummary || '',
            answers: existing?.answers || [],
            messages: existing?.messages?.length ? existing.messages : [introMessage],
            preliminaryReport: existing?.preliminaryReport || null,
            superadminBriefId: existing?.superadminBriefId || null,
            createdAt: existing?.createdAt || timestamp,
            updatedAt: timestamp
        });

        try {
            await firebase.updateTransactionStatus(stripeSession.id, 'succeeded', {
                paymentMethod: 'stripe',
                amount: (stripeSession.amount_total || Math.round(amountExGstAud * 100)) / 100,
                userId: uid
            });
        } catch (e) {
            console.warn('[Strategy Plan] Transaction status update note:', e.message);
        }

        return unlocked;
    }

    async function confirmCheckoutSession({ uid, sessionId }) {
        const parsed = StrategyConfirmInputSchema.safeParse({ sessionId });
        if (!parsed.success) {
            throw createHttpError(parsed.error.issues[0]?.message || 'Invalid sessionId.', 400);
        }
        const stripe = getStripe();
        if (!stripe) {
            throw createHttpError('Card payments are not configured yet.', 503);
        }
        let stripeSession;
        try {
            stripeSession = await stripe.checkout.sessions.retrieve(parsed.data.sessionId);
        } catch {
            throw createHttpError('Checkout session not found.', 404);
        }
        if (!stripeSession || stripeSession.metadata?.kind !== 'strategy_plan' || stripeSession.metadata?.uid !== uid) {
            throw createHttpError('Checkout session not found for this account.', 404);
        }
        if (stripeSession.payment_status !== 'paid') {
            const existing = await getSessionById(`strat_${stripeSession.id}`);
            return existing;
        }
        return unlockPaidCheckout(stripeSession);
    }

    // Settle a Checkout Session already fetched with stripe.checkout.sessions.retrieve() (SuperAdmin's Verify pending
    // payments; there are no Stripe webhooks). Unlocks it when paid, and running it again changes nothing.
    // status: 'paid', 'pending' (not paid yet) or 'expired' (never will be). { handled: false } when it isn't this service's
    async function settleCheckoutSession(session) {
        if (!session || session.metadata?.kind !== 'strategy_plan') {
            return { handled: false };
        }
        if (session.payment_status !== 'paid') {
            return { handled: true, status: session.status === 'expired' ? 'expired' : 'pending', sessionId: null };
        }
        const unlocked = await unlockPaidCheckout(session);
        return { handled: true, status: 'paid', sessionId: unlocked?.id || null };
    }

    async function getLatestUserSession(uid) {
        const sessions = await listSessionsForUser(uid);
        if (!sessions.length) return null;
        const latest = sessions[0];
        if (latest.paymentStatus === 'pending') {
            const stripe = getStripe();
            if (stripe) {
                try {
                    const stripeSession = await stripe.checkout.sessions.retrieve(latest.stripeSessionId);
                    if (stripeSession?.payment_status === 'paid') {
                        return await unlockPaidCheckout(stripeSession);
                    }
                } catch {
                    // Ignore transient Stripe lookup errors
                }
            }
        }
        return latest;
    }

    async function runStage1NicheSearch(q1Answer) {
        const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
        const systemInstruction = 'You are an Australian Google Workspace & AI advisory architect. Run a brief public web search on industry workflows and bottlenecks for the user business profile below. Provide strictly 2-3 plain-text sentences summarizing standard admin, triage, scheduling, and document workflows in that niche. No Markdown, no HTML, and do not claim access to any private user data.';
        const aiText = await runGeminiInteraction({
            model,
            systemInstruction,
            input: `Business structure & volume: ${q1Answer}`,
            useSearch: true
        });
        if (aiText) {
            return stripMarkdownAndHtml(aiText).slice(0, 1200);
        }
        return 'Industry grounding indicates common administrative recovery gains across enquiry triage in Gmail, calendar dispatch automation, and structured quote/invoice document extraction using Google Workspace Gemini and isolated Google Cloud workflows.';
    }

    async function generateStage2Sections(session) {
        const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
        const answersDigest = session.answers
            .map(a => `Q${a.step} (${a.topic}): ${a.answer}`)
            .join('\n');

        const systemInstruction = [
            'You are Lead AI Architect at AI Foundation Australia.',
            'Generate a strictly ADVISORY-ONLY 30-day roadmap JSON object matching the exact keys requested.',
            'CRITICAL RULES:',
            '1. Zero Markdown symbols (no **, no ###, no backticks) and zero HTML tags.',
            '2. Never imply you accessed any client Gmail, Drive, Workspace, GCP, or accounting account.',
            '3. Output ONLY valid JSON with keys: executiveSummary, weeklyHoursRecoverable, bottleneckAssessment, pillar1Roadmap, pillar2Connectors, pillar3Security, customerCommitments.'
        ].join('\n');

        const raw = await runGeminiInteraction({
            model,
            systemInstruction,
            input: `Business: ${session.clientBusinessName}\nPublic Industry Grounding: ${session.nicheGroundingSummary}\n\nClient Intake Answers:\n${answersDigest}`,
            useSearch: false
        });

        const parsed = parseJsonFromModelText(raw, Stage2AdvisoryOutputSchema);
        if (parsed) {
            return {
                executiveSummary: stripMarkdownAndHtml(parsed.executiveSummary),
                weeklyHoursRecoverable: stripMarkdownAndHtml(parsed.weeklyHoursRecoverable),
                bottleneckAssessment: stripMarkdownAndHtml(parsed.bottleneckAssessment),
                pillar1Roadmap: stripMarkdownAndHtml(parsed.pillar1Roadmap),
                pillar2Connectors: stripMarkdownAndHtml(parsed.pillar2Connectors),
                pillar3Security: stripMarkdownAndHtml(parsed.pillar3Security),
                customerCommitments: stripMarkdownAndHtml(parsed.customerCommitments)
            };
        }

        const q = step => session.answers.find(a => a.step === step)?.answer || 'Not specified';
        return {
            executiveSummary: `This independent 30-day advisory blueprint is tailored for ${session.clientBusinessName} (${q(1)}). Based on your stated tools (${q(2)}) and Day-30 priorities (${q(6)}), transitioning repetitive intake, scheduling, and document admin onto Google Workspace + Gemini workflows can eliminate manual double-handling without granting external consultants live access to your accounts.`,
            weeklyHoursRecoverable: '6 to 12 hours per week across enquiry triage, calendar coordination, and document preparation.',
            bottleneckAssessment: [
                `- Admin & Client Triage: ${q(3)}`,
                `- Scheduling & Dispatch: ${q(4)}`,
                `- Document Processing: ${q(5)}`,
                `- Privacy & Day-30 Priorities: ${q(6)}`
            ].join('\n'),
            pillar1Roadmap: [
                'Days 1-7 (Foundation & Privacy Guardrails): Audit email/enquiry categories, create standardized prompt templates in Google Docs, and enable Workspace Gemini business data-isolation settings.',
                'Days 8-14 (Triage & Drafting): Deploy Gmail draft-assist templates and structured intake forms using Google Forms -> Google Sheets for consistent lead capture.',
                'Days 15-21 (Scheduling & Dispatch): Standardize Google Calendar booking windows, automated SMS/email reminder templates, and contractor handoff checklists.',
                'Days 22-30 (Document Workflows & Review): Roll out Gemini-assisted quote/checklist generation in Google Docs and review weekly hours saved before expanding.'
            ].join('\n'),
            pillar2Connectors: [
                `Recommended advisory architecture connecting your named tools (${q(2)}) via approved API/webhook bridges:`,
                '- Gmail / Google Forms -> Structured Google Sheets lead tracker (advisory trigger: new enquiry).',
                '- Google Calendar <-> Booking/Job status notifications (two-way schedule visibility without manual copying).',
                '- Google Drive structured client folders -> Draft quote/invoice prep reminders synced to your accounting workflow.',
                'Note: No live connectors were configured during this consultation; implement internally or request a separate scoped engineering engagement.'
            ].join('\n'),
            pillar3Security: [
                '- Ensure commercial Google Workspace plan settings disable training public foundation models on your Workspace content.',
                '- Enforce 2-Step Verification (2SV) and role-based Shared Drive permissions for staff and contractors.',
                '- If deploying custom Gemini API automations, host inside a dedicated Google Cloud project in australia-southeast1 (Sydney) with Secret Manager and least-privilege IAM.',
                '- Apply Australian Privacy Act (APP 11) data minimization by redacting client secrets and sensitive IDs from automated prompts.'
            ].join('\n'),
            customerCommitments: 'Estimated Customer Effort: ~2 to 4 hours per week over Weeks 1-4 for self-paced configuration, team onboarding, and template testing. Lead Architect Review: An AI Foundation Lead Architect will review this preliminary brief within 24 to 48 business hours and follow up with tailored next steps.'
        };
    }

    function buildPreliminaryCustomerTxt(session, sections) {
        const dateStr = formatUtcDate(now());
        const fileName = `Preliminary_Google_AI_Strategy_30_Day_Advisory_${sanitizeBusinessSlug(session.clientBusinessName)}_${dateStr}.txt`;
        const div = '='.repeat(60);
        const sub = '-'.repeat(60);

        const content = [
            div,
            'AI FOUNDATION AUSTRALIA',
            'PRELIMINARY 30-DAY GOOGLE AI STRATEGY ADVISORY REPORT',
            div,
            `Client Business : ${session.clientBusinessName}`,
            `Session ID      : ${session.id}`,
            `Generated Date  : ${dateStr} (UTC)`,
            '',
            sub,
            'INDEPENDENT ADVISORY & ZERO-ACCESS DISCLAIMER',
            sub,
            'This report is an independent strategic advisory plan generated solely from',
            'the plain-text information you provided during this consultation.',
            'AI Foundation Australia accessed NONE of your Google Workspace accounts,',
            'Gmail, Drive, Cloud projects, accounting software, or external files, and',
            'made zero changes to any of your systems.',
            '',
            div,
            '1. EXECUTIVE SUMMARY & WEEKLY ADMIN HOURS RECOVERABLE',
            div,
            sections.executiveSummary,
            '',
            `Estimated Weekly Admin Hours Recoverable: ${sections.weeklyHoursRecoverable}`,
            '',
            div,
            '2. BOTTLENECK ASSESSMENT',
            div,
            sections.bottleneckAssessment,
            '',
            div,
            '3. PILLAR 1 ADVISORY: FIRST-MONTH IMPLEMENTATION & GEMINI ROADMAP',
            div,
            sections.pillar1Roadmap,
            '',
            div,
            '4. PILLAR 2 ADVISORY: RECOMMENDED WORKSPACE & CONNECTOR BLUEPRINT',
            div,
            sections.pillar2Connectors,
            '',
            div,
            '5. PILLAR 3 ADVISORY: GOOGLE CLOUD & PRIVATE WORKSPACE SECURITY',
            div,
            sections.pillar3Security,
            '',
            div,
            '6. CUSTOMER COMMITMENTS & 24-48H LEAD ARCHITECT REVIEW NOTICE',
            div,
            sections.customerCommitments,
            div
        ].join('\n');

        return {
            fileName,
            generatedAt: now().toISOString(),
            content: stripMarkdownAndHtml(content)
        };
    }

    async function runStage3SuperAdminResearch(session) {
        const model = process.env.GEMINI_FALLBACK_MODEL || 'gemini-4-hydrogen';
        const answersDigest = session.answers
            .map(a => `Q${a.step} (${a.topic}): ${a.answer}`)
            .join('\n');

        const systemInstruction = [
            'You are a Principal Google Cloud & Workspace Solutions Architect preparing an internal technical brief for the AI Foundation SuperAdmin.',
            'Use public Google Search ONLY to verify current public documentation, quotas, and pricing across Google Firebase, Google Cloud Console, GCP australia-southeast1, Google AI Studio, Gemini API, and Google Workspace APIs / Apps Script.',
            'Zero Markdown, zero HTML. Return ONLY valid JSON with keys: publicDocsFindings, selfServiceActions, optionalEngineeringItems, estimatedMonthlyAudCost, privacyAndRisks.'
        ].join('\n');

        const raw = await runGeminiInteraction({
            model,
            systemInstruction,
            input: `Client Business: ${session.clientBusinessName}\nStripe Session: ${session.stripeSessionId}\nFee Paid: AUD $${session.amountPaidExGstAud.toFixed(2)} ex GST\n\nIntake Answers:\n${answersDigest}`,
            useSearch: true
        });

        const parsed = parseJsonFromModelText(raw, Stage3ResearchOutputSchema);
        const research = parsed ? {
            publicDocsFindings: stripMarkdownAndHtml(parsed.publicDocsFindings),
            selfServiceActions: stripMarkdownAndHtml(parsed.selfServiceActions),
            optionalEngineeringItems: stripMarkdownAndHtml(parsed.optionalEngineeringItems),
            estimatedMonthlyAudCost: stripMarkdownAndHtml(parsed.estimatedMonthlyAudCost),
            privacyAndRisks: stripMarkdownAndHtml(parsed.privacyAndRisks)
        } : {
            publicDocsFindings: [
                '- Google Workspace & Apps Script: Public Docs confirm Gmail, Calendar, Drive, and Sheets can be orchestrated with zero external OAuth exposure via Workspace Add-ons / internal Apps Script bound to client Workspace accounts.',
                '- Google AI Studio & Gemini API: Public pricing tiers favor gemini-3.5-flash-lite for high-frequency triage/extraction and gemini-4-hydrogen for complex synthesis, with paid API tiers guaranteeing prompts/responses do not train public models.',
                '- Google Cloud Platform (australia-southeast1 Sydney) & Firebase: Supports regional Cloud Run / Cloud Functions and Firestore in Sydney with Secret Manager and IAM service account isolation.'
            ].join('\n'),
            selfServiceActions: [
                '- Client enables Workspace Gemini data-privacy controls and 2-Step Verification internally.',
                '- Client organizes Shared Drive template folders and standardizes Google Forms intake.'
            ].join('\n'),
            optionalEngineeringItems: [
                '- Optional Scoped Build Quote: Custom Cloud Run webhook middleware in australia-southeast1 connecting third-party software (e.g. accounting/job management) to Google Workspace.',
                '- Optional Scoped Build Quote: Dedicated Gemini API document parser with structured JSON output into Google Sheets.'
            ].join('\n'),
            estimatedMonthlyAudCost: 'Estimated ongoing Google API / Cloud operational cost: AUD $15 to AUD $65/month for typical SME volume (Gemini API Flash-Lite tokens + Cloud Run/Firestore minimal tier), plus client Google Workspace licence.',
            privacyAndRisks: 'Maintain strict zero-access advisory posture unless client signs a separate implementation engagement. Ensure APP 11 compliance and data residency in australia-southeast1 for any custom GCP deployment.'
        };

        const dateStr = formatUtcDate(now());
        const fileName = `SUPERADMIN_30_Day_Advisory_Recommendation_${sanitizeBusinessSlug(session.clientBusinessName)}_${dateStr}.txt`;
        const div = '='.repeat(60);
        const sub = '-'.repeat(60);

        const content = stripMarkdownAndHtml([
            div,
            'AI FOUNDATION - INTERNAL SUPERADMIN TECHNICAL BRIEF',
            'SERVICES: GOOGLE AI STRATEGY & FIRST-MONTH PLAN',
            div,
            `Client Business   : ${session.clientBusinessName}`,
            `Client Email      : ${session.userEmail || 'N/A'}`,
            `Client UID        : ${session.uid}`,
            `Strategy Session  : ${session.id}`,
            `Stripe Session ID : ${session.stripeSessionId}`,
            `Amount Paid       : AUD $${session.amountPaidExGstAud.toFixed(2)} ex GST`,
            `Model Used        : ${model}`,
            `Generated Date    : ${dateStr} (UTC)`,
            '',
            sub,
            '1. CLIENT INTAKE ANSWERS (SECRET-SCRUBBED)',
            sub,
            answersDigest,
            '',
            sub,
            '2. PUBLIC DOCUMENTATION RESEARCH (FIREBASE / GCP / AI STUDIO / WORKSPACE)',
            sub,
            research.publicDocsFindings,
            '',
            sub,
            '3. SELF-SERVICE WORKSPACE SETTINGS (CLIENT CAN DO DIRECTLY)',
            sub,
            research.selfServiceActions,
            '',
            sub,
            '4. OPTIONAL CUSTOM ENGINEERING ITEMS (SEPARATE QUOTE IF REQUESTED)',
            sub,
            research.optionalEngineeringItems,
            '',
            sub,
            '5. ESTIMATED MONTHLY OPERATIONAL COST (AUD) & PRIVACY/RISK POSTURE',
            sub,
            research.estimatedMonthlyAudCost,
            '',
            research.privacyAndRisks,
            div
        ].join('\n'));

        const briefId = `brief_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const timestamp = now().toISOString();
        const summary = `New 30-Day AI Strategy brief for ${session.clientBusinessName} (${session.userEmail || session.uid}) - Stripe ${session.stripeSessionId} (AUD $${session.amountPaidExGstAud.toFixed(2)} ex GST).`;

        const savedBrief = await saveBrief({
            id: briefId,
            ...PARTITION_KEY,
            strategySessionId: session.id,
            stripeSessionId: session.stripeSessionId,
            uid: session.uid,
            clientEmail: session.userEmail || '',
            clientBusinessName: session.clientBusinessName,
            amountPaidExGstAud: session.amountPaidExGstAud,
            fileName,
            summary,
            content,
            read: false,
            modelUsed: model,
            createdAt: timestamp,
            updatedAt: timestamp
        });

        await saveSession({
            ...session,
            superadminBriefId: savedBrief.id,
            updatedAt: now().toISOString()
        });

        // Also dispatch a concise unread notification to the SuperAdmin Message Box (max 4,000 chars)
        try {
            const msgBody = [
                `[Strategy Plan Completed] ${session.clientBusinessName}`,
                `Brief ID: ${savedBrief.id} | File: ${fileName}`,
                `Stripe Payment: ${session.stripeSessionId} (AUD $${session.amountPaidExGstAud.toFixed(2)} ex GST)`,
                `Client Email: ${session.userEmail || 'N/A'}`,
                '',
                'Top Findings:',
                research.publicDocsFindings.slice(0, 1200),
                '',
                'Estimated Monthly AUD Cost:',
                research.estimatedMonthlyAudCost.slice(0, 600),
                '',
                'Open Admin -> Strategy Briefs to read/download the complete SUPERADMIN .txt brief.'
            ].join('\n').slice(0, 3950);

            await firebase.sendChatMessage({
                senderUid: session.uid,
                senderEmail: session.userEmail || 'client@aifoundation.net.au',
                senderName: session.clientBusinessName || session.userName || 'Strategy Client',
                senderRole: 'supporter',
                recipientUid: 'superadmin',
                recipientEmail: 'support@aifoundation.net.au',
                recipientName: 'SuperAdmin',
                conversationId: `conv_strategy_${session.uid}`,
                userMessage: msgBody,
                tag: 'aifoundation',
                businessId: '#aifoundation',
                businessName: 'AI Foundation',
                source: 'aifoundation'
            });
        } catch (chatErr) {
            console.warn('[Strategy Plan] SuperAdmin chat dispatch note:', chatErr.message);
        }

        return savedBrief;
    }

    async function submitIntakeAnswer({ uid, sessionId, message }) {
        const parsedInput = StrategyChatTurnInputSchema.safeParse({ sessionId, message });
        if (!parsedInput.success) {
            throw createHttpError(parsedInput.error.issues[0]?.message || 'Invalid plain-text consultation input.', 400);
        }

        const session = await getSessionById(parsedInput.data.sessionId);
        if (!session || session.uid !== uid) {
            throw createHttpError('Strategy consultation session not found.', 404);
        }
        if (session.paymentStatus !== 'paid') {
            throw createHttpError('Payment verification is required before starting the consultation.', 402);
        }
        if (session.status === 'completed') {
            throw createHttpError('This 6-step consultation is already completed. You can download your advisory report below.', 409);
        }

        const step = session.currentStep >= 1 && session.currentStep <= 6 ? session.currentStep : 1;
        const { scrubbedText, hadSecrets } = redactSecrets(parsedInput.data.message);
        if (!scrubbedText) {
            throw createHttpError('Please enter a non-empty plain-text response.', 400);
        }

        const redactedWarning = hadSecrets
            ? 'Security Notice: Potential API keys, tokens, or passwords were automatically scrubbed to [REDACTED_SECRET]. Never share credentials in this advisory chat.'
            : null;

        const timestamp = now().toISOString();
        const qDef = INTAKE_QUESTIONS[step - 1];
        const nextAnswers = [
            ...session.answers.filter(a => a.step !== step),
            {
                step,
                topic: qDef.topic,
                question: qDef.prompt,
                answer: scrubbedText,
                hadSecrets,
                answeredAt: timestamp
            }
        ];

        const nextMessages = [
            ...session.messages,
            { role: 'user', step, content: scrubbedText, createdAt: timestamp }
        ];

        let clientBusinessName = session.clientBusinessName;
        let nicheGroundingSummary = session.nicheGroundingSummary;
        if (step === 1) {
            clientBusinessName = inferBusinessNameFromQ1(scrubbedText, session.userName);
            nicheGroundingSummary = await runStage1NicheSearch(scrubbedText);
        }

        if (step < 6) {
            const nextQuestion = INTAKE_QUESTIONS[step];
            const ackLines = [];
            if (redactedWarning) ackLines.push(redactedWarning, '');
            if (step === 1 && nicheGroundingSummary) {
                ackLines.push(`Public Niche Insights: ${nicheGroundingSummary}`, '');
            }
            ackLines.push(nextQuestion.prompt);

            nextMessages.push({
                role: 'assistant',
                step: step + 1,
                content: ackLines.join('\n'),
                createdAt: now().toISOString()
            });

            const updated = await saveSession({
                ...session,
                clientBusinessName,
                nicheGroundingSummary,
                currentStep: step + 1,
                answers: nextAnswers,
                messages: nextMessages,
                updatedAt: now().toISOString()
            });

            return { session: updated, redactedWarning };
        }

        // Step 6 completed -> Stage 2 immediate preliminary customer .txt + Stage 3 async research
        const completedDraft = {
            ...session,
            clientBusinessName: clientBusinessName || session.userName || 'Client Business',
            nicheGroundingSummary,
            currentStep: 6,
            status: 'completed',
            answers: nextAnswers,
            messages: nextMessages,
            updatedAt: now().toISOString()
        };

        const stage2Sections = await generateStage2Sections(completedDraft);
        const preliminaryReport = buildPreliminaryCustomerTxt(completedDraft, stage2Sections);

        const finalLines = [];
        if (redactedWarning) finalLines.push(redactedWarning, '');
        finalLines.push(
            `Thank you — all 6 steps are complete. Your Preliminary 30-Day Google AI Strategy Advisory report (${preliminaryReport.fileName}) is ready to download below.`,
            'Remember: this advisory blueprint accessed none of your external accounts or files. An AI Foundation Lead Architect will review your brief within 24-48 business hours.'
        );
        nextMessages.push({
            role: 'assistant',
            step: 6,
            content: finalLines.join('\n\n'),
            createdAt: now().toISOString()
        });

        const completedSession = await saveSession({
            ...completedDraft,
            messages: nextMessages,
            preliminaryReport,
            updatedAt: now().toISOString()
        });

        // Fire-and-forget Stage 3 research so the customer download returns immediately
        const researchPromise = runStage3SuperAdminResearch(completedSession).catch(err => {
            console.error('[Strategy Plan] Async Stage 3 research error:', err);
            return null;
        });
        pendingResearchTasks.add(researchPromise);
        researchPromise.finally(() => pendingResearchTasks.delete(researchPromise));

        return { session: completedSession, redactedWarning };
    }

    async function waitForPendingResearch() {
        if (pendingResearchTasks.size === 0) return;
        await Promise.allSettled([...pendingResearchTasks]);
    }

    return {
        getStrategyPlanPricing,
        createCheckoutSession,
        confirmCheckoutSession,
        settleCheckoutSession,
        getLatestUserSession,
        getSessionById,
        submitIntakeAnswer,
        listSuperAdminBriefs,
        markBriefRead,
        deleteSuperAdminBrief,
        waitForPendingResearch
    };
}

module.exports = {
    SESSIONS_COLLECTION,
    BRIEFS_COLLECTION,
    SERVICE_NAME,
    SERVICE_TYPE,
    DEFAULT_PRICE_AUD_CENTS,
    INTAKE_QUESTIONS,
    PARTITION_KEY,
    StrategyStripeMetadataSchema,
    StrategyChatTurnInputSchema,
    StrategySessionSchema,
    SuperAdminBriefSchema,
    redactSecrets,
    stripMarkdownAndHtml,
    sanitizeBusinessSlug,
    createStrategyPlanService
};
