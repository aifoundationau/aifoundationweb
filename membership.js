/**
 * AI Foundation - Annual Membership (AUD $90 per year + GST) and the members-only chat.
 *
 * - Stripe Checkout in subscription mode with an inline yearly price (no Stripe Price object to manage).
 * - Membership is the one place the app uses a Stripe webhook (AI_DEPLOYMENT_RULES.md rule 8): renewals,
 *   failed renewals and cancellations happen while the member is away, so only Stripe can tell us.
 *   The return-from-Checkout confirm still unlocks access straight away.
 * - Every state change re-reads the subscription from Stripe, so events arriving twice or out of order are harmless.
 * - Membership and chat documents are written by the server only (Firestore rules deny browser writes).
 */
const { z } = require('zod');

const MEMBERS_COLLECTION = 'aifoundation_members';
const CHAT_COLLECTION = 'aifoundation_member_chat';
const MEMBERSHIP_KIND = 'membership';
const DEFAULT_PRICE_AUD_CENTS = 9000;

// The only Stripe events the webhook acts on. Configure exactly these on the Stripe endpoint
const HANDLED_EVENTS = Object.freeze([
    'checkout.session.completed',
    'invoice.paid',
    'invoice.payment_failed',
    'customer.subscription.updated',
    'customer.subscription.deleted'
]);

const CHAT_TOPICS = Object.freeze([
    { id: 'joint-projects', label: 'Joint Projects' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'asean-projects', label: 'ASEAN Projects' },
    { id: 'cambodia-ai-centre', label: 'Cambodia AI Centre' },
    { id: 'student-collaboration', label: 'Student Collaboration' }
]);
const TOPIC_IDS = CHAT_TOPICS.map(t => t.id);

// Access is given while the subscription is paid up. past_due (failed renewal) pauses access until it's paid
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

const SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
const MESSAGE_ID_PATTERN = /^msg_[0-9]{13}_[a-z0-9]{8}$/;
const RETURN_PATH_PATTERN = /^\/(?!\/)[A-Za-z0-9._~\-/]*$/;
const CHAT_MESSAGE_LIMIT = 100;
const CHAT_MIN_INTERVAL_MS = 3000;

