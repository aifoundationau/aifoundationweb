// Services - Google AI Strategy & First-Month Plan (strategy-plan.js) tests.
// Usage: npm test. Uses fake Stripe, Firebase, and @google/genai clients so no real payments or API calls occur.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    SERVICE_NAME,
    SERVICE_TYPE,
    redactSecrets,
    createStrategyPlanService
} = require('../strategy-plan');

function tempStorePaths() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-plan-'));
    return {
        dir,
        sessionsFilePath: path.join(dir, 'strategy-sessions.json'),
        briefsFilePath: path.join(dir, 'strategy-briefs.json')
    };
}

function makeFakeFirebase() {
    const collections = new Map();
    const chats = [];
    const transactions = [];

    return {
        collections,
        chats,
        transactions,
        async writeDocument(col, id, data) {
            if (!collections.has(col)) collections.set(col, new Map());
            collections.get(col).set(id, JSON.parse(JSON.stringify(data)));
            return { success: true };
        },
        async getDocument(col, id) {
            return collections.get(col)?.get(id) || null;
        },
        async listDocuments(col) {
            const map = collections.get(col);
            if (!map) return [];
            return [...map.entries()].map(([id, fields]) => ({ id, fields }));
        },
        async deleteDocument(col, id) {
            collections.get(col)?.delete(id);
            return { success: true };
        },
        async recordTransaction(tx) {
            transactions.push(tx);
            return { success: true };
        },
        async updateTransactionStatus(id, status) {
            transactions.push({ id, status });
            return { success: true };
        },
        async sendChatMessage(msg) {
            chats.push(msg);
            return { success: true, message: { id: 'msg_test_1', ...msg } };
        }
    };
}

function makeFakeStripe({ paid = true, ownerUid = 'user_123' } = {}) {
    const createdSessions = [];
    const retrievedSessions = new Map();

    return {
        createdSessions,
        retrievedSessions,
        checkout: {
            sessions: {
                async create(params) {
                    createdSessions.push(params);
                    const id = 'cs_test_strategy123';
                    retrievedSessions.set(id, {
                        id,
                        url: `https://checkout.stripe.com/pay/${id}`,
                        payment_status: paid ? 'paid' : 'unpaid',
                        amount_subtotal: params.line_items[0].price_data.unit_amount,
                        amount_total: Math.round(params.line_items[0].price_data.unit_amount * 1.1),
                        customer_email: params.customer_email,
                        client_reference_id: params.client_reference_id,
                        metadata: params.metadata
                    });
                    return { id, url: `https://checkout.stripe.com/pay/${id}` };
                },
                async retrieve(id) {
                    const found = retrievedSessions.get(id);
                    if (!found) {
                        const err = new Error('No such session');
                        err.code = 'resource_missing';
                        throw err;
                    }
                    return { ...found, metadata: { ...found.metadata, uid: ownerUid } };
                }
            }
        }
    };
}

test('redactSecrets scrubs API keys, Stripe secrets, JWTs, PEM keys, and labeled passwords to [REDACTED_SECRET]', () => {
    const sample = [
        'Here is my Google key AIzaSyD_FakeTestKey1234567890abcdef and Stripe sk_live_1234567890abcdef1234',
        'Webhook: whsec_abcdef1234567890abcd',
        'password="MySuperSecretPassword123"',
        'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTYifQ.signature_part_here',
        '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC\n-----END PRIVATE KEY-----'
    ].join('\n');

    const res = redactSecrets(sample);
    assert.equal(res.hadSecrets, true);
    assert.ok(!res.scrubbedText.includes('AIzaSyD'));
    assert.ok(!res.scrubbedText.includes('sk_live_'));
    assert.ok(!res.scrubbedText.includes('whsec_'));
    assert.ok(!res.scrubbedText.includes('MySuperSecretPassword123'));
    assert.ok(!res.scrubbedText.includes('eyJhbGci'));
    assert.ok(!res.scrubbedText.includes('MIIEvQIBADAN'));
    assert.match(res.scrubbedText, /\[REDACTED_SECRET\]/);

    const clean = redactSecrets('We run a 4-person plumbing business using Google Workspace.');
    assert.equal(clean.hadSecrets, false);
});

