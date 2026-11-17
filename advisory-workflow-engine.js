const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const {
    redactSecrets,
    stripMarkdownAndHtml,
    sanitizeBusinessSlug,
    PARTITION_KEY
} = require('./strategy-plan');

const SAFE_RETURN_PATH_REGEX = /^\/(?!\/)[A-Za-z0-9._~\-/]*$/;

const SuperadminDraftSaveSchema = z.object({
    improvedTxtContent: z.string().trim().min(20, 'Working draft must be at least 20 characters.').max(60000, 'Working draft must stay under 60,000 characters.'),
    superadminNote: z.string().trim().max(4000, 'Superadmin note must stay under 4,000 characters.').optional()
}).strict();

const SuperadminFinalImproveSchema = z.object({
    improvedTxtContent: z.string().trim().min(50, 'Final approved plan must be at least 50 characters.').max(60000, 'Final approved plan must stay under 60,000 characters.'),
    executiveNote: z.string().trim().max(4000, 'Executive note must stay under 4,000 characters.').optional(),
    confirmApprove: z.literal(true)
}).strict();

function createHttpError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

function formatIsoDate(date) {
    return date.toISOString().slice(0, 10);
}

function extractOrganizationName(q1Answer, fallbackName) {
    const firstChunk = String(q1Answer || '')
        .split(/[\n,.!?;]/)[0]
        .replace(/^(?:we are|i am|our clinic is|our university is|our company is|our team is|organization is|org is|at|for)\s+/i, '')
        .trim();
    if (firstChunk.length >= 2 && firstChunk.length <= 80) {
        return firstChunk;
    }
    return String(fallbackName || 'Client Organization').trim().slice(0, 80) || 'Client Organization';
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

function createSharedAdvisorySchemas({
    sessionIdPattern,
    reviewIdPattern,
    stripeKind,
    serviceSlug,
    serviceName,
    serviceType,
    workflow,
    needsSummarySchema
}) {
    const StripeMetadataSchema = z.object({
        tag: z.literal(PARTITION_KEY.tag),
        businessId: z.literal('#aifoundation'),
        businessName: z.literal(PARTITION_KEY.businessName),
        source: z.literal(PARTITION_KEY.source),
        kind: z.literal(stripeKind),
        uid: z.string().min(1).max(128),
        userId: z.string().min(1).max(128),
        serviceSlug: z.literal(serviceSlug),
        serviceName: z.literal(serviceName),
        serviceType: z.literal(serviceType),
        workflow: z.literal(workflow)
    }).strict();

    const CheckoutInputSchema = z.object({
        returnPath: z.string().max(200).regex(SAFE_RETURN_PATH_REGEX, 'Invalid return path.').optional()
    }).strict();

    const ConfirmInputSchema = z.object({
        sessionId: z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9_-]+$/, 'Invalid checkout session ID.')
    }).strict();

    const ChatTurnInputSchema = z.object({
        sessionId: z.string().trim().regex(sessionIdPattern, 'Invalid advisory session ID.'),
        message: z.string().trim().min(2, 'Please enter a short answer (at least 2 characters).').max(4000, 'Please keep each answer under 4,000 characters.')
    }).strict();

    const AnswerSchema = z.object({
        step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
        topic: z.string().min(1).max(160),
        question: z.string().min(1).max(1200),
        answer: z.string().min(1).max(4000),
        hadSecrets: z.boolean(),
        answeredAt: z.string().min(1)
    }).strict();

    const MessageSchema = z.object({
        role: z.enum(['assistant', 'user']),
        step: z.number().int().min(1).max(6),
        content: z.string().min(1).max(8000),
        createdAt: z.string().min(1)
    }).strict();

    const DeliverableSchema = z.object({
        fileName: z.string().min(1).max(220),
        generatedAt: z.string().min(1),
        content: z.string().min(1).max(80000)
    }).strict();

    const SessionSchema = z.object({
        id: z.string().regex(sessionIdPattern),
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
        sectorOrWorkflowTag: z.string().max(160),
        groundingSummary: z.string().max(4000),
        needsSummary: needsSummarySchema.nullable(),
        answers: z.array(AnswerSchema).max(6),
        messages: z.array(MessageSchema).max(30),
        preliminaryReport: DeliverableSchema.nullable(),
        finalImprovedReport: DeliverableSchema.nullable(),
        superadminExecutiveNote: z.string().max(4000),
        superadminReviewId: z.string().nullable(),
        reviewedByUid: z.string().max(128).nullable(),
        superadminApprovedAt: z.string().nullable(),
        createdAt: z.string().min(1),
        updatedAt: z.string().min(1)
    }).strict();

    const ReviewSchema = z.object({
        id: z.string().regex(reviewIdPattern),
        tag: z.literal(PARTITION_KEY.tag),
        businessId: z.enum(['#aifoundation', 'aifoundation']),
        businessName: z.literal(PARTITION_KEY.businessName),
        source: z.literal(PARTITION_KEY.source),
        advisorySessionId: z.string().regex(sessionIdPattern),
        stripeSessionId: z.string().min(1).max(200),
        uid: z.string().min(1).max(128),
        clientEmail: z.string().max(320),
        clientOrganizationName: z.string().max(200),
        sectorOrWorkflowTag: z.string().max(160),
        amountPaidExGstAud: z.number().nonnegative(),
        reviewStatus: z.enum(['unread_analysis', 'in_review_editing', 'final_improved_delivered']),
        read: z.boolean(),
        subject: z.string().min(1).max(300),
        summary: z.string().min(1).max(2000),
        needsSummary: needsSummarySchema.nullable(),
        intakeTranscript: z.string().min(1).max(25000),
        researchSummary: z.string().min(1).max(25000),
        preliminaryFileName: z.string().min(1).max(220),
        preliminaryTxtContent: z.string().min(1).max(80000),
        workingDraftContent: z.string().min(1).max(80000),
        superadminNote: z.string().max(4000),
        finalFileName: z.string().max(220).nullable(),
        finalTxtContent: z.string().max(80000).nullable(),
        reviewedByUid: z.string().max(128).nullable(),
        reviewedAt: z.string().max(64).nullable(),
        approvedAt: z.string().nullable(),
        modelUsed: z.string().min(1).max(100),
        createdAt: z.string().min(1),
        updatedAt: z.string().min(1)
    }).strict();

    return {
        StripeMetadataSchema,
        CheckoutInputSchema,
        ConfirmInputSchema,
        ChatTurnInputSchema,
        AnswerSchema,
        MessageSchema,
        DeliverableSchema,
        SessionSchema,
        ReviewSchema
    };
}

