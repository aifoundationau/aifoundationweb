const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const {
    redactSecrets,
    stripMarkdownAndHtml,
    sanitizeBusinessSlug,
    PARTITION_KEY
} = require('./strategy-plan');

const SESSIONS_COLLECTION = 'aifoundation_regional_edu_sessions';
const REVIEWS_COLLECTION = 'aifoundation_regional_edu_reviews';
const DEFAULT_SESSIONS_FILE = path.join(__dirname, 'data', 'regional-edu-sessions.json');
const DEFAULT_REVIEWS_FILE = path.join(__dirname, 'data', 'regional-edu-reviews.json');

const SERVICE_SLUG = 'regulatory-roadmap';
const SERVICE_NAME = 'Services - Regional Education & AI Literacy';
const SERVICE_TYPE = 'regional_education_ai_literacy_advisory';
const SERVICE_WORKFLOW = 'advisory_with_superadmin_improvement';
const DEFAULT_PRICE_AUD_CENTS = 19900;

const SESSION_ID_PATTERN = /^regedu_[A-Za-z0-9_-]{6,120}$/;
const REVIEW_ID_PATTERN = /^rev_[A-Za-z0-9_-]{6,120}$/;
const SAFE_RETURN_PATH_REGEX = /^\/(?!\/)[A-Za-z0-9._~\-/]*$/;

const INTAKE_QUESTIONS = [
    {
        step: 1,
        topic: 'Who You Serve & Where',
        prompt: 'Question 1 of 6 (Who You Serve & Where): Please tell me your organization or community group name, your location in regional Australia or Southeast Asia, learner age groups, and approximate team size. (Advisory-only: no account links or student details needed.)'
    },
    {
        step: 2,
        topic: 'Connectivity & Everyday Tools',
        prompt: 'Question 2 of 6 (Connectivity & Everyday Tools): How reliable is internet access where you operate, what devices do learners/staff mainly use (mobile, shared PCs, tablets), and what everyday low-bandwidth tools do you already rely on?'
    },
    {
        step: 3,
        topic: 'Daily Work & Literacy Goals',
        prompt: 'Question 3 of 6 (Daily Work & Literacy Goals): Where do educators, coordinators, or learners lose the most time manually each week, and what practical AI literacy skills do you most want your community to gain?'
    },
    {
        step: 4,
        topic: 'Privacy & Student/Community Rules',
        prompt: 'Question 4 of 6 (Privacy & Student/Community Rules): What local privacy laws, school/sector rules, or child-safety boundaries govern learner information in your region? (Reminder: never share student PII or credentials.)'
    },
    {
        step: 5,
        topic: 'Fairness, Accuracy & Oversight Needs',
        prompt: 'Question 5 of 6 (Fairness, Accuracy & Oversight Needs): What concerns or checks do you need around AI accuracy, cultural/linguistic fairness, plagiarism, or human sign-off before materials reach learners?'
    },
    {
        step: 6,
        topic: 'Budget, Time & 30-Day Priorities',
        prompt: 'Question 6 of 6 (Budget, Time & 30-Day Priorities): What subsidized or low-cost budget limits and weekly volunteer/staff hours are realistic, and what concrete milestone would make the next 30 days a success?'
    }
];

const RegionalEduStripeMetadataSchema = z.object({
    tag: z.literal(PARTITION_KEY.tag),
    businessId: z.literal(PARTITION_KEY.businessId),
    businessName: z.literal(PARTITION_KEY.businessName),
    source: z.literal(PARTITION_KEY.source),
    kind: z.literal('regional_edu_advisory'),
    uid: z.string().min(1).max(128),
    userId: z.string().min(1).max(128),
    serviceSlug: z.literal(SERVICE_SLUG),
    serviceName: z.literal(SERVICE_NAME),
    serviceType: z.literal(SERVICE_TYPE),
    workflow: z.literal(SERVICE_WORKFLOW)
}).strict();

const RegionalEduCheckoutInputSchema = z.object({
    returnPath: z.string().max(200).regex(SAFE_RETURN_PATH_REGEX, 'Invalid return path.').optional()
}).strict();

const RegionalEduConfirmInputSchema = z.object({
    sessionId: z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9_-]+$/, 'Invalid checkout session ID.')
}).strict();

const RegionalEduChatTurnInputSchema = z.object({
    sessionId: z.string().trim().regex(SESSION_ID_PATTERN, 'Invalid advisory session ID.'),
    message: z.string().trim().min(2, 'Please enter a short answer (at least 2 characters).').max(4000, 'Please keep each answer under 4,000 characters.')
}).strict();

const RegionalEduAnswerSchema = z.object({
    step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
    topic: z.string().min(1).max(160),
    question: z.string().min(1).max(1200),
    answer: z.string().min(1).max(4000),
    hadSecrets: z.boolean(),
    answeredAt: z.string().min(1)
}).strict();

const RegionalEduMessageSchema = z.object({
    role: z.enum(['assistant', 'user']),
    step: z.number().int().min(1).max(6),
    content: z.string().min(1).max(8000),
    createdAt: z.string().min(1)
}).strict();

const ClientNeedsSummarySchema = z.object({
    organizationName: z.string().min(1).max(200),
    region: z.string().min(1).max(400),
    learnerProfile: z.string().min(1).max(800),
    connectivityProfile: z.string().min(1).max(1000),
    dailyLiteracyGoals: z.string().min(1).max(1200),
    privacyConstraints: z.string().min(1).max(1200),
    oversightNeeds: z.string().min(1).max(1200),
    budgetAndTimeline: z.string().min(1).max(1200)
}).strict();

const DeliverableFileSchema = z.object({
    fileName: z.string().min(1).max(200),
    generatedAt: z.string().min(1),
    content: z.string().min(1).max(80000)
}).strict();