test('Stripe checkout uses AUD exclusive GST, respects admin override or $299 fallback, and unlocks atomically via webhook or confirm', async () => {
    const stores = tempStorePaths();
    const firebase = makeFakeFirebase();
    const stripe = makeFakeStripe({ paid: true, ownerUid: 'user_123' });

    let adminAudPrice = null;
    const service = createStrategyPlanService({
        firebase,
        getStripe: () => stripe,
        getServicePrices: async () => ({
            prices: { '30-day-roadmap': { price: { usd: 250, aud: adminAudPrice } } }
        }),
        ...stores
    });

    // Default fallback ($299.00 AUD ex GST = 29900 cents)
    const fallbackQuote = await service.getStrategyPlanPricing();
    assert.equal(fallbackQuote.exGstCents, 29900);
    assert.equal(fallbackQuote.gstAud, 29.9);
    assert.equal(fallbackQuote.totalIncGstAud, 328.9);

    // Admin AUD override ($450 AUD ex GST = 45000 cents)
    adminAudPrice = 450;
    const checkout = await service.createCheckoutSession({
        user: { uid: 'user_123', email: 'owner@trade.com.au', name: 'Sam Owner' },
        origin: 'https://www.aifoundation.net.au',
        returnPath: '/'
    });

    assert.equal(stripe.createdSessions.length, 1);
    const params = stripe.createdSessions[0];
    assert.equal(params.currency, 'aud');
    assert.equal(params.automatic_tax.enabled, true);
    assert.equal(params.invoice_creation.enabled, true);
    assert.equal(params.line_items[0].price_data.currency, 'aud');
    assert.equal(params.line_items[0].price_data.tax_behavior, 'exclusive');
    assert.equal(params.line_items[0].price_data.unit_amount, 45000);
    assert.equal(params.metadata.tag, 'aifoundation');
    assert.equal(params.metadata.businessId, 'aifoundation');
    assert.equal(params.metadata.kind, 'strategy_plan');
    assert.equal(params.metadata.serviceName, SERVICE_NAME);
    assert.equal(params.metadata.serviceType, SERVICE_TYPE);
    assert.match(checkout.url, /^https:\/\/checkout\.stripe\.com/);

    // Webhook unlock works idempotently; subsequent confirm returns the same unlocked session
    const webhookRes = await service.handleWebhookEvent({
        type: 'checkout.session.completed',
        data: { object: stripe.retrievedSessions.get('cs_test_strategy123') }
    });
    assert.equal(webhookRes.handled, true);

    const confirmed = await service.confirmCheckoutSession({
        uid: 'user_123',
        sessionId: 'cs_test_strategy123'
    });
    assert.equal(confirmed.paymentStatus, 'paid');
    assert.equal(confirmed.status, 'intake');
    assert.equal(confirmed.currentStep, 1);
    assert.match(confirmed.messages[0].content, /Question 1 of 6/i);
    assert.match(confirmed.messages[0].content, /NONE of your Google Workspace/i);

    // Wrong user cannot confirm someone else's Stripe session
    await assert.rejects(
        () => service.confirmCheckoutSession({ uid: 'other_user', sessionId: 'cs_test_strategy123' }),
        err => err.statusCode === 404
    );

    fs.rmSync(stores.dir, { recursive: true, force: true });
});

