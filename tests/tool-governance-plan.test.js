const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    ToolGovernanceChatTurnInputSchema,
    SuperadminFinalToolAdvisorySchema,
    ToolGovernanceStripeMetadataSchema,
    createToolGovernanceService
} = require('../tool-governance-plan');

function createTempPaths() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-found-toolgov-'));
    return {
        dir,
        sessionsFilePath: path.join(dir, 'tool-governance-sessions.json'),
        reviewsFilePath: path.join(dir, 'tool-governance-reviews.json')
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

test('Tool Governance Zod contracts reject file attachments and enforce #aifoundation businessId', () => {
    const badChat = ToolGovernanceChatTurnInputSchema.safeParse({
        sessionId: 'toolgov_cs_test_123456',
        message: 'Check my EHR patient export',
        file: { name: 'patient_records.pdf' }
    });
    assert.equal(badChat.success, false);

    const badMeta = ToolGovernanceStripeMetadataSchema.safeParse({
        tag: 'aifoundation',
        businessId: 'lms',
        businessName: 'AI Foundation',
        source: 'aifoundation',
        kind: 'tool_governance_advisory',
        uid: 'u1',
        userId: 'u1',
        serviceSlug: 'stack-selection',
        serviceName: 'Services - AI Tool Selection & Governance Advisory',
        serviceType: 'ai_tool_selection_governance_advisory',
        workflow: 'advisory_with_superadmin_improvement'
    });
    assert.equal(badMeta.success, false);

    const badApprove = SuperadminFinalToolAdvisorySchema.safeParse({
        improvedTxtContent: 'Final vetted plan meeting length threshold across medical regulatory frameworks.',
        confirmApprove: false
    });
    assert.equal(badApprove.success, false);
});

test('Tool Governance Stripe AUD ex-GST checkout ($399 fallback & stack-selection override) unlocks paid_intake_ready', async () => {
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
                        id: 'cs_test_toolgov_001',
                        url: 'https://checkout.stripe.test/cs_test_toolgov_001',
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
        const svcDefault = createToolGovernanceService({
            firebase,
            getStripe: () => fakeStripe,
            getServicePrices: async () => ({ prices: {} }),
            ...tmp
        });
        assert.equal((await svcDefault.getToolGovernancePricing()).exGstCents, 39900);

        const svcOverride = createToolGovernanceService({
            firebase,
            getStripe: () => fakeStripe,
            getServicePrices: async () => ({ prices: { 'stack-selection': { price: { aud: 480 } } } }),
            ...tmp
        });
        const checkout = await svcOverride.createCheckoutSession({
            user: { uid: 'doc_1', email: 'cmo@clinic.org.au', name: 'Dr Patel' },
            origin: 'https://www.aifoundation.net.au',
            returnPath: '/'
        });

        assert.equal(lastPayload.currency, 'aud');
        assert.equal(lastPayload.automatic_tax.enabled, true);
        assert.equal(lastPayload.invoice_creation.enabled, true);
        assert.equal(lastPayload.line_items[0].price_data.tax_behavior, 'exclusive');
        assert.equal(lastPayload.line_items[0].price_data.unit_amount, 48000);
        assert.equal(lastPayload.metadata.tag, 'aifoundation');
        assert.equal(lastPayload.metadata.businessId, '#aifoundation');
        assert.equal(lastPayload.metadata.serviceSlug, 'stack-selection');

        sessions.get(checkout.stripeSessionId).payment_status = 'paid';
        const unlocked = await svcOverride.confirmCheckoutSession({ uid: 'doc_1', sessionId: checkout.stripeSessionId });
        assert.equal(unlocked.status, 'paid_intake_ready');
        assert.equal(unlocked.businessId, '#aifoundation');
        assert.equal(unlocked.currentStep, 1);
    } finally {
        fs.rmSync(tmp.dir, { recursive: true, force: true });
    }
});