/**
 * Parameterized engine backing paid zero-access advisory services (Stripe AUD gate ->
 * 6-step search-grounded intake -> preliminary TXT -> async research + SuperAdmin studio).
 */
function createAdvisoryWorkflowEngine(config, options = {}) {
    const firebase = options.firebase || require('./firebase-service');
    const getStripe = options.getStripe || (() => null);
    const getServicePrices = options.getServicePrices || (async () => ({ prices: {} }));
    const sessionsFilePath = options.sessionsFilePath || config.defaultSessionsFile;
    const reviewsFilePath = options.reviewsFilePath || config.defaultReviewsFile;
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
            console.warn(`[${config.logLabel}] Could not initialize @google/genai:`, e.message);
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
            console.warn(`[${config.logLabel}] Could not write local copy ${filePath}:`, e.message);
        }
    }

    async function saveSession(session) {
        const validated = config.schemas.SessionSchema.parse(session);
        const map = readJsonMap(sessionsFilePath);
        map[validated.id] = validated;
        writeJsonMap(sessionsFilePath, map);
        try {
            await firebase.writeDocument(config.sessionsCollection, validated.id, validated, true);
        } catch (e) {
            console.warn(`[${config.logLabel}] Firestore session save fallback:`, e.message);
        }
        return validated;
    }

    async function getSessionById(sessionId) {
        if (!config.sessionIdPattern.test(String(sessionId || ''))) return null;
        try {
            const doc = await firebase.getDocument(config.sessionsCollection, sessionId);
            const parsed = config.schemas.SessionSchema.safeParse(doc);
            if (parsed.success) return parsed.data;
        } catch {
            // Fall through to local copy
        }
        const local = readJsonMap(sessionsFilePath)[sessionId];
        const parsed = config.schemas.SessionSchema.safeParse(local);
        return parsed.success ? parsed.data : null;
    }

    async function listSessionsForUser(uid) {
        const byId = new Map();
        const localMap = readJsonMap(sessionsFilePath);
        for (const item of Object.values(localMap)) {
            if (item && item.uid === uid) {
                const parsed = config.schemas.SessionSchema.safeParse(item);
                if (parsed.success) byId.set(parsed.data.id, parsed.data);
            }
        }
        try {
            const docs = await firebase.listDocuments(config.sessionsCollection);
            if (Array.isArray(docs)) {
                for (const d of docs) {
                    if (d.fields && d.fields.uid === uid) {
                        const parsed = config.schemas.SessionSchema.safeParse(d.fields);
                        if (parsed.success) byId.set(parsed.data.id, parsed.data);
                    }
                }
            }
        } catch (e) {
            console.warn(`[${config.logLabel}] Firestore session list note:`, e.message);
        }
        return [...byId.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    async function saveReview(review) {
        const validated = config.schemas.ReviewSchema.parse(review);
        const map = readJsonMap(reviewsFilePath);
        map[validated.id] = validated;
        writeJsonMap(reviewsFilePath, map);
        try {
            await firebase.writeDocument(config.reviewsCollection, validated.id, validated, true);
        } catch (e) {
            console.warn(`[${config.logLabel}] Firestore review save fallback:`, e.message);
        }
        return validated;
    }

    async function getReviewById(reviewId) {
        if (!config.reviewIdPattern.test(String(reviewId || ''))) return null;
        try {
            const doc = await firebase.getDocument(config.reviewsCollection, reviewId);
            const parsed = config.schemas.ReviewSchema.safeParse(doc);
            if (parsed.success) return parsed.data;
        } catch {
            // Fall through to local copy
        }
        const local = readJsonMap(reviewsFilePath)[reviewId];
        const parsed = config.schemas.ReviewSchema.safeParse(local);
        return parsed.success ? parsed.data : null;
    }

    async function listSuperAdminReviews() {
        const byId = new Map();
        const localMap = readJsonMap(reviewsFilePath);
        for (const item of Object.values(localMap)) {
            const parsed = config.schemas.ReviewSchema.safeParse(item);
            if (parsed.success) byId.set(parsed.data.id, parsed.data);
        }
        try {
            const docs = await firebase.listDocuments(config.reviewsCollection);
            if (Array.isArray(docs)) {
                for (const d of docs) {
                    const parsed = config.schemas.ReviewSchema.safeParse(d.fields);
                    if (parsed.success) byId.set(parsed.data.id, parsed.data);
                }
            }
        } catch (e) {
            console.warn(`[${config.logLabel}] Firestore review list note:`, e.message);
        }
        const reviews = [...byId.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const unreadCount = reviews.filter(r => !r.read).length;
        return { reviews, unreadCount };
    }

    async function markReviewRead(reviewId) {
        const review = await getReviewById(reviewId);
        if (!review) throw createHttpError(`${config.logLabel} review record not found.`, 404);
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
        if (!config.reviewIdPattern.test(String(reviewId || ''))) {
            throw createHttpError(`Invalid ${config.logLabel} review ID.`, 400);
        }
        const parsed = SuperadminDraftSaveSchema.safeParse(input);
        if (!parsed.success) {
            throw createHttpError(parsed.error.issues[0]?.message || 'Invalid draft payload.', 400);
        }
        const review = await getReviewById(reviewId);
        if (!review) throw createHttpError(`${config.logLabel} review record not found.`, 404);

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
        if (!config.reviewIdPattern.test(String(reviewId || ''))) {
            throw createHttpError(`Invalid ${config.logLabel} review ID.`, 400);
        }
        const parsed = SuperadminFinalImproveSchema.safeParse(input);
        if (!parsed.success) {
            throw createHttpError(parsed.error.issues[0]?.message || 'Confirmation and valid final TXT content are required.', 400);
        }
        const review = await getReviewById(reviewId);
        if (!review) throw createHttpError(`${config.logLabel} review record not found.`, 404);

        const timestamp = now().toISOString();
        const dateStr = formatIsoDate(now());
        const slug = sanitizeBusinessSlug(review.clientOrganizationName);
        const finalFileName = `${config.finalFilePrefix}_${slug}_${dateStr}.txt`;

        const { scrubbedText: cleanTxt } = redactSecrets(stripMarkdownAndHtml(parsed.data.improvedTxtContent));
        const { scrubbedText: cleanNote } = redactSecrets(stripMarkdownAndHtml(parsed.data.executiveNote || review.superadminNote || ''));

        const div = '='.repeat(68);
        const finalHeader = stripMarkdownAndHtml([
            div,
            config.finalBannerTitle,
            config.serviceName.toUpperCase(),
            div,
            `Organization       : ${review.clientOrganizationName}`,
            `Final Approved UTC : ${timestamp}`,
            `Reviewed By        : ${adminUser.email || adminUser.name || 'AI Foundation SuperAdmin Architect'}`,
            'Scope Notice       : Purely Client Advisory - Zero external system or data access.',
            cleanNote ? `Executive Counsel  : ${cleanNote}` : '',
            div,
            ''
        ].filter(Boolean).join('\n'));

        const finalBody = cleanTxt.includes(config.finalBannerTitle)
            ? cleanTxt
            : `${finalHeader}\n${cleanTxt}`;

        const finalDeliverable = {
            fileName: finalFileName,
            generatedAt: timestamp,
            content: finalBody
        };

        const reviewerUid = typeof adminUser.uid === 'string' && adminUser.uid.trim()
            ? adminUser.uid.trim().slice(0, 128)
            : 'superadmin';

        const updatedReview = await saveReview({
            ...review,
            read: true,
            reviewStatus: 'final_improved_delivered',
            workingDraftContent: finalBody,
            superadminNote: cleanNote.slice(0, 4000),
            finalFileName,
            finalTxtContent: finalBody,
            reviewedByUid: reviewerUid,
            reviewedAt: timestamp,
            approvedAt: timestamp,
            updatedAt: timestamp
        });

        const session = await getSessionById(review.advisorySessionId);
        let updatedSession = session;
        if (session) {
            const clientNotice = [
                `Final Advisory Plan Delivered: Your ${config.serviceName} blueprint has been reviewed and upgraded by an AI Foundation Lead Architect.`,
                `Final File Ready: ${finalFileName}`,
                cleanNote ? `Executive Counsel Note: ${cleanNote}` : 'You can download your Final Vetted TXT Advisory Plan below.'
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
                reviewedByUid: reviewerUid,
                superadminApprovedAt: timestamp,
                messages: nextMessages,
                updatedAt: timestamp
            });
        }

        try {
            const msgBody = [
                `[Final Plan Delivered] ${review.clientOrganizationName}`,
                `Review ID: ${review.id} | File: ${finalFileName}`,
                `Client Email: ${review.clientEmail || 'N/A'}`,
                cleanNote ? `Executive Counsel Note: ${cleanNote.slice(0, 800)}` : 'Status: Approved and unlocked for client download.'
            ].join('\n');
            await firebase.sendChatMessage({
                userId: review.uid,
                userName: `${review.clientOrganizationName} [Final Plan Ready]`,
                userEmail: review.clientEmail || 'client@aifoundation.net.au',
                userMessage: msgBody.slice(0, 3900),
                sessionId: review.advisorySessionId,
                pageUrl: config.adminPageUrl
            });
        } catch (msgErr) {
            console.warn(`[${config.logLabel}] Chat delivery notification note:`, msgErr.message);
        }

        return { review: updatedReview, session: updatedSession };
    }

    async function deleteReview(reviewId, { confirmed = false } = {}) {
        if (!config.reviewIdPattern.test(String(reviewId || ''))) {
            throw createHttpError(`Invalid ${config.logLabel} review ID.`, 400);
        }
        if (confirmed !== true) {
            throw createHttpError(`Please confirm deletion before removing this ${config.logLabel} review.`, 400);
        }
        const existing = await getReviewById(reviewId);
        if (!existing) {
            throw createHttpError(`${config.logLabel} review record not found.`, 404);
        }
        const map = readJsonMap(reviewsFilePath);
        delete map[reviewId];
        writeJsonMap(reviewsFilePath, map);
        try {
            await firebase.deleteDocument(config.reviewsCollection, reviewId);
        } catch (e) {
            console.warn(`[${config.logLabel}] Firestore review delete note:`, e.message);
        }
        return { success: true, id: reviewId };
    }

    async function getPricing() {
        let exGstCents = Number(process.env[config.priceEnvVar]) || config.defaultPriceAudCents;
        try {
            const saved = await getServicePrices();
            const audAmount = config.readAudPriceFromStore(saved);
            if (typeof audAmount === 'number' && Number.isFinite(audAmount) && audAmount > 0) {
                exGstCents = Math.round(audAmount * 100);
            }
        } catch {
            // Keep env/default fallback
        }
        if (!Number.isInteger(exGstCents) || exGstCents < 100) {
            exGstCents = config.defaultPriceAudCents;
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
            console.warn(`[${config.logLabel}] Gemini call (${model}) fell back:`, e.message);
            return null;
        }
    }

    async function createCheckoutSession({ user, origin, returnPath = '/' }) {
        config.schemas.CheckoutInputSchema.parse({ returnPath });
        const stripe = getStripe();
        if (!stripe) {
            throw createHttpError('Card payments are not configured yet. Please try again later.', 503);
        }

        const safeReturnPath = typeof returnPath === 'string' && SAFE_RETURN_PATH_REGEX.test(returnPath)
            ? returnPath
            : '/';

        const pricing = await getPricing();
        const metadata = config.schemas.StripeMetadataSchema.parse({
            tag: PARTITION_KEY.tag,
            businessId: '#aifoundation',
            businessName: PARTITION_KEY.businessName,
            source: PARTITION_KEY.source,
            kind: config.stripeKind,
            uid: user.uid,
            userId: user.uid,
            serviceSlug: config.serviceSlug,
            serviceName: config.serviceName,
            serviceType: config.serviceType,
            workflow: config.workflow
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
                        name: config.serviceName,
                        description: config.checkoutDescription
                    }
                }
            }],
            customer_email: user.email || undefined,
            client_reference_id: user.uid,
            metadata,
            payment_intent_data: { metadata },
            success_url: `${origin}${safeReturnPath}?${config.returnQueryKey}=success&session_id={CHECKOUT_SESSION_ID}#services2`,
            cancel_url: `${origin}${safeReturnPath}?${config.returnQueryKey}=cancelled#services2`
        });

        const timestamp = now().toISOString();
        const sessionId = `${config.sessionPrefix}${stripeSession.id}`;
        await saveSession({
            id: sessionId,
            tag: PARTITION_KEY.tag,
            businessId: '#aifoundation',
            businessName: PARTITION_KEY.businessName,
            source: PARTITION_KEY.source,
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
            sectorOrWorkflowTag: '',
            groundingSummary: '',
            needsSummary: null,
            answers: [],
            messages: [],
            preliminaryReport: null,
            finalImprovedReport: null,
            superadminExecutiveNote: '',
            superadminReviewId: null,
            reviewedByUid: null,
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
                paymentType: config.serviceType,
                status: 'initiated',
                description: `${config.serviceName} (AUD $${pricing.exGstAud.toFixed(2)} ex GST)`,
                originUrl: `${origin}${safeReturnPath}`,
                customerEmail: user.email || '',
                customerName: user.name || '',
                metadata: { userId: user.uid, serviceType: config.serviceType, businessId: '#aifoundation' }
            });
        } catch (fbErr) {
            console.warn(`[${config.logLabel}] Transaction log note:`, fbErr.message);
        }

        return { url: stripeSession.url, sessionId, stripeSessionId: stripeSession.id, pricing };
    }

    async function unlockPaidCheckout(stripeSession) {
        if (!stripeSession || stripeSession.metadata?.kind !== config.stripeKind) {
            return null;
        }
        if (stripeSession.payment_status !== 'paid') {
            return null;
        }

        const sessionId = `${config.sessionPrefix}${stripeSession.id}`;
        const existing = await getSessionById(sessionId);
        if (existing && existing.paymentStatus === 'paid') {
            return existing;
        }

        const timestamp = now().toISOString();
        const uid = existing?.uid || stripeSession.metadata?.uid || stripeSession.metadata?.userId || stripeSession.client_reference_id;
        if (!uid) {
            throw createHttpError('Checkout session is missing user identity.', 400);
        }

        const amountExGstAud = existing?.amountPaidExGstAud || ((stripeSession.amount_subtotal || stripeSession.amount_total || config.defaultPriceAudCents) / 100);
        const introMessage = {
            role: 'assistant',
            step: 1,
            createdAt: timestamp,
            content: [
                config.introWelcomeLine,
                config.introPrivacyLine,
                '',
                config.questions[0].prompt
            ].join('\n')
        };

        const unlocked = await saveSession({
            id: sessionId,
            tag: PARTITION_KEY.tag,
            businessId: '#aifoundation',
            businessName: PARTITION_KEY.businessName,
            source: PARTITION_KEY.source,
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
            sectorOrWorkflowTag: existing?.sectorOrWorkflowTag || '',
            groundingSummary: existing?.groundingSummary || '',
            needsSummary: existing?.needsSummary || null,
            answers: existing?.answers || [],
            messages: existing?.messages?.length ? existing.messages : [introMessage],
            preliminaryReport: existing?.preliminaryReport || null,
            finalImprovedReport: existing?.finalImprovedReport || null,
            superadminExecutiveNote: existing?.superadminExecutiveNote || '',
            superadminReviewId: existing?.superadminReviewId || null,
            reviewedByUid: existing?.reviewedByUid || null,
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
            console.warn(`[${config.logLabel}] Transaction status update note:`, e.message);
        }

        return unlocked;
    }

    async function confirmCheckoutSession({ uid, sessionId }) {
        const parsed = config.schemas.ConfirmInputSchema.safeParse({ sessionId });
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
        if (!stripeSession || stripeSession.metadata?.kind !== config.stripeKind || stripeSession.metadata?.uid !== uid) {
            throw createHttpError('Checkout session not found for this account.', 404);
        }
        if (stripeSession.payment_status !== 'paid') {
            return await getSessionById(`${config.sessionPrefix}${stripeSession.id}`);
        }
        return unlockPaidCheckout(stripeSession);
    }

    async function handleWebhookEvent(event) {
        if (!event || event.type !== 'checkout.session.completed') {
            return { handled: false };
        }
        const session = event.data?.object;
        if (!session || session.metadata?.kind !== config.stripeKind) {
            return { handled: false };
        }
        const unlocked = await unlockPaidCheckout(session);
        return { handled: true, sessionId: unlocked?.id || null };
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

    async function runStage2AsyncResearchAndDispatch(session) {
        const model = process.env.GEMINI_FALLBACK_MODEL || 'gemini-4-hydrogen';
        const qaDigest = session.answers.map(a => `Q${a.step} [${a.topic}]: ${a.answer}`).join('\n\n');

        const { researchSummary, reviewSubject, chatSummaryLine } = await config.generateAsyncResearch({
            session,
            qaDigest,
            model,
            runGeminiInteraction,
            parseJsonFromModelText,
            stripMarkdownAndHtml
        });

        const reviewId = `${config.reviewPrefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const timestamp = now().toISOString();
        const preliminaryTxt = session.preliminaryReport?.content || '';
        const preliminaryFileName = session.preliminaryReport?.fileName || `${config.preliminaryFilePrefix}_${sanitizeBusinessSlug(session.clientOrganizationName)}_${formatIsoDate(now())}.txt`;

        const savedReview = await saveReview({
            id: reviewId,
            tag: PARTITION_KEY.tag,
            businessId: '#aifoundation',
            businessName: PARTITION_KEY.businessName,
            source: PARTITION_KEY.source,
            advisorySessionId: session.id,
            stripeSessionId: session.stripeSessionId,
            uid: session.uid,
            clientEmail: session.userEmail || '',
            clientOrganizationName: session.clientOrganizationName,
            sectorOrWorkflowTag: session.sectorOrWorkflowTag,
            amountPaidExGstAud: session.amountPaidExGstAud,
            reviewStatus: 'unread_analysis',
            read: false,
            subject: stripMarkdownAndHtml(reviewSubject).slice(0, 290),
            summary: `${config.serviceName} for ${session.clientOrganizationName} (${session.userEmail || session.uid}) — awaiting SuperAdmin analysis & improved plan approval.`,
            needsSummary: session.needsSummary,
            intakeTranscript: stripMarkdownAndHtml(qaDigest).slice(0, 24000),
            researchSummary: stripMarkdownAndHtml(researchSummary).slice(0, 24000),
            preliminaryFileName,
            preliminaryTxtContent: preliminaryTxt,
            workingDraftContent: preliminaryTxt,
            superadminNote: '',
            finalFileName: null,
            finalTxtContent: null,
            reviewedByUid: null,
            reviewedAt: null,
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
                reviewSubject,
                `Review ID: ${savedReview.id} | Preliminary File: ${preliminaryFileName}`,
                `Stripe Payment: ${session.stripeSessionId} (AUD $${session.amountPaidExGstAud.toFixed(2)} ex GST)`,
                `Client Email: ${session.userEmail || 'N/A'}`,
                '',
                chatSummaryLine,
                '',
                `Open SuperAdmin -> ${config.studioLabel} to analyse, refine the .txt draft, and send the final reviewed plan to the client.`
            ].join('\n');
            await firebase.sendChatMessage({
                userId: session.uid,
                userName: `${session.clientOrganizationName} [${config.studioLabel}]`,
                userEmail: session.userEmail || 'client@aifoundation.net.au',
                userMessage: msgBody.slice(0, 3900),
                sessionId: session.id,
                pageUrl: config.adminPageUrl
            });
        } catch (msgErr) {
            console.warn(`[${config.logLabel}] SuperAdmin chat dispatch note:`, msgErr.message);
        }

        return savedReview;
    }

    async function submitIntakeAnswer({ uid, sessionId, message }) {
        const parsed = config.schemas.ChatTurnInputSchema.safeParse({ sessionId, message });
        if (!parsed.success) {
            throw createHttpError(parsed.error.issues[0]?.message || 'Invalid plain-text consultation input.', 400);
        }

        const session = await getSessionById(parsed.data.sessionId);
        if (!session || session.uid !== uid) {
            throw createHttpError(`${config.logLabel} session not found.`, 404);
        }
        if (session.paymentStatus !== 'paid') {
            throw createHttpError('Payment must be confirmed before starting advisory scoping.', 402);
        }
        if (session.status === 'awaiting_superadmin_improvement' || session.status === 'final_improved_delivered') {
            return { session, redactedWarning: null };
        }

        const { scrubbedText, hadSecrets } = redactSecrets(parsed.data.message);
        const redactedWarning = hadSecrets
            ? 'Security Notice: Potential API key, password, or credential patterns were automatically scrubbed to [REDACTED_SECRET]. This advisory workflow never uses or stores your credentials.'
            : null;

        const step = Math.min(Math.max(session.currentStep || 1, 1), 6);
        const questionMeta = config.questions[step - 1];
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
        let sectorOrWorkflowTag = session.sectorOrWorkflowTag;
        let groundingSummary = session.groundingSummary;

        if (step === 1) {
            clientOrganizationName = extractOrganizationName(scrubbedText, session.userName);
            sectorOrWorkflowTag = config.extractSectorOrTag(scrubbedText);
            groundingSummary = await config.runStage1Grounding({
                q1Answer: scrubbedText,
                runGeminiInteraction,
                stripMarkdownAndHtml
            });
        }

        if (step < 6) {
            const assistantReply = await config.generateStepFollowUp({
                step,
                answer: scrubbedText,
                orgName: clientOrganizationName || 'your organization',
                groundingSummary,
                nextQuestion: config.questions[step],
                questionTopic: questionMeta.topic,
                runGeminiInteraction,
                stripMarkdownAndHtml
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
                sectorOrWorkflowTag,
                groundingSummary,
                currentStep: step + 1,
                answers: nextAnswers,
                messages: nextMessages,
                updatedAt: now().toISOString()
            });

            return { session: updated, redactedWarning };
        }

        const needsSummary = config.buildNeedsSummary(
            clientOrganizationName || session.userName || 'Client Organization',
            sectorOrWorkflowTag,
            nextAnswers
        );

        const generatingSession = await saveSession({
            ...session,
            clientOrganizationName: needsSummary.organizationName,
            sectorOrWorkflowTag,
            groundingSummary,
            needsSummary,
            currentStep: 6,
            status: 'generating_preliminary_draft',
            answers: nextAnswers,
            messages: nextMessages,
            updatedAt: now().toISOString()
        });

        const dateStr = formatIsoDate(now());
        const slug = sanitizeBusinessSlug(generatingSession.clientOrganizationName);
        const preliminaryFileName = `${config.preliminaryFilePrefix}_${slug}_${dateStr}.txt`;

        const preliminaryContent = await config.generatePreliminaryTxt({
            session: generatingSession,
            dateStr,
            runGeminiInteraction,
            parseJsonFromModelText,
            stripMarkdownAndHtml
        });

        const preliminaryReport = {
            fileName: preliminaryFileName,
            generatedAt: now().toISOString(),
            content: preliminaryContent
        };

        const finalLines = [];
        if (redactedWarning) finalLines.push(redactedWarning, '');
        finalLines.push(
            `All 6 scoping questions are complete. Your Preliminary Advisory Draft (${preliminaryReport.fileName}) is ready to download immediately below.`,
            'Status: Under Superadmin Analysis — an AI Foundation Lead Architect is verifying live public compliance/vendor benchmarks and will deliver your Final Improved Plan (.txt) here within 24-48 business hours.'
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
            console.error(`[${config.logLabel}] Async Stage 2 research error:`, err);
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
        getPricing,
        createCheckoutSession,
        confirmCheckoutSession,
        handleWebhookEvent,
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
    SuperadminDraftSaveSchema,
    SuperadminFinalImproveSchema,
    createSharedAdvisorySchemas,
    createAdvisoryWorkflowEngine
};
