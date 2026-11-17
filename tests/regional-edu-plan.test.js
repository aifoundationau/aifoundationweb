const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    RegionalEduChatTurnInputSchema,
    SuperadminImprovedPlanSchema,
    createRegionalEduService
} = require('../regional-edu-plan');

function createTempPaths() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-found-regedu-'));
    return {
        dir,
        sessionsFilePath: path.join(dir, 'regional-edu-sessions.json'),
        reviewsFilePath: path.join(dir, 'regional-edu-reviews.json')
    };
}

function createFakeFirebase() {
    const store = new Map();
    const sentMessages = [];
    const transactions = [];
    return {
        sentMessages,
        transactions,
        async writeDocument(collection, docId, data) {
            store.set(`${collection}/${docId}`, JSON.parse(JSON.stringify(data)));
            return { ok: true };
        },
        async getDocument(collection, docId) {
            const val = store.get(`${collection}/${docId}`);
            return val ? JSON.parse(JSON.stringify(val)) : null;
        },
        async listDocuments(collection) {
            const items = [];
            for (const [k, v] of store.entries()) {
                if (k.startsWith(`${collection}/`)) {
                    items.push({ fields: JSON.parse(JSON.stringify(v)) });
                }
            }
            return items;
        },
        async deleteDocument(collection, docId) {
            store.delete(`${collection}/${docId}`);
            return { ok: true };
        },
        async recordTransaction(tx) {
            transactions.push({ ...tx });
            return { id: tx.transactionId };
        },
        async updateTransactionStatus(txId, status, extra) {
            transactions.push({ txId, status, ...extra });
            return { ok: true };
        },
        async sendChatMessage(msg) {
            sentMessages.push({ ...msg });
            return { id: `msg_${sentMessages.length}` };
        }
    };
}

test('Secret redaction and strict Zod input validation reject file uploads and mask keys', () => {
    const valid = RegionalEduChatTurnInputSchema.safeParse({
        sessionId: 'regedu_cs_test_123456',
        message: 'We serve 240 learners across regional Queensland.'
    });
    assert.equal(valid.success, true);

    const rejectedExtra = RegionalEduChatTurnInputSchema.safeParse({
        sessionId: 'regedu_cs_test_123456',
        message: 'Attached spreadsheet of learners',
        file: { name: 'students.csv' }
    });
    assert.equal(rejectedExtra.success, false);

    const invalidApprove = SuperadminImprovedPlanSchema.safeParse({
        improvedTxtContent: 'Improved plan text that meets length minimum for plain text deliverables in Australia.',
        confirmApprove: false
    });
    assert.equal(invalidApprove.success, false);
});

test('Stripe AUD ex-GST checkout with promo codes unlocks session to paid_intake_ready', async () => {
    const tmp = createTempPaths();
    const firebase = createFakeFirebase();
    let lastCreatePayload = null;
    const stripeSessions = new Map();

    const fakeStripe = {
        checkout: {
            sessions: {
                async create(payload) {
                    lastCreatePayload = payload;
                    const created = {
                        id: 'cs_test_regedu_001',
                        url: 'https://checkout.stripe.test/session/cs_test_regedu_001',
                        payment_status: 'unpaid',
                        metadata: payload.metadata,
                        customer_email: payload.customer_email,
                        client_reference_id: payload.client_reference_id,
                        amount_subtotal: payload.line_items[0].price_data.unit_amount
                    };
                    stripeSessions.set(created.id, created);
                    return created;
                },
                async retrieve(id) {
                    return stripeSessions.get(id);
                }
            }
        }
    };

    try {
        // Default fallback pricing ($199.00 AUD ex GST = 19900 cents)
        const serviceDefault = createRegionalEduService({
            firebase,
            getStripe: () => fakeStripe,
            getServicePrices: async () => ({ prices: {} }),
            ...tmp
        });
        const quoteDefault = await serviceDefault.getRegionalEduPricing();
        assert.equal(quoteDefault.exGstCents, 19900);
        assert.equal(quoteDefault.currency, 'AUD');

        // Dynamic regulatory-roadmap AUD pricing override
        const serviceOverride = createRegionalEduService({
            firebase,
            getStripe: () => fakeStripe,
            getServicePrices: async () => ({ prices: { 'regulatory-roadmap': { price: { aud: 245 } } } }),
            ...tmp
        });
        const checkout = await serviceOverride.createCheckoutSession({
            user: { uid: 'user_regedu_1', email: 'coord@regional.org.au', name: 'Sam Coordinator' },
            origin: 'https://www.aifoundation.net.au',
            returnPath: '/'
        });

        assert.equal(lastCreatePayload.currency, 'aud');
        assert.equal(lastCreatePayload.automatic_tax.enabled, true);
        assert.equal(lastCreatePayload.allow_promotion_codes, true);
        assert.equal(lastCreatePayload.invoice_creation.enabled, true);
        assert.equal(lastCreatePayload.line_items[0].price_data.tax_behavior, 'exclusive');
        assert.equal(lastCreatePayload.line_items[0].price_data.unit_amount, 24500);
        assert.equal(lastCreatePayload.metadata.businessId, '#aifoundation');
        assert.equal(lastCreatePayload.metadata.serviceSlug, 'regulatory-roadmap');

        // Confirm endpoint unlocks when Stripe marks paid
        const stored = stripeSessions.get(checkout.stripeSessionId);
        stored.payment_status = 'paid';
        const confirmed = await serviceOverride.confirmCheckoutSession({
            uid: 'user_regedu_1',
            sessionId: checkout.stripeSessionId
        });
        assert.equal(confirmed.status, 'paid_intake_ready');
        assert.equal(confirmed.paymentStatus, 'paid');
        assert.equal(confirmed.currentStep, 1);
    } finally {
        fs.rmSync(tmp.dir, { recursive: true, force: true });
    }
});