test('Tool Governance 6-step medical/air-gapped discovery -> preliminary TXT -> async vendor research -> SuperAdmin approve/delete', async () => {
    const tmp = createTempPaths();
    const firebase = createFakeFirebase();
    const sessions = new Map();
    const aiCalls = [];

    const mockAiClient = {
        interactions: {
            async create(payload) {
                aiCalls.push(payload);
                const sys = String(payload.system_instruction || '');
                if (sys.includes('brief public web search')) {
                    return { output_text: 'Medical practices in Australia must align AI scribes with Ahpra consent, OAIC APP 11, and TGA SaMD rules.' };
                }
                if (sys.includes('Exact Next Question')) {
                    const match = payload.input.match(/Exact Next Question:\s*(.+)$/m);
                    return { output_text: `Scoped!\n\n${match ? match[1] : 'Next'}` };
                }
                if (sys.includes('preliminary plain-text advisory plan')) {
                    return {
                        output_text: JSON.stringify({
                            section1Profile: 'Regional Specialist Clinic | Medical | Air-Gapped + AU VPC hybrid.',
                            section2Pillar1ToolStack: 'Primary: On-premise Qwen2.5-32B-Instruct Q6_K on offline L40S node + Vertex AU VPC.',
                            section3Pillar2MultimodalVetting: 'Voice transcription onshore zero-retention with mandatory clinician co-sign.',
                            section4Pillar3AirGapOrCloudCompliance: 'Offline HF_HUB_OFFLINE=1, firewall egress deny, CMEK in australia-southeast1.',
                            section5GovernancePolicyRoadmap: 'Week 1 Charter; Week 2 Hardware & IRAP/ISO check; Week 3 Pilot; Week 4 Go-live.'
                        })
                    };
                }
                return {
                    output_text: JSON.stringify({
                        cloudVendorAndCertifications: 'Vertex AI australia-southeast1 holds IRAP PROTECTED & ISO 27001.',
                        airGapModelsAndVramSpecs: '48 GB VRAM fits 32B Q6_K with zero external telemetry.',
                        sectorRegulatoryTripwires: 'Verify TGA ARTG SaMD exclusions and Ahpra informed consent notices.',
                        specialistImprovementChecklist: 'Confirm verbal patient consent wording in Section 5.'
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
                        id: 'cs_test_toolgov_full',
                        url: 'https://checkout.stripe.test/cs_test_toolgov_full',
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
        const service = createToolGovernanceService({
            firebase,
            getStripe: () => fakeStripe,
            aiClient: mockAiClient,
            ...tmp
        });

        const checkout = await service.createCheckoutSession({
            user: { uid: 'uid_clinic_1', email: 'lead@regionalmed.com.au', name: 'Dr Taylor' },
            origin: 'https://www.aifoundation.net.au'
        });
        await service.handleWebhookEvent({
            type: 'checkout.session.completed',
            data: { object: sessions.get(checkout.stripeSessionId) }
        });

        const answers = [
            'Regional Medical Clinic in NSW with 45 clinicians under Ahpra and OAIC oversight.',
            'Ambient voice consultation summaries and referral PDF extraction.',
            'Zero hallucinated diagnoses permitted; clinician must sign off every note.',
            'Air-gapped on-premise inference for clinical notes plus IRAP/ISO 27001 onshore cloud for admin.',
            'Google Workspace Enterprise by name + password=super_secret_pw; need GPU VRAM recommendation.',
            'AUD $800/month cloud cap and $12,000 server budget; select tools in 30 days.'
        ];

        let lastTurn = null;
        for (let i = 0; i < answers.length; i += 1) {
            lastTurn = await service.submitIntakeAnswer({
                uid: 'uid_clinic_1',
                sessionId: checkout.sessionId,
                message: answers[i]
            });
            if (i === 4) {
                assert.ok(lastTurn.redactedWarning);
                assert.match(lastTurn.session.answers[4].answer, /\[REDACTED_SECRET\]/);
            }
        }

        assert.equal(lastTurn.session.status, 'awaiting_superadmin_improvement');
        assert.match(lastTurn.session.preliminaryReport.fileName, /^PRELIMINARY_AI_Tool_Selection_Governance_Advisory_.*\d{4}-\d{2}-\d{2}\.txt$/);
        assert.match(lastTurn.session.preliminaryReport.content, /PRELIMINARY ADVISORY DRAFT - QUEUED FOR SUPERADMIN ANALYSIS/);
        assert.doesNotMatch(lastTurn.session.preliminaryReport.content, /\*\*|##|<script/i);

        await service.waitForPendingResearch();
        assert.ok(aiCalls.some(c => Array.isArray(c.tools) && c.tools[0]?.type === 'google_search'));
        assert.ok(firebase.sentMessages.length >= 1);

        const queue = await service.listSuperAdminReviews();
        assert.equal(queue.unreadCount, 1);
        const review = queue.reviews[0];
        assert.equal(review.businessId, '#aifoundation');
        assert.match(review.subject, /^\[Action Required: Analyse & Improve\] AI Tool Selection & Governance/);

        await service.markReviewRead(review.id);
        const drafted = await service.saveReviewDraft(review.id, {
            improvedTxtContent: `${review.workingDraftContent}\n\nARCHITECT ADDENDUM: Added TGA SaMD exclusion checklist.`,
            superadminNote: 'Verified IRAP status and dual L4 48GB GPU headroom.'
        });
        assert.match(drafted.workingDraftContent, /ARCHITECT ADDENDUM/);

        const approved = await service.approveAndDeliverFinalPlan(
            review.id,
            {
                improvedTxtContent: drafted.workingDraftContent,
                executiveNote: 'Approved for Q1 procurement committee.',
                confirmApprove: true
            },
            { uid: 'ZK79FRQoVlYhsgvMibhi81dRUWj2', email: 'davidrobertson.info@gmail.com' }
        );

        assert.equal(approved.review.reviewStatus, 'final_improved_delivered');
        assert.equal(approved.review.reviewedByUid, 'ZK79FRQoVlYhsgvMibhi81dRUWj2');
        assert.ok(approved.review.reviewedAt);
        assert.match(approved.review.finalFileName, /^FINAL_VETTED_AI_Tool_Selection_Governance_Advisory_/);
        assert.equal(approved.session.status, 'final_improved_delivered');
        assert.equal(approved.session.finalImprovedReport.fileName, approved.review.finalFileName);

        await assert.rejects(() => service.deleteReview(review.id, { confirmed: false }), /confirm deletion/i);
        const deleted = await service.deleteReview(review.id, { confirmed: true });
        assert.equal(deleted.success, true);
    } finally {
        fs.rmSync(tmp.dir, { recursive: true, force: true });
    }
});

test('Tool Governance keyless fallback completes full workflow without GEMINI_API_KEY', async () => {
    const tmp = createTempPaths();
    const firebase = createFakeFirebase();
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const fakeStripe = {
        checkout: {
            sessions: {
                async create(payload) {
                    return {
                        id: 'cs_test_tgnokey',
                        url: 'https://checkout.stripe.test/cs_test_tgnokey',
                        payment_status: 'paid',
                        metadata: payload.metadata,
                        amount_subtotal: 39900
                    };
                },
                async retrieve() {
                    return {
                        id: 'cs_test_tgnokey',
                        payment_status: 'paid',
                        metadata: { kind: 'tool_governance_advisory', uid: 'u_tgnk' },
                        amount_subtotal: 39900
                    };
                }
            }
        }
    };

    try {
        const svc = createToolGovernanceService({ firebase, getStripe: () => fakeStripe, ...tmp });
        const checkout = await svc.createCheckoutSession({
            user: { uid: 'u_tgnk', email: 'board@corp.com.au', name: 'Chair' },
            origin: 'https://www.aifoundation.net.au'
        });
        await svc.confirmCheckoutSession({ uid: 'u_tgnk', sessionId: checkout.stripeSessionId });
        let turn;
        for (let i = 1; i <= 6; i += 1) {
            turn = await svc.submitIntakeAnswer({
                uid: 'u_tgnk',
                sessionId: checkout.sessionId,
                message: `Corporate governance answer ${i} for ASIC/ISO 42001 procurement.`
            });
        }
        assert.equal(turn.session.status, 'awaiting_superadmin_improvement');
        assert.match(turn.session.preliminaryReport.content, /PILLAR 1: HIGH-PRECISION AI TOOL EVALUATION/);
        await svc.waitForPendingResearch();
        assert.equal((await svc.listSuperAdminReviews()).reviews.length, 1);
    } finally {
        if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
        fs.rmSync(tmp.dir, { recursive: true, force: true });
    }
});
