const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    ManagedAgentChatTurnInputSchema,
    SuperadminFinalManagedAgentSchema,
    ManagedAgentStripeMetadataSchema,
    createManagedAgentService
} = require('../managed-agent-plan');

function createTempPaths() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-found-mgagent-'));
    return {
        dir,
        sessionsFilePath: path.join(dir, 'managed-agent-sessions.json'),
        reviewsFilePath: path.join(dir, 'managed-agent-reviews.json')
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

test('Managed Agent Zod contracts reject extra file keys and enforce #aifoundation businessId', () => {
    const badChat = ManagedAgentChatTurnInputSchema.safeParse({
        sessionId: 'mgagent_cs_test_123456',
        message: 'Here is our server SSH key',
        attachment: 'id_rsa'
    });
    assert.equal(badChat.success, false);

    const badMeta = ManagedAgentStripeMetadataSchema.safeParse({
        tag: 'aifoundation',
        businessId: 'lms',
        businessName: 'AI Foundation',
        source: 'aifoundation',
        kind: 'managed_agent_advisory',
        uid: 'u1',
        userId: 'u1',
        serviceSlug: 'ai-agent-hosting',
        serviceName: 'Services - Managed AI Agent Hosting & Maintenance',
        serviceType: 'managed_ai_agent_hosting_maintenance_advisory',
        workflow: 'advisory_with_superadmin_improvement'
    });
    assert.equal(badMeta.success, false);

    const badApprove = SuperadminFinalManagedAgentSchema.safeParse({
        improvedTxtContent: 'Final reviewed Managed AI Agent Hosting blueprint meeting character threshold.',
        confirmApprove: false
    });
    assert.equal(badApprove.success, false);
});

test('Managed Agent Stripe AUD ex-GST checkout ($349 fallback & ai-agent-hosting setup override) unlocks paid_intake_ready', async () => {
    const tmp = createTempPaths();
    const firebase = createFakeFirebase();
    let lastPayload = null;
    const sessions = new Map();

    const fakeStripe = {
        checkout: {
            sessions: {
                async create(payload) {
                    lastPayload = payload;
                    const created = {
                        id: 'cs_test_mgagent_001',
                        url: 'https://checkout.stripe.test/cs_test_mgagent_001',
                        payment_status: 'unpaid',
                        metadata: payload.metadata,
                        customer_email: payload.customer_email,
                        client_reference_id: payload.client_reference_id,
                        amount_subtotal: payload.line_items[0].price_data.unit_amount
                    };
                    sessions.set(created.id, created);
                    return created;
                },
                async retrieve(id) {
                    return sessions.get(id);
                }
            }
        }
    };

    try {
        const svcDefault = createManagedAgentService({
            firebase,
            getStripe: () => fakeStripe,
            getServicePrices: async () => ({ prices: {} }),
            ...tmp
        });
        assert.equal((await svcDefault.getManagedAgentPricing()).exGstCents, 34900);

        const svcOverride = createManagedAgentService({
            firebase,
            getStripe: () => fakeStripe,
            getServicePrices: async () => ({ prices: { 'ai-agent-hosting': { setup: { aud: 425 } } } }),
            ...tmp
        });
        const checkout = await svcOverride.createCheckoutSession({
            user: { uid: 'ops_1', email: 'ops@edutech.com.au', name: 'Jordan Ops' },
            origin: 'https://www.aifoundation.net.au',
            returnPath: '/'
        });

        assert.equal(lastPayload.currency, 'aud');
        assert.equal(lastPayload.automatic_tax.enabled, true);
        assert.equal(lastPayload.invoice_creation.enabled, true);
        assert.equal(lastPayload.line_items[0].price_data.tax_behavior, 'exclusive');
        assert.equal(lastPayload.line_items[0].price_data.unit_amount, 42500);
        assert.equal(lastPayload.metadata.tag, 'aifoundation');
        assert.equal(lastPayload.metadata.businessId, '#aifoundation');
        assert.equal(lastPayload.metadata.serviceSlug, 'ai-agent-hosting');

        sessions.get(checkout.stripeSessionId).payment_status = 'paid';
        const unlocked = await svcOverride.confirmCheckoutSession({ uid: 'ops_1', sessionId: checkout.stripeSessionId });
        assert.equal(unlocked.status, 'paid_intake_ready');
        assert.equal(unlocked.businessId, '#aifoundation');
        assert.equal(unlocked.currentStep, 1);
    } finally {
        fs.rmSync(tmp.dir, { recursive: true, force: true });
    }
});

test('Managed Agent 6-step scoping -> preliminary TXT -> async Cloud/MCP research -> SuperAdmin approve/delete', async () => {
    const tmp = createTempPaths();
    const firebase = createFakeFirebase();
    const sessions = new Map();
    const aiCalls = [];

    const mockAiClient = {
        interactions: {
            async create(payload) {
                aiCalls.push(payload);
                const sys = String(payload.system_instruction || '');
                if (sys.includes('brief public search')) {
                    return { output_text: 'Educational RTO operations benefit from idempotent Cloud Run agent queues pinned in australia-southeast1.' };
                }
                if (sys.includes('Exact Next Question')) {
                    const match = payload.input.match(/Exact Next Question:\s*(.+)$/m);
                    return { output_text: `Captured!\n\n${match ? match[1] : 'Next'}` };
                }
                if (sys.includes('preliminary plain-text advisory blueprint')) {
                    return {
                        output_text: JSON.stringify({
                            operationalProfile: 'Pacific Vocational RTO | Education Ops | 1,200 daily triage tasks.',
                            pillar1HostingSetup: 'Cloud Run australia-southeast1 min-instances=1 + Cloud Tasks retries.',
                            pillar2AgentProgramming: 'Strict Zod MCP schemas + prompt caching + human sign-off on enrollments.',
                            pillar3MonitoringMaintenance: 'OpenTelemetry traces, secret scrubbing, and weekly drift evals.',
                            thirtyDayRolloutCadence: 'Week 1 Contracts; Week 2 Runtime; Week 3 Shadow evals; Week 4 Production canary.'
                        })
                    };
                }
                return {
                    output_text: JSON.stringify({
                        googleCloudRuntimeTopology: 'Cloud Run min-instances=1 in australia-southeast1 avoids cold starts.',
                        mcpAndPromptOptimization: 'Enforce x-idempotency-key headers and compact schemas.',
                        observabilitySafetyAndSla: 'Track p95 latency < 2s and weekly golden-set drift checks.',
                        specialistImprovementChecklist: 'Highlight dead-letter replay steps for ops staff.'
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
                        id: 'cs_test_mgagent_full',
                        url: 'https://checkout.stripe.test/cs_test_mgagent_full',
                        payment_status: 'paid',
                        metadata: payload.metadata,
                        customer_email: payload.customer_email,
                        client_reference_id: payload.client_reference_id,
                        amount_subtotal: payload.line_items[0].price_data.unit_amount
                    };
                    sessions.set(s.id, s);
                    return s;
                },
                async retrieve(id) {
                    return sessions.get(id);
                }
            }
        }
    };

    try {
        const service = createManagedAgentService({
            firebase,
            getStripe: () => fakeStripe,
            aiClient: mockAiClient,
            ...tmp
        });

        const checkout = await service.createCheckoutSession({
            user: { uid: 'uid_rto_1', email: 'it@pacificrto.edu.au', name: 'Sam Ops' },
            origin: 'https://www.aifoundation.net.au'
        });
        await service.handleWebhookEvent({
            type: 'checkout.session.completed',
            data: { object: sessions.get(checkout.stripeSessionId) }
        });

        const answers = [
            'Pacific Vocational RTO handling 1,200 weekly student enrollment inquiries manually.',
            'Triage tickets, verify unit prerequisites via MCP tools, draft replies for staff approval.',
            '99.9% uptime during business hours and under 3 second p95 response latency.',
            'Australia-southeast1 hosting only; token ghp_FakeGitHubToken1234567890123456789012 must be masked.',
            'Live OpenTelemetry error alerts and monthly regression checks before model updates.',
            'AUD $500/month opex ceiling and go live on triage agent within 30 days.'
        ];

        let lastTurn = null;
        for (let i = 0; i < answers.length; i += 1) {
            lastTurn = await service.submitIntakeAnswer({
                uid: 'uid_rto_1',
                sessionId: checkout.sessionId,
                message: answers[i]
            });
            if (i === 3) {
                assert.ok(lastTurn.redactedWarning);
                assert.match(lastTurn.session.answers[3].answer, /\[REDACTED_SECRET\]/);
            }
        }

        assert.equal(lastTurn.session.status, 'awaiting_superadmin_improvement');
        assert.match(lastTurn.session.preliminaryReport.fileName, /^PRELIMINARY_Managed_AI_Agent_Hosting_Advisory_.*\d{4}-\d{2}-\d{2}\.txt$/);
        assert.doesNotMatch(lastTurn.session.preliminaryReport.content, /\*\*|##|<script/i);

        await service.waitForPendingResearch();
        assert.ok(aiCalls.some(c => Array.isArray(c.tools) && c.tools[0]?.type === 'google_search'));
        assert.ok(firebase.sentMessages.length >= 1);

        const queue = await service.listSuperAdminReviews();
        assert.equal(queue.unreadCount, 1);
        const review = queue.reviews[0];
        assert.equal(review.businessId, '#aifoundation');
        assert.match(review.subject, /^\[Action Required: Analyse & Improve\] Managed AI Agent Hosting/);

        await service.markReviewRead(review.id);
        const drafted = await service.saveReviewDraft(review.id, {
            improvedTxtContent: `${review.workingDraftContent}\n\nARCHITECT ADDENDUM: Added dead-letter replay cadence.`,
            superadminNote: 'Configured Cloud Run min-instances=1 and $20/day spend cap.'
        });
        assert.match(drafted.workingDraftContent, /ARCHITECT ADDENDUM/);

        const approved = await service.approveAndDeliverFinalPlan(
            review.id,
            {
                improvedTxtContent: drafted.workingDraftContent,
                executiveNote: 'Ready for Day-1 Cloud Run staging spin-up.',
                confirmApprove: true
            },
            { uid: 'L5euSJAfNKdDOX6mT0qmrCGjUA53', email: 'support@aifoundation.net.au' }
        );

        assert.equal(approved.review.reviewStatus, 'final_improved_delivered');
        assert.equal(approved.review.reviewedByUid, 'L5euSJAfNKdDOX6mT0qmrCGjUA53');
        assert.ok(approved.review.reviewedAt);
        assert.match(approved.review.finalFileName, /^FINAL_REVIEWED_Managed_AI_Agent_Hosting_Advisory_/);
        assert.equal(approved.session.status, 'final_improved_delivered');

        await assert.rejects(() => service.deleteReview(review.id, { confirmed: false }), /confirm deletion/i);
        const deleted = await service.deleteReview(review.id, { confirmed: true });
        assert.equal(deleted.success, true);
    } finally {
        fs.rmSync(tmp.dir, { recursive: true, force: true });
    }
});

test('Managed Agent keyless fallback completes full workflow without GEMINI_API_KEY', async () => {
    const tmp = createTempPaths();
    const firebase = createFakeFirebase();
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const fakeStripe = {
        checkout: {
            sessions: {
                async create(payload) {
                    return {
                        id: 'cs_test_manokey',
                        url: 'https://checkout.stripe.test/cs_test_manokey',
                        payment_status: 'paid',
                        metadata: payload.metadata,
                        amount_subtotal: 34900
                    };
                },
                async retrieve() {
                    return {
                        id: 'cs_test_manokey',
                        payment_status: 'paid',
                        metadata: { kind: 'managed_agent_advisory', uid: 'u_manokey' },
                        amount_subtotal: 34900
                    };
                }
            }
        }
    };

    try {
        const svc = createManagedAgentService({ firebase, getStripe: () => fakeStripe, ...tmp });
        const checkout = await svc.createCheckoutSession({
            user: { uid: 'u_manokey', email: 'ops@retail.com.au', name: 'Ops Lead' },
            origin: 'https://www.aifoundation.net.au'
        });
        await svc.confirmCheckoutSession({ uid: 'u_manokey', sessionId: checkout.stripeSessionId });
        let turn;
        for (let i = 1; i <= 6; i += 1) {
            turn = await svc.submitIntakeAnswer({
                uid: 'u_manokey',
                sessionId: checkout.sessionId,
                message: `Managed agent workflow step ${i} for order dispatch operations.`
            });
        }
        assert.equal(turn.session.status, 'awaiting_superadmin_improvement');
        assert.match(turn.session.preliminaryReport.content, /PILLAR 1: MANAGED AI AGENT HOSTING/);
        await svc.waitForPendingResearch();
        assert.equal((await svc.listSuperAdminReviews()).reviews.length, 1);
    } finally {
        if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
        fs.rmSync(tmp.dir, { recursive: true, force: true });
    }
});