test('6-step intake flow with mock @google/genai Google Search produces pure-TXT Stage 2 report and async Stage 3 SuperAdmin brief', async () => {
    const stores = tempStorePaths();
    const firebase = makeFakeFirebase();
    const stripe = makeFakeStripe({ paid: true, ownerUid: 'user_123' });
    const aiCalls = [];

    const mockAiClient = {
        interactions: {
            async create(req) {
                aiCalls.push(req);
                if (req.system_instruction.includes('public web search on industry workflows')) {
                    return { output_text: 'Public trade benchmarks show 7-10 hrs/week saved via **Gmail** enquiry triage and Google Calendar dispatch.' };
                }
                if (req.system_instruction.includes('executiveSummary')) {
                    return {
                        output_text: JSON.stringify({
                            executiveSummary: '### Tailored 30-Day Advisory Plan for Acme Electrical using **Google Workspace**.',
                            weeklyHoursRecoverable: '8-10 hours/week',
                            bottleneckAssessment: 'Triage, Calendar booking, PDF quote forms.',
                            pillar1Roadmap: 'Days 1-7: Setup.\nDays 8-14: Triage.\nDays 15-21: Dispatch.\nDays 22-30: Quotes.',
                            pillar2Connectors: 'Recommended Workspace & Xero API bridge (advisory only).',
                            pillar3Security: 'Enable 2SV and Workspace commercial data-isolation in australia-southeast1.',
                            customerCommitments: 'Commit 2-4 hrs/week. Lead Architect review within 24-48 business hours.'
                        })
                    };
                }
                return {
                    output_text: JSON.stringify({
                        publicDocsFindings: 'Verified Firebase australia-southeast1, Cloud Run, AI Studio, and Workspace Apps Script public docs.',
                        selfServiceActions: 'Workspace 2SV, Gmail templates, Shared Drive permissions.',
                        optionalEngineeringItems: 'Optional custom Cloud Run webhook bridge to Xero.',
                        estimatedMonthlyAudCost: 'AUD $25-$45/month for Gemini API + Cloud Run minimal tier.',
                        privacyAndRisks: 'APP 11 minimization and zero client credential storage.'
                    })
                };
            }
        }
    };

    const service = createStrategyPlanService({
        firebase,
        getStripe: () => stripe,
        aiClient: mockAiClient,
        now: () => new Date('2026-11-17T01:00:00.000Z'),
        ...stores
    });

    await service.createCheckoutSession({
        user: { uid: 'user_123', email: 'client@acme.com.au', name: 'Acme Lead' },
        origin: 'https://www.aifoundation.net.au'
    });
    const session = await service.confirmCheckoutSession({ uid: 'user_123', sessionId: 'cs_test_strategy123' });

    // Q1 includes a secret to verify redaction + warning + Google Search grounding call
    const r1 = await service.submitIntakeAnswer({
        uid: 'user_123',
        sessionId: session.id,
        message: 'Business name: Acme Electrical Pty Ltd, 6 electricians, 20 jobs/day. Note my key AIzaSyD_DoNotStore1234567890abcdef'
    });
    assert.ok(r1.redactedWarning);
    assert.equal(r1.session.currentStep, 2);
    assert.ok(!r1.session.answers[0].answer.includes('AIzaSyD_DoNotStore'));
    assert.match(r1.session.answers[0].answer, /\[REDACTED_SECRET\]/);
    assert.equal(aiCalls[0].tools?.[0]?.type, 'google_search');

    for (const [step, answer] of [
        [2, 'Google Workspace Business Standard, Gmail, Calendar, Drive, Xero, ServiceM8'],
        [3, 'Quoting and after-hours email enquiries take 2 hours daily'],
        [4, 'Manual calendar updates cause double bookings'],
        [5, 'Compliance PDF checklists and supplier invoices'],
        [6, 'Keep client addresses private in Australia; want faster triage, clean scheduling, automated draft quotes']
    ]) {
        const turn = await service.submitIntakeAnswer({
            uid: 'user_123',
            sessionId: session.id,
            message: answer
        });
        if (step < 6) {
            assert.equal(turn.session.currentStep, step + 1);
            assert.equal(turn.session.status, 'intake');
        } else {
            assert.equal(turn.session.status, 'completed');
            assert.ok(turn.session.preliminaryReport);
            const report = turn.session.preliminaryReport;
            assert.equal(
                report.fileName,
                'Preliminary_Google_AI_Strategy_30_Day_Advisory_Acme_Electrical_Pty_Ltd_2026-11-17.txt'
            );
            assert.match(report.content, /INDEPENDENT ADVISORY & ZERO-ACCESS DISCLAIMER/);
            assert.match(report.content, /={60}/);
            assert.match(report.content, /1\. EXECUTIVE SUMMARY/);
            assert.match(report.content, /2\. BOTTLENECK ASSESSMENT/);
            assert.match(report.content, /3\. PILLAR 1 ADVISORY/);
            assert.match(report.content, /4\. PILLAR 2 ADVISORY/);
            assert.match(report.content, /5\. PILLAR 3 ADVISORY/);
            assert.match(report.content, /6\. CUSTOMER COMMITMENTS/);
            // Markdown stripped cleanly
            assert.ok(!report.content.includes('###'));
            assert.ok(!report.content.includes('**'));
        }
    }

    // Wait for async Stage 3 research and verify SuperAdmin brief + chat dispatch + confirm-delete gate
    await service.waitForPendingResearch();
    assert.equal(aiCalls[aiCalls.length - 1].tools?.[0]?.type, 'google_search');

    const { briefs, unreadCount } = await service.listSuperAdminBriefs();
    assert.equal(briefs.length, 1);
    assert.equal(unreadCount, 1);
    assert.equal(
        briefs[0].fileName,
        'SUPERADMIN_30_Day_Advisory_Recommendation_Acme_Electrical_Pty_Ltd_2026-11-17.txt'
    );
    assert.equal(briefs[0].tag, 'aifoundation');
    assert.equal(briefs[0].businessId, 'aifoundation');
    assert.match(briefs[0].content, /PUBLIC DOCUMENTATION RESEARCH/);
    assert.match(briefs[0].content, /SELF-SERVICE WORKSPACE SETTINGS/);
    assert.match(briefs[0].content, /OPTIONAL CUSTOM ENGINEERING ITEMS/);
    assert.equal(firebase.chats.length, 1);
    assert.equal(firebase.chats[0].recipientUid, 'superadmin');

    // Mark read and verify confirm-delete protection
    await service.markBriefRead(briefs[0].id);
    assert.equal((await service.listSuperAdminBriefs()).unreadCount, 0);

    await assert.rejects(
        () => service.deleteSuperAdminBrief(briefs[0].id, { confirmed: false }),
        err => err.statusCode === 400
    );
    const deleted = await service.deleteSuperAdminBrief(briefs[0].id, { confirmed: true });
    assert.equal(deleted.success, true);
    assert.equal((await service.listSuperAdminBriefs()).briefs.length, 0);

    fs.rmSync(stores.dir, { recursive: true, force: true });
});