test('Full 6-step AI discovery -> preliminary TXT -> async research -> SuperAdmin studio draft/approve/delete', async () => {
    const tmp = createTempPaths();
    const firebase = createFakeFirebase();
    const stripeSessions = new Map();
    const aiCalls = [];

    const mockAiClient = {
        interactions: {
            async create(payload) {
                aiCalls.push(payload);
                const sys = String(payload.system_instruction || '');
                if (sys.includes('brief public web search') || sys.includes('Public web search') || sys.includes('regional Australia and Southeast Asia')) {
                    return { output_text: 'Regional schools across Gippsland face intermittent broadband on buses and shared Chromebooks.' };
                }
                if (sys.includes('Exact Next Question')) {
                    const match = payload.input.match(/Exact Next Question to Ask:\s*(.+)$/m);
                    return { output_text: `Got it, thanks!\n\n${match ? match[1] : 'Next question'}` };
                }
                if (sys.includes('preliminary plain-text advisory plan')) {
                    return {
                        output_text: JSON.stringify({
                            executiveOverview: 'Tailored zero-access advisory plan for Gippsland Community Hub teachers and teen learners.',
                            focus1RegulatoryAuditing: 'Run weekly spot checks on AI lesson accuracy and rural cultural relevance.',
                            focus2GovernancePolicy: 'Adopt a plain-language 1-page Traffic-Light Acceptable AI Use policy.',
                            focus3PrivacyCompliance: 'Keep all student names out of public AI tools using generic placeholders.',
                            focus4ThirtyDayRoadmap: 'Week 1 Charter; Week 2 Offline templates; Week 3 Spot audit; Week 4 Evaluation.',
                            lowBandwidthRecommendations: 'Use plain-text Docs prompt templates synced during morning Wi-Fi windows.'
                        })
                    };
                }
                return {
                    output_text: JSON.stringify({
                        australianFrameworks: 'Align with Australian Framework for Generative AI in Schools and Privacy Act APP 11.',
                        aseanUnescoStandards: 'Incorporate UNESCO human-agency and fairness guardrails.',
                        lowBandwidthGoogleTools: 'Enable Google Workspace Education data privacy controls internally.',
                        specialistImprovementChecklist: 'Highlight downloadable offline prompt packs for regional educators.'
                    })
                };
            }
        }
    };

    const fakeStripe = {
        checkout: {
            sessions: {
                async create(payload) {
                    const s = {
                        id: 'cs_test_full_999',
                        url: 'https://checkout.stripe.test/cs_test_full_999',
                        payment_status: 'paid',
                        metadata: payload.metadata,
                        customer_email: payload.customer_email,
                        client_reference_id: payload.client_reference_id,
                        amount_subtotal: payload.line_items[0].price_data.unit_amount
                    };
                    stripeSessions.set(s.id, s);
                    return s;
                },
                async retrieve(id) {
                    return stripeSessions.get(id);
                }
            }
        }
    };

    try {
        const service = createRegionalEduService({
            firebase,
            getStripe: () => fakeStripe,
            aiClient: mockAiClient,
            ...tmp
        });

        const checkout = await service.createCheckoutSession({
            user: { uid: 'uid_educator_9', email: 'lead@gippslandhub.edu.au', name: 'Alex Lee' },
            origin: 'https://www.aifoundation.net.au',
            returnPath: '/'
        });

        const webhookRes = await service.handleWebhookEvent({
            type: 'checkout.session.completed',
            data: { object: stripeSessions.get(checkout.stripeSessionId) }
        });
        assert.equal(webhookRes.handled, true);

        const sessionId = checkout.sessionId;
        const answers = [
            'Gippsland Community Hub in regional Victoria supporting 180 teen learners.',
            'Patchy 4G connectivity and shared Android tablets.',
            'Lesson prep takes hours and youth need basic AI fact-checking skills.',
            'Strict child-safety privacy rules; secret AIzaSyDummyKeyValue123456789012345 must never be exposed.',
            'Need human teacher verification before AI quiz questions reach classes.',
            'Under $200/year, 3 staff hours/week, launch pilot charter in 30 days.'
        ];

        let latestTurn = null;
        for (let i = 0; i < answers.length; i += 1) {
            latestTurn = await service.submitIntakeAnswer({
                uid: 'uid_educator_9',
                sessionId,
                message: answers[i]
            });
            if (i === 3) {
                assert.ok(latestTurn.redactedWarning, 'Q4 secret string triggers warning banner');
                assert.match(latestTurn.session.answers[3].answer, /\[REDACTED_SECRET\]/);
            }
        }

        assert.equal(latestTurn.session.status, 'awaiting_superadmin_improvement');
        assert.ok(latestTurn.session.preliminaryReport);
        assert.match(latestTurn.session.preliminaryReport.fileName, /^PRELIMINARY_Regional_Education_AI_Advisory_/);
        assert.doesNotMatch(latestTurn.session.preliminaryReport.content, /\*\*|##|<script|<div/i);

        // Wait for async gemini-4-hydrogen research + SuperAdmin queue dispatch
        await service.waitForPendingResearch();
        assert.ok(aiCalls.some(c => Array.isArray(c.tools) && c.tools[0]?.type === 'google_search'));
        assert.ok(firebase.sentMessages.length >= 1, 'SuperAdmin notification dispatched via sendChatMessage');

        const queue = await service.listSuperAdminReviews();
        assert.equal(queue.unreadCount, 1);
        const review = queue.reviews[0];
        assert.equal(review.reviewStatus, 'unread_analysis');

        const readReview = await service.markReviewRead(review.id);
        assert.equal(readReview.read, true);
        assert.equal(readReview.reviewStatus, 'in_review_editing');

        const savedDraft = await service.saveReviewDraft(review.id, {
            improvedTxtContent: `${readReview.workingDraftContent}\n\nSPECIALIST ADDENDUM: Added Gippsland offline pack.`,
            superadminNote: 'Tailored connectivity steps for rural bus routes.'
        });
        assert.match(savedDraft.workingDraftContent, /SPECIALIST ADDENDUM/);
        assert.equal(savedDraft.reviewStatus, 'in_review_editing');

        const approved = await service.approveAndDeliverFinalPlan(
            review.id,
            {
                improvedTxtContent: savedDraft.workingDraftContent,
                executiveNote: 'Approved for term kickoff with Week 1 Charter checklist.',
                confirmApprove: true
            },
            { email: 'davidrobertson.info@gmail.com' }
        );

        assert.equal(approved.review.reviewStatus, 'final_improved_delivered');
        assert.match(approved.review.finalFileName, /^FINAL_REVIEWED_Regional_Education_AI_Advisory_/);
        assert.equal(approved.session.status, 'final_improved_delivered');
        assert.equal(approved.session.finalImprovedReport.fileName, approved.review.finalFileName);
        assert.match(approved.session.superadminExecutiveNote, /term kickoff/);

        // Two-step Confirm Delete gate
        await assert.rejects(
            () => service.deleteReview(review.id, { confirmed: false }),
            /confirm deletion/i
        );
        const deleted = await service.deleteReview(review.id, { confirmed: true });
        assert.equal(deleted.success, true);
        assert.equal((await service.listSuperAdminReviews()).reviews.length, 0);
    } finally {
        fs.rmSync(tmp.dir, { recursive: true, force: true });
    }
});

test('Keyless deterministic fallback runs full 6-question workflow without GEMINI_API_KEY', async () => {
    const tmp = createTempPaths();
    const firebase = createFakeFirebase();
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const fakeStripe = {
        checkout: {
            sessions: {
                async create(payload) {
                    return {
                        id: 'cs_test_nokey_111',
                        url: 'https://checkout.stripe.test/cs_test_nokey_111',
                        payment_status: 'paid',
                        metadata: payload.metadata,
                        amount_subtotal: payload.line_items[0].price_data.unit_amount
                    };
                },
                async retrieve() {
                    return {
                        id: 'cs_test_nokey_111',
                        payment_status: 'paid',
                        metadata: { kind: 'regional_edu_advisory', uid: 'uid_fallback_1' },
                        amount_subtotal: 19900
                    };
                }
            }
        }
    };

    try {
        const service = createRegionalEduService({
            firebase,
            getStripe: () => fakeStripe,
            ...tmp
        });
        const checkout = await service.createCheckoutSession({
            user: { uid: 'uid_fallback_1', email: 'fallback@example.org', name: 'Fallback Lead' },
            origin: 'https://www.aifoundation.net.au'
        });
        await service.confirmCheckoutSession({ uid: 'uid_fallback_1', sessionId: checkout.stripeSessionId });

        let res;
        for (let i = 1; i <= 6; i += 1) {
            res = await service.submitIntakeAnswer({
                uid: 'uid_fallback_1',
                sessionId: checkout.sessionId,
                message: `Fallback regional answer step ${i} for Chiang Mai youth center.`
            });
        }
        assert.equal(res.session.status, 'awaiting_superadmin_improvement');
        assert.match(res.session.preliminaryReport.content, /FOUR|1\. REGULATORY VERIFICATION/);

        await service.waitForPendingResearch();
        const { reviews } = await service.listSuperAdminReviews();
        assert.equal(reviews.length, 1);
        assert.match(reviews[0].researchSummary, /UNESCO|ASEAN/);
    } finally {
        if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
        fs.rmSync(tmp.dir, { recursive: true, force: true });
    }
});