const RegionalEduSessionSchema = z.object({
    id: z.string().regex(SESSION_ID_PATTERN),
    tag: z.literal(PARTITION_KEY.tag),
    businessId: z.enum(['#aifoundation', 'aifoundation']),
    businessName: z.literal(PARTITION_KEY.businessName),
    source: z.literal(PARTITION_KEY.source),
    uid: z.string().min(1).max(128),
    userEmail: z.string().max(320),
    userName: z.string().max(200),
    stripeSessionId: z.string().min(1).max(200),
    paymentStatus: z.enum(['pending', 'paid', 'failed']),
    amountPaidExGstAud: z.number().nonnegative(),
    currency: z.literal('AUD'),
    status: z.enum([
        'pending_payment',
        'paid_intake_ready',
        'generating_preliminary_draft',
        'awaiting_superadmin_improvement',
        'final_improved_delivered'
    ]),
    currentStep: z.number().int().min(0).max(6),
    totalSteps: z.literal(6),
    clientOrganizationName: z.string().max(200),
    regionGroundingSummary: z.string().max(4000),
    needsSummary: ClientNeedsSummarySchema.nullable(),
    answers: z.array(RegionalEduAnswerSchema).max(6),
    messages: z.array(RegionalEduMessageSchema).max(30),
    preliminaryReport: DeliverableFileSchema.nullable(),
    finalImprovedReport: DeliverableFileSchema.nullable(),
    superadminExecutiveNote: z.string().max(4000),
    superadminReviewId: z.string().nullable(),
    superadminApprovedAt: z.string().nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1)
}).strict();

const RegionalEduReviewSchema = z.object({
    id: z.string().regex(REVIEW_ID_PATTERN),
    tag: z.literal(PARTITION_KEY.tag),
    businessId: z.enum(['#aifoundation', 'aifoundation']),
    businessName: z.literal(PARTITION_KEY.businessName),
    source: z.literal(PARTITION_KEY.source),
    regionalEduSessionId: z.string().regex(SESSION_ID_PATTERN),
    stripeSessionId: z.string().min(1).max(200),
    uid: z.string().min(1).max(128),
    clientEmail: z.string().max(320),
    clientOrganizationName: z.string().max(200),
    amountPaidExGstAud: z.number().nonnegative(),
    reviewStatus: z.enum(['unread_analysis', 'in_review_editing', 'final_improved_delivered']),
    read: z.boolean(),
    summary: z.string().min(1).max(2000),
    needsSummary: ClientNeedsSummarySchema.nullable(),
    intakeTranscript: z.string().min(1).max(25000),
    researchSummary: z.string().min(1).max(25000),
    preliminaryFileName: z.string().min(1).max(200),
    preliminaryTxtContent: z.string().min(1).max(80000),
    workingDraftContent: z.string().min(1).max(80000),
    superadminNote: z.string().max(4000),
    finalFileName: z.string().max(200).nullable(),
    finalTxtContent: z.string().max(80000).nullable(),
    approvedAt: z.string().nullable(),
    modelUsed: z.string().min(1).max(100),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1)
}).strict();

const PreliminaryDraftSectionsSchema = z.object({
    executiveOverview: z.string().min(20).max(5000),
    focus1RegulatoryAuditing: z.string().min(20).max(6000),
    focus2GovernancePolicy: z.string().min(20).max(6000),
    focus3PrivacyCompliance: z.string().min(20).max(6000),
    focus4ThirtyDayRoadmap: z.string().min(20).max(6000),
    lowBandwidthRecommendations: z.string().min(20).max(5000)
}).strict();

const AsyncResearchSectionsSchema = z.object({
    australianFrameworks: z.string().min(20).max(6000),
    aseanUnescoStandards: z.string().min(20).max(6000),
    lowBandwidthGoogleTools: z.string().min(20).max(6000),
    specialistImprovementChecklist: z.string().min(20).max(6000)
}).strict();

const SuperadminDraftSaveSchema = z.object({
    improvedTxtContent: z.string().trim().min(20, 'Working draft must be at least 20 characters.').max(60000, 'Working draft must stay under 60,000 characters.'),
    superadminNote: z.string().trim().max(4000, 'Superadmin note must stay under 4,000 characters.').optional()
}).strict();

const SuperadminImprovedPlanSchema = z.object({
    improvedTxtContent: z.string().trim().min(50, 'Final approved plan must be at least 50 characters.').max(60000, 'Final approved plan must stay under 60,000 characters.'),
    executiveNote: z.string().trim().max(4000, 'Executive note must stay under 4,000 characters.').optional(),
    confirmApprove: z.literal(true)
}).strict();

function createHttpError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

function formatUtcDate(date) {
    const iso = date.toISOString();
    return iso.slice(0, 10).replace(/-/g, '');
}

function extractOrganizationName(q1Answer, fallbackName) {
    const firstChunk = String(q1Answer || '')
        .split(/[\n,.!?;]/)[0]
        .replace(/^(?:we are|i am|our group is|our school is|organization is|org is|at|for)\s+/i, '')
        .trim();
    if (firstChunk.length >= 2 && firstChunk.length <= 80) {
        return firstChunk;
    }
    return String(fallbackName || 'Community Organization').trim().slice(0, 80) || 'Community Organization';
}

function buildNeedsSummaryFromAnswers(orgName, answers) {
    const byStep = new Map(answers.map(a => [a.step, a.answer]));
    const q1 = byStep.get(1) || orgName;
    const q2 = byStep.get(2) || 'Mixed connectivity and shared devices.';
    const q3 = byStep.get(3) || 'Practical AI literacy and manual workflow relief.';
    const q4 = byStep.get(4) || 'Zero student PII exposure and regional privacy alignment.';
    const q5 = byStep.get(5) || 'Human verification and bias checks before classroom/community use.';
    const q6 = byStep.get(6) || 'Low-cost/subsidized tools and realistic weekly rollout.';

    return ClientNeedsSummarySchema.parse({
        organizationName: orgName,
        region: q1.slice(0, 390),
        learnerProfile: q1.slice(0, 790),
        connectivityProfile: q2.slice(0, 990),
        dailyLiteracyGoals: q3.slice(0, 1190),
        privacyConstraints: q4.slice(0, 1190),
        oversightNeeds: q5.slice(0, 1190),
        budgetAndTimeline: q6.slice(0, 1190)
    });
}