test('keyless fallback completes all 6 intake steps and generates both .txt files when GEMINI_API_KEY is unset', async () => {
    const stores = tempStorePaths();
    const firebase = makeFakeFirebase();
    const stripe = makeFakeStripe({ paid: true, ownerUid: 'user_keyless' });
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
        const service = createStrategyPlanService({
            firebase,
            getStripe: () => stripe,
            now: () => new Date('2026-11-17T02:00:00.000Z'),
            ...stores
        });

        await service.createCheckoutSession({
            user: { uid: 'user_keyless', email: 'solo@builder.com.au', name: 'Solo Builder' },
            origin: 'https://www.aifoundation.net.au'
        });
        const unlocked = await service.confirmCheckoutSession({ uid: 'user_keyless', sessionId: 'cs_test_strategy123' });

        for (let i = 1; i <= 6; i++) {
            await service.submitIntakeAnswer({
                uid: 'user_keyless',
                sessionId: unlocked.id,
                message: `Step ${i} answer: Regional Builder using Gmail, Calendar, Drive, and Xero.`
            });
        }

        const done = await service.getSessionById(unlocked.id);
        assert.equal(done.status, 'completed');
        assert.ok(done.preliminaryReport?.content.includes('INDEPENDENT ADVISORY & ZERO-ACCESS DISCLAIMER'));
        await service.waitForPendingResearch();
        const { briefs } = await service.listSuperAdminBriefs();
        assert.equal(briefs.length, 1);
        assert.match(briefs[0].content, /australia-southeast1/);
    } finally {
        if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
        fs.rmSync(stores.dir, { recursive: true, force: true });
    }
});