const ChatPostSchema = z.object({
    topic: z.enum(TOPIC_IDS),
    text: z.string()
        .transform(s => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
        .pipe(z.string().min(1, 'Write a message first.').max(2000, 'Messages can be up to 2000 characters.'))
}).strict();

const CheckoutBodySchema = z.object({
    returnPath: z.string().max(200).optional()
}).strict();

function httpError(statusCode, message) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

function telegramInviteUrl(env = process.env) {
    const url = String(env.TELEGRAM_INVITE_URL || '').trim();
    return /^https:\/\/t\.me\/[A-Za-z0-9_+\-/]{2,200}$/.test(url) ? url : '';
}

function membershipPriceCents(env = process.env) {
    const cents = Math.round(Number(env.MEMBERSHIP_PRICE_AUD_CENTS));
    return Number.isInteger(cents) && cents >= 50 && cents <= 99999999 ? cents : DEFAULT_PRICE_AUD_CENTS;
}

function toIso(unixSeconds) {
    const n = Number(unixSeconds);
    return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : '';
}

// Newer Stripe API versions keep the period end on the subscription item; older ones on the subscription
function periodEndOf(subscription) {
    const item = subscription && subscription.items && Array.isArray(subscription.items.data) ? subscription.items.data[0] : null;
    return toIso((item && item.current_period_end) || (subscription && subscription.current_period_end));
}

function idOf(value) {
    if (!value) return '';
    return typeof value === 'string' ? value : String(value.id || '');
}

function isActiveRecord(record, now = Date.now()) {
    if (!record || !ACTIVE_STATUSES.has(record.status)) return false;
    const end = Date.parse(record.currentPeriodEnd || '');
    return Number.isFinite(end) && end > now;
}

// SuperAdmins get every subscription service free (complimentary): no Stripe charge, no record needed
function publicStatus(record, env = process.env, { complimentary = false } = {}) {
    if (complimentary) {
        return {
            isMember: true,
            status: 'complimentary',
            currentPeriodEnd: '',
            cancelAtPeriodEnd: false,
            priceAudCents: membershipPriceCents(env),
            telegramUrl: telegramInviteUrl(env),
            topics: CHAT_TOPICS
        };
    }
    const active = isActiveRecord(record);
    return {
        isMember: active,
        status: record ? record.status : 'none',
        currentPeriodEnd: record ? (record.currentPeriodEnd || '') : '',
        cancelAtPeriodEnd: Boolean(record && record.cancelAtPeriodEnd),
        priceAudCents: membershipPriceCents(env),
        telegramUrl: active ? telegramInviteUrl(env) : '',
        topics: CHAT_TOPICS
    };
}

function createMembershipService({ firebase, getStripe, env = process.env, now = () => Date.now() }) {
    const lastPostAt = new Map();

    async function readMember(uid) {
        const result = await firebase.readDocument(MEMBERS_COLLECTION, uid);
        if (!result || !result.ok) throw httpError(503, 'Memberships can\'t be reached right now. Please try again shortly.');
        return result.data || null;
    }

    async function getStatus(uid, { isSuperAdmin = false } = {}) {
        if (isSuperAdmin) return publicStatus(null, env, { complimentary: true });
        return publicStatus(await readMember(uid), env);
    }

    async function isMember(uid) {
        try {
            return isActiveRecord(await readMember(uid), now());
        } catch (e) {
            return false;
        }
    }

    async function createCheckout({ user, origin, body }) {
        const stripe = getStripe();
        if (user && user.isSuperAdmin) throw httpError(409, 'SuperAdmins have complimentary membership. No payment needed.');
        if (!stripe) throw httpError(503, 'Card payments are not set up yet. Please try again later.');
        const parsed = CheckoutBodySchema.safeParse(body || {});
        if (!parsed.success) throw httpError(400, 'Invalid membership request.');
        const returnPath = parsed.data.returnPath && RETURN_PATH_PATTERN.test(parsed.data.returnPath) ? parsed.data.returnPath : '/';

        const existing = await readMember(user.uid);
        if (isActiveRecord(existing, now())) throw httpError(409, 'You are already a member.');

        const metadata = {
            tag: 'aifoundation',
            businessId: '#aifoundation',
            businessName: 'AI Foundation',
            source: 'aifoundation',
            kind: MEMBERSHIP_KIND,
            uid: user.uid
        };
        const params = {
            mode: 'subscription',
            // Payment methods come from the Stripe Dashboard (Stripe no longer accepts payment_method_types here)
            automatic_tax: { enabled: true },
            line_items: [{
                quantity: 1,
                price_data: {
                    currency: 'aud',
                    tax_behavior: 'exclusive',
                    unit_amount: membershipPriceCents(env),
                    recurring: { interval: 'year' },
                    product_data: { name: 'AI Foundation Annual Membership' }
                }
            }],
            client_reference_id: user.uid,
            metadata,
            subscription_data: { metadata },
            success_url: `${origin}${returnPath}?membership=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}${returnPath}?membership=cancelled`
        };
        if (existing && existing.stripeCustomerId) {
            params.customer = existing.stripeCustomerId;
            params.customer_update = { address: 'auto' }; // Stripe Tax needs the address for an existing customer
        } else if (user.email) {
            params.customer_email = user.email;
        }
        const session = await stripe.checkout.sessions.create(params);
        return { url: session.url };
    }

    // Saves the subscription's current state (always read fresh from Stripe) against the member's uid
    async function syncSubscription(subscriptionId) {
        const stripe = getStripe();
        if (!stripe || !subscriptionId) return { status: 'ignored' };
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const uid = sub && sub.metadata ? String(sub.metadata.uid || '') : '';
        if (!sub || !sub.metadata || sub.metadata.kind !== MEMBERSHIP_KIND || !/^[A-Za-z0-9_-]{6,128}$/.test(uid)) {
            return { status: 'ignored' };
        }
        const record = {
            uid,
            status: String(sub.status || 'incomplete'),
            stripeCustomerId: idOf(sub.customer),
            stripeSubscriptionId: String(sub.id),
            currentPeriodEnd: periodEndOf(sub),
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
            tag: 'aifoundation',
            businessId: '#aifoundation',
            updatedAt: new Date(now()).toISOString()
        };
        const write = await firebase.writeDocument(MEMBERS_COLLECTION, uid, record);
        if (!write || !write.success) throw new Error(`Could not save membership for ${uid}`);
        return { status: record.status, uid, record };
    }

    async function confirmCheckout({ uid, sessionId }) {
        const id = String(sessionId || '').trim();
        if (!SESSION_ID_PATTERN.test(id)) throw httpError(400, 'sessionId is required.');
        const stripe = getStripe();
        if (!stripe) throw httpError(503, 'Card payments are not set up yet.');
        let session;
        try {
            session = await stripe.checkout.sessions.retrieve(id);
        } catch (e) {
            throw httpError(404, 'Payment not found.');
        }
        if (!session || !session.metadata || session.metadata.kind !== MEMBERSHIP_KIND || session.metadata.uid !== uid) {
            throw httpError(404, 'Payment not found.');
        }
        if (session.status === 'complete' && session.subscription) {
            await syncSubscription(idOf(session.subscription));
        }
        return getStatus(uid);
    }

    async function createPortal({ uid, origin }) {
        const stripe = getStripe();
        if (!stripe) throw httpError(503, 'Card payments are not set up yet.');
        const record = await readMember(uid);
        if (!record || !record.stripeCustomerId) throw httpError(404, 'No membership found.');
        const portal = await stripe.billingPortal.sessions.create({ customer: record.stripeCustomerId, return_url: `${origin}/` });
        return { url: portal.url };
    }

    function subscriptionIdFromInvoice(invoice) {
        if (!invoice) return '';
        const parent = invoice.parent && invoice.parent.subscription_details;
        return idOf((parent && parent.subscription) || invoice.subscription);
    }

    async function handleWebhookEvent(event) {
        if (!event || !HANDLED_EVENTS.includes(event.type)) return { handled: false };
        const obj = event.data && event.data.object;
        let subscriptionId = '';
        if (event.type === 'checkout.session.completed') {
            if (!obj || obj.mode !== 'subscription' || !obj.metadata || obj.metadata.kind !== MEMBERSHIP_KIND) return { handled: false };
            subscriptionId = idOf(obj.subscription);
        } else if (event.type.startsWith('invoice.')) {
            subscriptionId = subscriptionIdFromInvoice(obj);
        } else {
            subscriptionId = idOf(obj);
        }
        if (!subscriptionId) return { handled: false };
        const result = await syncSubscription(subscriptionId);
        return { handled: result.status !== 'ignored', ...result };
    }

    // Members chat: active members and admins only
    async function assertChatAccess(user) {
        if (user.isAdmin || user.isSuperAdmin) return;
        if (!(await isMember(user.uid))) throw httpError(403, 'The members chat is for active members.');
    }

    async function listMessages(user, topic) {
        await assertChatAccess(user);
        if (!TOPIC_IDS.includes(topic)) throw httpError(400, 'Choose a topic.');
        const rows = await firebase.queryDocuments(CHAT_COLLECTION, { where: [{ field: 'topic', op: '==', value: topic }] });
        if (!rows) throw httpError(503, 'The chat can\'t be reached right now. Please try again shortly.');
        return rows
            .map(r => ({
                id: r.id,
                topic: r.fields.topic,
                text: String(r.fields.text || ''),
                authorName: String(r.fields.authorName || 'Member'),
                createdAt: String(r.fields.createdAt || ''),
                mine: r.fields.authorUid === user.uid
            }))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .slice(-CHAT_MESSAGE_LIMIT);
    }

    async function postMessage(user, body) {
        await assertChatAccess(user);
        const parsed = ChatPostSchema.safeParse(body || {});
        if (!parsed.success) throw httpError(400, parsed.error.issues[0]?.message || 'Invalid message.');
        const t = now();
        if (t - (lastPostAt.get(user.uid) || 0) < CHAT_MIN_INTERVAL_MS) throw httpError(429, 'Please wait a moment before sending another message.');
        lastPostAt.set(user.uid, t);
        const id = `msg_${t}_${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;
        const message = {
            topic: parsed.data.topic,
            text: parsed.data.text,
            authorUid: user.uid,
            authorName: String(user.name || (user.email || '').split('@')[0] || 'Member').slice(0, 80),
            createdAt: new Date(t).toISOString(),
            tag: 'aifoundation',
            businessId: '#aifoundation'
        };
        const write = await firebase.writeDocument(CHAT_COLLECTION, id, message, false);
        if (!write || !write.success) throw httpError(503, 'Your message could not be sent. Please try again.');
        return { id, topic: message.topic, text: message.text, authorName: message.authorName, createdAt: message.createdAt, mine: true };
    }

    async function deleteMessage(user, id) {
        if (!user.isAdmin && !user.isSuperAdmin) throw httpError(403, 'Administrator access required.');
        if (!MESSAGE_ID_PATTERN.test(String(id || ''))) throw httpError(400, 'Invalid message.');
        const result = await firebase.deleteDocument(CHAT_COLLECTION, id);
        if (!result || !result.success) throw httpError(503, 'The message could not be deleted. Please try again.');
        return { deleted: id };
    }

    return {
        getStatus, isMember, createCheckout, confirmCheckout, createPortal,
        syncSubscription, handleWebhookEvent, listMessages, postMessage, deleteMessage
    };
}

module.exports = {
    MEMBERS_COLLECTION,
    CHAT_COLLECTION,
    HANDLED_EVENTS,
    CHAT_TOPICS,
    ChatPostSchema,
    isActiveRecord,
    publicStatus,
    membershipPriceCents,
    telegramInviteUrl,
    createMembershipService
};