function createRegionalEduService(options = {}) {
    const firebase = options.firebase || require('./firebase-service');
    const getStripe = options.getStripe || (() => null);
    const getServicePrices = options.getServicePrices || (async () => ({ prices: {} }));
    const sessionsFilePath = options.sessionsFilePath || DEFAULT_SESSIONS_FILE;
    const reviewsFilePath = options.reviewsFilePath || DEFAULT_REVIEWS_FILE;
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
            console.warn('[Regional Edu] Could not initialize @google/genai:', e.message);
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
            console.warn(`[Regional Edu] Could not write local copy ${filePath}:`, e.message);
        }
    }

    async function saveSession(session) {
        const validated = RegionalEduSessionSchema.parse(session);
        const map = readJsonMap(sessionsFilePath);
        map[validated.id] = validated;
        writeJsonMap(sessionsFilePath, map);
        try {
            await firebase.writeDocument(SESSIONS_COLLECTION, validated.id, validated, true);
        } catch (e) {
            console.warn('[Regional Edu] Firestore session save fallback:', e.message);
        }
        return validated;
    }

    async function getSessionById(sessionId) {
        if (!SESSION_ID_PATTERN.test(String(sessionId || ''))) return null;
        try {
            const doc = await firebase.getDocument(SESSIONS_COLLECTION, sessionId);
            const parsed = RegionalEduSessionSchema.safeParse(doc);
            if (parsed.success) return parsed.data;
        } catch {
            // Fall through to local copy
        }
        const local = readJsonMap(sessionsFilePath)[sessionId];
        const parsed = RegionalEduSessionSchema.safeParse(local);
        return parsed.success ? parsed.data : null;
    }

    async function listSessionsForUser(uid) {
        const byId = new Map();
        const localMap = readJsonMap(sessionsFilePath);
        for (const item of Object.values(localMap)) {
            if (item && item.uid === uid) {
                const parsed = RegionalEduSessionSchema.safeParse(item);
                if (parsed.success) byId.set(parsed.data.id, parsed.data);
            }
        }
        try {
            const docs = await firebase.listDocuments(SESSIONS_COLLECTION);
            if (Array.isArray(docs)) {
                for (const d of docs) {
                    if (d.fields && d.fields.uid === uid) {
                        const parsed = RegionalEduSessionSchema.safeParse(d.fields);
                        if (parsed.success) byId.set(parsed.data.id, parsed.data);
                    }
                }
            }
        } catch (e) {
            console.warn('[Regional Edu] Firestore session list note:', e.message);
        }
        return [...byId.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    async function saveReview(review) {
        const validated = RegionalEduReviewSchema.parse(review);
        const map = readJsonMap(reviewsFilePath);
        map[validated.id] = validated;
        writeJsonMap(reviewsFilePath, map);
        try {
            await firebase.writeDocument(REVIEWS_COLLECTION, validated.id, validated, true);
        } catch (e) {
            console.warn('[Regional Edu] Firestore review save fallback:', e.message);
        }
        return validated;
    }

    async function getReviewById(reviewId) {
        if (!REVIEW_ID_PATTERN.test(String(reviewId || ''))) return null;
        try {
            const doc = await firebase.getDocument(REVIEWS_COLLECTION, reviewId);
            const parsed = RegionalEduReviewSchema.safeParse(doc);
            if (parsed.success) return parsed.data;
        } catch {
            // Fall through to local copy
        }
        const local = readJsonMap(reviewsFilePath)[reviewId];
        const parsed = RegionalEduReviewSchema.safeParse(local);
        return parsed.success ? parsed.data : null;
    }

    async function listSuperAdminReviews() {
        const byId = new Map();
        const localMap = readJsonMap(reviewsFilePath);
        for (const item of Object.values(localMap)) {
            const parsed = RegionalEduReviewSchema.safeParse(item);
            if (parsed.success) byId.set(parsed.data.id, parsed.data);
        }
        try {
            const docs = await firebase.listDocuments(REVIEWS_COLLECTION);
            if (Array.isArray(docs)) {
                for (const d of docs) {
                    const parsed = RegionalEduReviewSchema.safeParse(d.fields);
                    if (parsed.success) byId.set(parsed.data.id, parsed.data);
                }
            }
        } catch (e) {
            console.warn('[Regional Edu] Firestore review list note:', e.message);
        }
        const reviews = [...byId.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const unreadCount = reviews.filter(r => !r.read).length;
        return { reviews, unreadCount };
    }

    async function markReviewRead(reviewId) {
        const review = await getReviewById(reviewId);
        if (!review) throw createHttpError('Regional Education review record not found.', 404);
        const nextStatus = review.reviewStatus === 'unread_analysis' ? 'in_review_editing' : review.reviewStatus;
        if (review.read && review.reviewStatus === nextStatus) return review;
        return saveReview({
            ...review,
            read: true,
            reviewStatus: nextStatus,
            updatedAt: now().toISOString()
        });
    }

    async function saveReviewDraft(reviewId, input) {
        if (!REVIEW_ID_PATTERN.test(String(reviewId || ''))) {
            throw createHttpError('Invalid Regional Education review ID.', 400);
        }
        const parsed = SuperadminDraftSaveSchema.safeParse(input);
        if (!parsed.success) {
            throw createHttpError(parsed.error.issues[0]?.message || 'Invalid draft payload.', 400);
        }
        const review = await getReviewById(reviewId);
        if (!review) throw createHttpError('Regional Education review record not found.', 404);

        const { scrubbedText: cleanDraft } = redactSecrets(stripMarkdownAndHtml(parsed.data.improvedTxtContent));
        const { scrubbedText: cleanNote } = redactSecrets(stripMarkdownAndHtml(parsed.data.superadminNote ?? review.superadminNote ?? ''));

        const nextStatus = review.reviewStatus === 'final_improved_delivered'
            ? 'final_improved_delivered'
            : 'in_review_editing';

        return saveReview({
            ...review,
            read: true,
            reviewStatus: nextStatus,
            workingDraftContent: cleanDraft || review.preliminaryTxtContent,
            superadminNote: cleanNote.slice(0, 4000),
            updatedAt: now().toISOString()
        });
    }

    async function approveAndDeliverFinalPlan(reviewId, input, adminUser = {}) {
        if (!REVIEW_ID_PATTERN.test(String(reviewId || ''))) {
            throw createHttpError('Invalid Regional Education review ID.', 400);
        }
        const parsed = SuperadminImprovedPlanSchema.safeParse(input);
        if (!parsed.success) {
            throw createHttpError(parsed.error.issues[0]?.message || 'Confirmation and valid final TXT content are required.', 400);
        }
        const review = await getReviewById(reviewId);
        if (!review) throw createHttpError('Regional Education review record not found.', 404);

        const timestamp = now().toISOString();
        const dateStr = formatUtcDate(now());
        const slug = sanitizeBusinessSlug(review.clientOrganizationName);
        const finalFileName = `FINAL_REVIEWED_Regional_Education_AI_Advisory_${slug}_${dateStr}.txt`;

        const { scrubbedText: cleanTxt } = redactSecrets(stripMarkdownAndHtml(parsed.data.improvedTxtContent));
        const { scrubbedText: cleanNote } = redactSecrets(stripMarkdownAndHtml(parsed.data.executiveNote || review.superadminNote || ''));

        const div = '='.repeat(68);
        const finalHeader = stripMarkdownAndHtml([
            div,
            'AI FOUNDATION - FINAL SPECIALIST-REVIEWED ADVISORY PLAN',
            SERVICE_NAME.toUpperCase(),
            div,
            `Organization       : ${review.clientOrganizationName}`,
            `Final Approved UTC : ${timestamp}`,
            `Reviewed By        : ${adminUser.email || adminUser.name || 'AI Foundation SuperAdmin Specialist'}`,
            'Scope Notice       : Purely Client Advisory - Zero external account access.',
            cleanNote ? `Specialist Note    : ${cleanNote}` : '',
            div,
            ''
        ].filter(Boolean).join('\n'));

        const finalBody = cleanTxt.includes('FINAL SPECIALIST-REVIEWED ADVISORY PLAN')
            ? cleanTxt
            : `${finalHeader}\n${cleanTxt}`;

        const finalDeliverable = {
            fileName: finalFileName,
            generatedAt: timestamp,
            content: finalBody
        };

        const updatedReview = await saveReview({
            ...review,
            read: true,
            reviewStatus: 'final_improved_delivered',
            workingDraftContent: finalBody,
            superadminNote: cleanNote.slice(0, 4000),
            finalFileName,
            finalTxtContent: finalBody,
            approvedAt: timestamp,
            updatedAt: timestamp
        });

        const session = await getSessionById(review.regionalEduSessionId);
        let updatedSession = session;
        if (session) {
            const clientNotice = [
                `Great news: Your Regional Education & AI Literacy advisory plan has been reviewed and upgraded by an AI Foundation specialist.`,
                `Final File Ready: ${finalFileName}`,
                cleanNote ? `Specialist Executive Note: ${cleanNote}` : 'You can download your Final Improved TXT Advisory Plan below.'
            ].join('\n\n');

            const nextMessages = [
                ...session.messages,
                {
                    role: 'assistant',
                    step: 6,
                    content: clientNotice,
                    createdAt: timestamp
                }
            ].slice(-30);

            updatedSession = await saveSession({
                ...session,
                status: 'final_improved_delivered',
                finalImprovedReport: finalDeliverable,
                superadminExecutiveNote: cleanNote.slice(0, 4000),
                superadminApprovedAt: timestamp,
                messages: nextMessages,
                updatedAt: timestamp
            });
        }

        try {
            const msgBody = [
                `[Final Improved Plan Delivered] ${review.clientOrganizationName}`,
                `Review ID: ${review.id} | File: ${finalFileName}`,
                `Client Email: ${review.clientEmail || 'N/A'}`,
                cleanNote ? `Executive Note: ${cleanNote.slice(0, 800)}` : 'Status: Approved and unlocked for client download.'
            ].join('\n');
            await firebase.sendChatMessage({
                userId: review.uid,
                userName: `${review.clientOrganizationName} [Final Plan Ready]`,
                userEmail: review.clientEmail || 'client@aifoundation.net.au',
                userMessage: msgBody.slice(0, 3900),
                sessionId: review.regionalEduSessionId,
                pageUrl: '/services.html#services2'
            });
        } catch (msgErr) {
            console.warn('[Regional Edu] Chat delivery notification note:', msgErr.message);
        }

        return { review: updatedReview, session: updatedSession };
    }

    async function deleteReview(reviewId, { confirmed = false } = {}) {
        if (!REVIEW_ID_PATTERN.test(String(reviewId || ''))) {
            throw createHttpError('Invalid Regional Education review ID.', 400);
        }
        if (confirmed !== true) {
            throw createHttpError('Please confirm deletion before removing this Regional Education review.', 400);
        }
        const existing = await getReviewById(reviewId);
        if (!existing) {
            throw createHttpError('Regional Education review record not found.', 404);
        }
        const map = readJsonMap(reviewsFilePath);
        delete map[reviewId];
        writeJsonMap(reviewsFilePath, map);
        try {
            await firebase.deleteDocument(REVIEWS_COLLECTION, reviewId);
        } catch (e) {
            console.warn('[Regional Edu] Firestore review delete note:', e.message);
        }
        return { success: true, id: reviewId };
    }

    async function getRegionalEduPricing() {
        let exGstCents = Number(process.env.REGIONAL_EDU_PLAN_PRICE_AUD_CENTS) || DEFAULT_PRICE_AUD_CENTS;
        try {
            const saved = await getServicePrices();
            const audAmount = saved?.prices?.[SERVICE_SLUG]?.price?.aud;
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
            console.warn(`[Regional Edu] Gemini call (${model}) fell back:`, e.message);
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
        RegionalEduCheckoutInputSchema.parse({ returnPath });
        const stripe = getStripe();
        if (!stripe) {
            throw createHttpError('Card payments are not configured yet. Please try again later.', 503);
        }

        const safeReturnPath = typeof returnPath === 'string' && SAFE_RETURN_PATH_REGEX.test(returnPath)
            ? returnPath
            : '/';

        const pricing = await getRegionalEduPricing();
        const metadata = RegionalEduStripeMetadataSchema.parse({
            ...PARTITION_KEY,
            kind: 'regional_edu_advisory',
            uid: user.uid,
            userId: user.uid,
            serviceSlug: SERVICE_SLUG,
            serviceName: SERVICE_NAME,
            serviceType: SERVICE_TYPE,
            workflow: SERVICE_WORKFLOW
        });

        const stripeSession = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'], // instant payments only: there are no webhooks to hear about delayed ones
            currency: 'aud',
            automatic_tax: { enabled: true },
            customer_creation: 'always',
            invoice_creation: { enabled: true },
            allow_promotion_codes: true,
            line_items: [{
                quantity: 1,
                price_data: {
                    currency: 'aud',
                    tax_behavior: 'exclusive',
                    unit_amount: pricing.exGstCents,
                    product_data: {
                        name: SERVICE_NAME,
                        description: 'Regional Education & AI Literacy Client Advisory + Specialist Review (Strictly Advisory-Only)'
                    }
                }
            }],
            customer_email: user.email || undefined,
            client_reference_id: user.uid,
            metadata,
            payment_intent_data: { metadata },
            success_url: `${origin}${safeReturnPath}?regional_edu=success&session_id={CHECKOUT_SESSION_ID}#services2`,
            cancel_url: `${origin}${safeReturnPath}?regional_edu=cancelled#services2`
        });

        const timestamp = now().toISOString();
        const sessionId = `regedu_${stripeSession.id}`;
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
            clientOrganizationName: '',
            regionGroundingSummary: '',
            needsSummary: null,
            answers: [],
            messages: [],
            preliminaryReport: null,
            finalImprovedReport: null,
            superadminExecutiveNote: '',
            superadminReviewId: null,
            superadminApprovedAt: null,
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
            console.warn('[Regional Edu] Transaction log note:', fbErr.message);
        }

        return { url: stripeSession.url, sessionId, stripeSessionId: stripeSession.id, pricing };
    }

    async function unlockPaidCheckout(stripeSession) {
        if (!stripeSession || stripeSession.metadata?.kind !== 'regional_edu_advisory') {
            return null;
        }
        if (stripeSession.payment_status !== 'paid') {
            return null;
        }

        const sessionId = `regedu_${stripeSession.id}`;
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
                'Payment confirmed. Welcome to your strictly advisory-only Regional Education & AI Literacy consultation.',
                'Purely Advisory Guarantee: We access NONE of your Google Classroom, LMS, school drives, or learner records, and this chat accepts no file uploads. Never share student PII, passwords, or API keys.',
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
            status: 'paid_intake_ready',
            currentStep: 1,
            totalSteps: 6,
            clientOrganizationName: existing?.clientOrganizationName || '',
            regionGroundingSummary: existing?.regionGroundingSummary || '',
            needsSummary: existing?.needsSummary || null,
            answers: existing?.answers || [],
            messages: existing?.messages?.length ? existing.messages : [introMessage],
            preliminaryReport: existing?.preliminaryReport || null,
            finalImprovedReport: existing?.finalImprovedReport || null,
            superadminExecutiveNote: existing?.superadminExecutiveNote || '',
            superadminReviewId: existing?.superadminReviewId || null,
            superadminApprovedAt: existing?.superadminApprovedAt || null,
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
            console.warn('[Regional Edu] Transaction status update note:', e.message);
        }

        return unlocked;
    }

    async function confirmCheckoutSession({ uid, sessionId }) {
        const parsed = RegionalEduConfirmInputSchema.safeParse({ sessionId });
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
        if (!stripeSession || stripeSession.metadata?.kind !== 'regional_edu_advisory' || stripeSession.metadata?.uid !== uid) {
            throw createHttpError('Checkout session not found for this account.', 404);
        }
        if (stripeSession.payment_status !== 'paid') {
            return await getSessionById(`regedu_${stripeSession.id}`);
        }
        return unlockPaidCheckout(stripeSession);
    }

    // Settle a Checkout Session already fetched with stripe.checkout.sessions.retrieve() (SuperAdmin's Verify pending
    // payments; there are no Stripe webhooks). Unlocks it when paid, and running it again changes nothing.
    // status: 'paid', 'pending' (not paid yet) or 'expired' (never will be). { handled: false } when it isn't this service's
    async function settleCheckoutSession(session) {
        if (!session || session.metadata?.kind !== 'regional_edu_advisory') {
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

    async function runStage1RegionSearch(q1Answer) {
        const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
        const systemInstruction = 'You are an AI governance and digital literacy advisor for regional Australia and Southeast Asia. Perform a public web search on connectivity realities, education frameworks, and regional digital literacy context for the client organization described below. Reply in 2-3 concise plain-text sentences. No Markdown, no HTML, and never imply access to private student or account systems.';
        const aiText = await runGeminiInteraction({
            model,
            systemInstruction,
            input: `Organization & regional profile: ${q1Answer}`,
            useSearch: true
        });
        if (aiText) {
            return stripMarkdownAndHtml(aiText).slice(0, 1200);
        }
        return 'Regional education providers across regional Australia and Southeast Asia commonly balance intermittent bandwidth, shared or mobile devices, strict learner privacy expectations, and a practical need for low-cost human-supervised AI literacy workflows.';
    }

    async function generateStepFollowUp({ step, answer, orgName, regionSummary }) {
        const nextQuestion = INTAKE_QUESTIONS[step];
        const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
        const systemInstruction = 'You are a supportive Regional Education & AI Literacy advisor. Acknowledge the user answer in 1-2 short plain-text sentences (strictly advisory, zero external access), then output a blank line and ask the exact provided next question verbatim. Do not use Markdown or HTML.';
        const aiText = await runGeminiInteraction({
            model,
            systemInstruction,
            input: [
                `Organization: ${orgName}`,
                `Step ${step} Topic: ${INTAKE_QUESTIONS[step - 1].topic}`,
                `Client Answer: ${answer}`,
                regionSummary ? `Public Regional Context: ${regionSummary}` : '',
                `Exact Next Question to Ask: ${nextQuestion.prompt}`
            ].filter(Boolean).join('\n'),
            useSearch: false
        });
        if (aiText) {
            return stripMarkdownAndHtml(aiText).slice(0, 2200);
        }
        const ack = step === 1 && regionSummary
            ? `Thank you for introducing ${orgName}. ${regionSummary}`
            : `Noted for ${orgName}. This helps tailor practical, zero-access guidance for your community.`;
        return `${ack}\n\n${nextQuestion.prompt}`;
    }

    async function generatePreliminaryAdvisorySections(session) {
        const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
        const qaSummary = session.answers.map(a => `Q${a.step} (${a.topic}): ${a.answer}`).join('\n');
        const systemInstruction = [
            'You are producing the preliminary plain-text advisory plan for "Services - Regional Education & AI Literacy" at AI Foundation.',
            'STRICT SCOPE RULES:',
            '- Purely advisory: tell the client what policies, checks, settings, and community steps THEY should perform themselves.',
            '- Zero external account access: never claim our system connects to Google Classroom, LMS, or student records.',
            '- Address all 4 advisory focus areas plus low-bandwidth Google tools.',
            'Return STRICT JSON ONLY with keys: executiveOverview, focus1RegulatoryAuditing, focus2GovernancePolicy, focus3PrivacyCompliance, focus4ThirtyDayRoadmap, lowBandwidthRecommendations.',
            'No Markdown syntax (** or ##) and no HTML inside values.'
        ].join('\n');

        const raw = await runGeminiInteraction({
            model,
            systemInstruction,
            input: [
                `Organization: ${session.clientOrganizationName}`,
                `Regional Context: ${session.regionGroundingSummary}`,
                'Six Discovery Answers:',
                qaSummary
            ].join('\n\n'),
            useSearch: false
        });

        const parsed = parseJsonFromModelText(raw, PreliminaryDraftSectionsSchema);
        if (parsed) {
            return {
                executiveOverview: stripMarkdownAndHtml(parsed.executiveOverview),
                focus1RegulatoryAuditing: stripMarkdownAndHtml(parsed.focus1RegulatoryAuditing),
                focus2GovernancePolicy: stripMarkdownAndHtml(parsed.focus2GovernancePolicy),
                focus3PrivacyCompliance: stripMarkdownAndHtml(parsed.focus3PrivacyCompliance),
                focus4ThirtyDayRoadmap: stripMarkdownAndHtml(parsed.focus4ThirtyDayRoadmap),
                lowBandwidthRecommendations: stripMarkdownAndHtml(parsed.lowBandwidthRecommendations)
            };
        }

        const ns = session.needsSummary;
        return {
            executiveOverview: [
                `Organization: ${session.clientOrganizationName}`,
                `Regional Context: ${session.regionGroundingSummary}`,
                `Primary Literacy Focus: ${ns?.dailyLiteracyGoals || 'Practical staff and community AI literacy without complex infrastructure.'}`,
                'Note: This preliminary plain-text blueprint gives you immediate actions you can begin today while an AI Foundation specialist refines your final improved advisory document within 24-48 business hours.'
            ].join('\n'),
            focus1RegulatoryAuditing: [
                'Recommended Algorithmic & Quality Checks (You Run Internally):',
                '- Establish a 5-point Accuracy & Cultural Bias Checklist before any AI-generated lesson note or quiz reaches learners.',
                `- Require a named educator or coordinator to sign off on reading level, local terminology, and hallucination checks (${ns?.oversightNeeds || 'human-in-the-loop review'}).`,
                '- Log sample prompts and spot-check monthly for gender, dialect, or rural-urban bias across regional cohorts.'
            ].join('\n'),
            focus2GovernancePolicy: [
                'Recommended AI Governance & Acceptable-Use Policy Rules (You Adopt):',
                '- Publish a clear 1-page Acceptable AI Use Charter covering permitted study support vs. prohibited verbatim submissions.',
                '- Adopt a traffic-light rubric for assessments (Red: closed independent work; Amber: AI brainstorming cited explicitly; Green: supervised AI literacy exercises).',
                '- Nominate one AI Literacy Champion within your team to maintain prompt templates and brief staff quarterly.'
            ].join('\n'),
            focus3PrivacyCompliance: [
                'Privacy Preservation & Learner Safeguards (Step-by-Step Self-Checks):',
                `- Rule Zero: Never paste student full names, IDs, dates of birth, health notes, or account passwords into any public AI chat (${ns?.privacyConstraints || 'zero PII exposure'}).`,
                '- De-identify case examples using generic placeholders ([Learner A], [Regional Cohort]) prior to drafting.',
                '- Configure educator AI tools with training-opt-out/history controls and retain human moderation over all minor-facing resources.'
            ].join('\n'),
            focus4ThirtyDayRoadmap: [
                'Week 1 (Charter & Zero-PII Habits): Ratify 1-page Acceptable Use Policy, apply Traffic-Light rubric, and brief staff on de-identification.',
                'Week 2 (Low-Bandwidth Templates): Organize shared plain-text lesson/rubric prompt templates for mobile or low-data workflows.',
                'Week 3 (Algorithmic Spot Audit & Literacy Workshop): Run one supervised student/community AI verification workshop ("Spot the Hallucination").',
                `Week 4 (Review & Scale): Evaluate time saved against baseline milestone (${ns?.budgetAndTimeline || '30-day target'}) and lock in specialist improvements.`
            ].join('\n'),
            lowBandwidthRecommendations: [
                `Low-Bandwidth Tooling Tailored to Your Connectivity (${ns?.connectivityProfile || 'regional connectivity'}):`,
                '- Draft reusable plain-text prompts in offline Docs or Sheets templates so sessions only sync concise text rather than heavy video/media payloads.',
                '- Use Google Workspace Education privacy settings (managed directly by your own IT lead) to disable external model training on school domains.',
                '- Distribute concise mobile-readable study guides (<100 KB plain text or printable handouts) for areas with intermittent mobile data.'
            ].join('\n')
        };
    }

    function buildPreliminaryTxt(session, sections) {
        const dateStr = formatUtcDate(now());
        const fileName = `PRELIMINARY_Regional_Education_AI_Advisory_${sanitizeBusinessSlug(session.clientOrganizationName)}_${dateStr}.txt`;
        const div = '='.repeat(68);
        const sub = '-'.repeat(68);

        const content = stripMarkdownAndHtml([
            div,
            'AI FOUNDATION - PRELIMINARY CLIENT ADVISORY DRAFT',
            SERVICE_NAME.toUpperCase(),
            div,
            `Organization     : ${session.clientOrganizationName}`,
            `Prepared For     : ${session.userName || session.userEmail || 'Client Organization'}`,
            `Generated (UTC)  : ${dateStr}`,
            `Stripe Session   : ${session.stripeSessionId}`,
            `Status           : Preliminary Draft (Under Superadmin Specialist Review)`,
            'Scope Guarantee  : Purely Advisory - Accesses NOTHING in client LMS, Classroom, or accounts.',
            '',
            sub,
            'EXECUTIVE OVERVIEW & REGIONAL PROFILE',
            sub,
            sections.executiveOverview,
            '',
            sub,
            '1. REGULATORY VERIFICATION & ALGORITHMIC AUDITING (CHECKS FOR YOUR TEAM)',
            sub,
            sections.focus1RegulatoryAuditing,
            '',
            sub,
            '2. ORGANIZATIONAL AI GOVERNANCE POLICY FORMULATION (POLICIES TO ADOPT)',
            sub,
            sections.focus2GovernancePolicy,
            '',
            sub,
            '3. PRIVACY PRESERVATION & COMPLIANCE ASSURANCE (ZERO-PII SAFEGUARDS)',
            sub,
            sections.focus3PrivacyCompliance,
            '',
            sub,
            '4. YOUR 30-DAY REGULATORY & AI LITERACY ROADMAP (WEEK-BY-WEEK)',
            sub,
            sections.focus4ThirtyDayRoadmap,
            '',
            sub,
            '5. LOW-BANDWIDTH TOOL & SUBSIDIZED IMPLEMENTATION RECOMMENDATIONS',
            sub,
            sections.lowBandwidthRecommendations,
            '',
            sub,
            'NEXT STEP: HUMAN SPECIALIST IMPROVEMENT (24-48 BUSINESS HOURS)',
            sub,
            'Your AI Foundation specialist is now conducting deeper public regulatory research and refining this draft into your Final Reviewed Advisory Plan (.txt). You will see it highlighted inside your service portal as soon as it is approved.',
            div
        ].join('\n'));

        return {
            fileName,
            generatedAt: now().toISOString(),
            content
        };
    }

    async function runStage2AsyncResearchAndDispatch(session) {
        const model = process.env.GEMINI_FALLBACK_MODEL || 'gemini-4-hydrogen';
        const qaDigest = session.answers.map(a => `Q${a.step} [${a.topic}]: ${a.answer}`).join('\n\n');

        const systemInstruction = [
            'You are a Senior Regional Education & AI Governance Specialist at AI Foundation.',
            'Run public web research on regional AI governance frameworks applicable to this client:',
            '1) Australian Schools AI Framework, TEQSA Higher-Ed Integrity, ASQA VET standards, and Australian Privacy Principles (APPs)',
            '2) UNESCO AI Competency Frameworks & ASEAN Guide on AI Governance and Ethics',
            '3) Low-bandwidth Google Workspace for Education / offline-tolerant delivery practices',
            'STRICT SCOPE: Purely advisory recommendations for what the client should do internally (zero account access).',
            'Return STRICT JSON ONLY with keys: australianFrameworks, aseanUnescoStandards, lowBandwidthGoogleTools, specialistImprovementChecklist.',
            'Use plain text only (no Markdown, no HTML).'
        ].join('\n');

        const raw = await runGeminiInteraction({
            model,
            systemInstruction,
            input: [
                `Client Organization: ${session.clientOrganizationName}`,
                `Region Context: ${session.regionGroundingSummary}`,
                'Secret-Scrubbed Intake Answers:',
                qaDigest
            ].join('\n\n'),
            useSearch: true
        });

        const parsed = parseJsonFromModelText(raw, AsyncResearchSectionsSchema);
        const research = parsed ? {
            australianFrameworks: stripMarkdownAndHtml(parsed.australianFrameworks),
            aseanUnescoStandards: stripMarkdownAndHtml(parsed.aseanUnescoStandards),
            lowBandwidthGoogleTools: stripMarkdownAndHtml(parsed.lowBandwidthGoogleTools),
            specialistImprovementChecklist: stripMarkdownAndHtml(parsed.specialistImprovementChecklist)
        } : {
            australianFrameworks: 'Cross-check against Australian Framework for Generative AI in Schools (safety, transparency, accountability), TEQSA/ASQA academic integrity verification, and Privacy Act APP 5/11 de-identification practices.',
            aseanUnescoStandards: 'Align community workshops with UNESCO Guidance for Generative AI in Education and ASEAN Guide on AI Governance and Ethics (human oversight, fairness, transparency, local-language inclusion).',
            lowBandwidthGoogleTools: 'Recommend text-first Google Docs/Sheets rubric banks, offline mobile caching, and district-managed Workspace privacy controls rather than bandwidth-heavy video tools.',
            specialistImprovementChecklist: [
                '- Tailor Week 1 charter language to the exact learner age group and regional jurisdiction.',
                '- Expand low-bandwidth offline fallback steps in Section 5 for areas with patchy mobile data.',
                '- Add explicit bias/cultural accuracy verification prompts before releasing final .txt plan.'
            ].join('\n')
        };

        const div = '='.repeat(68);
        const sub = '-'.repeat(68);
        const researchSummary = stripMarkdownAndHtml([
            div,
            'ASYNC PUBLIC REGULATORY RESEARCH BRIEF (FOR SUPERADMIN REVIEW)',
            div,
            `Model Used: ${model}`,
            '',
            sub,
            'AUSTRALIAN FRAMEWORKS (SCHOOLS / TEQSA / ASQA / APPs)',
            sub,
            research.australianFrameworks,
            '',
            sub,
            'ASEAN & UNESCO AI GOVERNANCE STANDARDS',
            sub,
            research.aseanUnescoStandards,
            '',
            sub,
            'LOW-BANDWIDTH GOOGLE & COMMUNITY DELIVERY OPTIONS',
            sub,
            research.lowBandwidthGoogleTools,
            '',
            sub,
            'RECOMMENDED SPECIALIST EDITS BEFORE CLIENT DELIVERY',
            sub,
            research.specialistImprovementChecklist,
            div
        ].join('\n'));

        const reviewId = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const timestamp = now().toISOString();
        const preliminaryTxt = session.preliminaryReport?.content || '';
        const preliminaryFileName = session.preliminaryReport?.fileName || `PRELIMINARY_Regional_Education_AI_Advisory_${sanitizeBusinessSlug(session.clientOrganizationName)}_${formatUtcDate(now())}.txt`;

        const savedReview = await saveReview({
            id: reviewId,
            ...PARTITION_KEY,
            regionalEduSessionId: session.id,
            stripeSessionId: session.stripeSessionId,
            uid: session.uid,
            clientEmail: session.userEmail || '',
            clientOrganizationName: session.clientOrganizationName,
            amountPaidExGstAud: session.amountPaidExGstAud,
            reviewStatus: 'unread_analysis',
            read: false,
            summary: `Regional Education Advisory for ${session.clientOrganizationName} (${session.userEmail || session.uid}) — awaiting SuperAdmin analysis & improved plan approval.`,
            needsSummary: session.needsSummary,
            intakeTranscript: stripMarkdownAndHtml(qaDigest).slice(0, 24000),
            researchSummary,
            preliminaryFileName,
            preliminaryTxtContent: preliminaryTxt,
            workingDraftContent: preliminaryTxt,
            superadminNote: '',
            finalFileName: null,
            finalTxtContent: null,
            approvedAt: null,
            modelUsed: model,
            createdAt: timestamp,
            updatedAt: timestamp
        });

        await saveSession({
            ...session,
            superadminReviewId: savedReview.id,
            updatedAt: now().toISOString()
        });

        try {
            const msgBody = [
                `[Regional Edu Review Needed] ${session.clientOrganizationName}`,
                `Review ID: ${savedReview.id} | Preliminary File: ${preliminaryFileName}`,
                `Stripe Payment: ${session.stripeSessionId} (AUD $${session.amountPaidExGstAud.toFixed(2)} ex GST)`,
                `Client Email: ${session.userEmail || 'N/A'}`,
                '',
                'Research Highlights:',
                research.australianFrameworks.slice(0, 900),
                '',
                'Open SuperAdmin -> Regional Edu Studio to analyse, improve the .txt draft, and send the final reviewed plan back to the client.'
            ].join('\n');
            await firebase.sendChatMessage({
                userId: session.uid,
                userName: `${session.clientOrganizationName} [Regional Edu Review]`,
                userEmail: session.userEmail || 'client@aifoundation.net.au',
                userMessage: msgBody.slice(0, 3900),
                sessionId: session.id,
                pageUrl: '/services.html#admin-regional-edu-studio'
            });
        } catch (msgErr) {
            console.warn('[Regional Edu] SuperAdmin message box dispatch note:', msgErr.message);
        }

        return savedReview;
    }

    async function submitIntakeAnswer({ uid, sessionId, message }) {
        const parsed = RegionalEduChatTurnInputSchema.safeParse({ sessionId, message });
        if (!parsed.success) {
            throw createHttpError(parsed.error.issues[0]?.message || 'Invalid chat input.', 400);
        }

        const session = await getSessionById(parsed.data.sessionId);
        if (!session || session.uid !== uid) {
            throw createHttpError('Regional Education advisory session not found.', 404);
        }
        if (session.paymentStatus !== 'paid') {
            throw createHttpError('Payment must be confirmed before starting advisory intake.', 402);
        }
        if (session.status === 'awaiting_superadmin_improvement' || session.status === 'final_improved_delivered') {
            return { session, redactedWarning: null };
        }

        const { scrubbedText, hadSecrets } = redactSecrets(parsed.data.message);
        const redactedWarning = hadSecrets
            ? 'Security Notice: Potential API key, password, or credential patterns were automatically scrubbed to [REDACTED_SECRET]. This advisory workflow never uses or stores your credentials.'
            : null;

        const step = Math.min(Math.max(session.currentStep || 1, 1), 6);
        const questionMeta = INTAKE_QUESTIONS[step - 1];
        const timestamp = now().toISOString();

        const nextAnswers = session.answers.filter(a => a.step !== step);
        nextAnswers.push({
            step,
            topic: questionMeta.topic,
            question: questionMeta.prompt,
            answer: scrubbedText,
            hadSecrets,
            answeredAt: timestamp
        });
        nextAnswers.sort((a, b) => a.step - b.step);

        const nextMessages = [
            ...session.messages,
            {
                role: 'user',
                step,
                content: scrubbedText,
                createdAt: timestamp
            }
        ];

        let clientOrganizationName = session.clientOrganizationName;
        let regionGroundingSummary = session.regionGroundingSummary;
        if (step === 1) {
            clientOrganizationName = extractOrganizationName(scrubbedText, session.userName);
            regionGroundingSummary = await runStage1RegionSearch(scrubbedText);
        }

        if (step < 6) {
            const assistantReply = await generateStepFollowUp({
                step,
                answer: scrubbedText,
                orgName: clientOrganizationName || 'your organization',
                regionSummary: regionGroundingSummary
            });

            const fullReply = redactedWarning ? `${redactedWarning}\n\n${assistantReply}` : assistantReply;
            nextMessages.push({
                role: 'assistant',
                step: step + 1,
                content: fullReply,
                createdAt: now().toISOString()
            });

            const updated = await saveSession({
                ...session,
                status: 'paid_intake_ready',
                clientOrganizationName,
                regionGroundingSummary,
                currentStep: step + 1,
                answers: nextAnswers,
                messages: nextMessages,
                updatedAt: now().toISOString()
            });

            return { session: updated, redactedWarning };
        }

        // Step 6 finished -> save transient state 'generating_preliminary_draft'
        const needsSummary = buildNeedsSummaryFromAnswers(
            clientOrganizationName || session.userName || 'Community Organization',
            nextAnswers
        );

        const generatingSession = await saveSession({
            ...session,
            clientOrganizationName: needsSummary.organizationName,
            regionGroundingSummary,
            needsSummary,
            currentStep: 6,
            status: 'generating_preliminary_draft',
            answers: nextAnswers,
            messages: nextMessages,
            updatedAt: now().toISOString()
        });

        const sections = await generatePreliminaryAdvisorySections(generatingSession);
        const preliminaryReport = buildPreliminaryTxt(generatingSession, sections);

        const finalLines = [];
        if (redactedWarning) finalLines.push(redactedWarning, '');
        finalLines.push(
            `All 6 needs-discovery questions are complete. Your Preliminary Advisory Draft (${preliminaryReport.fileName}) is ready to download immediately below.`,
            'Status: Under Superadmin Analysis — an AI Foundation specialist is conducting deeper public regulatory checks and will deliver your Final Improved Plan (.txt) back here within 24-48 business hours.'
        );
        const completedMessages = [
            ...nextMessages,
            {
                role: 'assistant',
                step: 6,
                content: finalLines.join('\n\n'),
                createdAt: now().toISOString()
            }
        ];

        const awaitingSession = await saveSession({
            ...generatingSession,
            status: 'awaiting_superadmin_improvement',
            messages: completedMessages,
            preliminaryReport,
            updatedAt: now().toISOString()
        });

        const researchPromise = runStage2AsyncResearchAndDispatch(awaitingSession).catch(err => {
            console.error('[Regional Edu] Async Stage 2 research error:', err);
            return null;
        });
        pendingResearchTasks.add(researchPromise);
        researchPromise.finally(() => pendingResearchTasks.delete(researchPromise));

        return { session: awaitingSession, redactedWarning };
    }

    async function waitForPendingResearch() {
        if (pendingResearchTasks.size === 0) return;
        await Promise.allSettled([...pendingResearchTasks]);
    }

    return {
        getRegionalEduPricing,
        createCheckoutSession,
        confirmCheckoutSession,
        settleCheckoutSession,
        getLatestUserSession,
        getSessionById,
        submitIntakeAnswer,
        listSuperAdminReviews,
        getReviewById,
        markReviewRead,
        saveReviewDraft,
        approveAndDeliverFinalPlan,
        deleteReview,
        waitForPendingResearch
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
    RegionalEduStripeMetadataSchema,
    RegionalEduCheckoutInputSchema,
    RegionalEduConfirmInputSchema,
    RegionalEduChatTurnInputSchema,
    ClientNeedsSummarySchema,
    RegionalEduSessionSchema,
    RegionalEduReviewSchema,
    SuperadminDraftSaveSchema,
    SuperadminImprovedPlanSchema,
    createRegionalEduService
};
