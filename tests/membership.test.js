// Annual Membership (membership.js) tests. Fake Stripe and Firebase: no real payments or Firestore calls.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    HANDLED_EVENTS, CHAT_TOPICS, MEMBERS_COLLECTION, CHAT_COLLECTION,
    isActiveRecord, membershipPriceCents, telegramInviteUrl, createMembershipService
} = require('../membership');

const NOW = Date.parse('2026-11-18T00:00:00Z');
const YEAR_AHEAD = Math.floor((NOW + 365 * 864e5) / 1000);
const ENV = { TELEGRAM_INVITE_URL: 'https://t.me/+AbCdEf123', MEMBERSHIP_PRICE_AUD_CENTS: '9000' };
const member = { uid: 'user_abc123', email: 'm@example.com', name: 'Mia', isAdmin: false, isSuperAdmin: false };
const admin = { uid: 'admin_xyz789', email: 'a@example.com', name: 'Admin', isAdmin: true, isSuperAdmin: false };

function fakeFirebase({ unreachable = false } = {}) {
    const cols = new Map();
    const col = (name) => { if (!cols.has(name)) cols.set(name, new Map()); return cols.get(name); };
    return {
        cols,
        async readDocument(c, id) { return unreachable ? { ok: false } : { ok: true, data: col(c).get(id) || null }; },
        async writeDocument(c, id, data) { col(c).set(id, { ...(col(c).get(id) || {}), ...JSON.parse(JSON.stringify(data)) }); return { success: true }; },
        async queryDocuments(c, { where }) {
            if (unreachable) return null;
            return [...col(c).entries()].filter(([, f]) => where.every(w => f[w.field] === w.value)).map(([id, fields]) => ({ id, fields }));
        },
        async deleteDocument(c, id) { col(c).delete(id); return { success: true }; }
    };
}

function fakeStripe(sub = {}) {
    const calls = { checkout: [], portal: [] };
    const subscription = {
        id: 'sub_123', status: 'active', customer: 'cus_123', cancel_at_period_end: false,
        metadata: { kind: 'membership', uid: member.uid },
        items: { data: [{ current_period_end: YEAR_AHEAD }] },
        ...sub
    };
    return {
        calls, subscription,
        checkout: { sessions: {
            async create(p) { calls.checkout.push(p); return { id: 'cs_test_abcdefghijkl', url: 'https://checkout.stripe.com/c/pay/cs_test' }; },
            async retrieve(id) {
                if (id === 'cs_test_missing00000') throw new Error('No such session');
                return { id, status: 'complete', mode: 'subscription', subscription: 'sub_123', metadata: { kind: 'membership', uid: member.uid } };
            }
        } },
        subscriptions: { async retrieve() { return subscription; } },
        billingPortal: { sessions: { async create(p) { calls.portal.push(p); return { url: 'https://billing.stripe.com/p/session/x' }; } } }
    };
}

function service(opts = {}) {
    const firebase = opts.firebase || fakeFirebase();
    const stripe = opts.stripe === undefined ? fakeStripe() : opts.stripe;
    let t = NOW;
    const svc = createMembershipService({ firebase, getStripe: () => stripe, env: ENV, now: () => t });
    return { svc, firebase, stripe, advance: (ms) => { t += ms; } };
}

test('the webhook acts on exactly the five membership events', () => {
    assert.deepEqual([...HANDLED_EVENTS], [
        'checkout.session.completed', 'invoice.paid', 'invoice.payment_failed',
        'customer.subscription.updated', 'customer.subscription.deleted'
    ]);
    assert.deepEqual(CHAT_TOPICS.map(t => t.label), ['Joint Projects', 'Jobs', 'ASEAN Projects', 'Cambodia AI Centre', 'Student Collaboration']);
});

test('price defaults to AUD $90.00 (9000 cents) and the Telegram link must be a t.me https URL', () => {
    assert.equal(membershipPriceCents({}), 9000);
    assert.equal(membershipPriceCents({ MEMBERSHIP_PRICE_AUD_CENTS: 'abc' }), 9000);
    assert.equal(telegramInviteUrl({ TELEGRAM_INVITE_URL: 'https://t.me/+AbC' }), 'https://t.me/+AbC');
    assert.equal(telegramInviteUrl({ TELEGRAM_INVITE_URL: 'javascript:alert(1)' }), '');
    assert.equal(telegramInviteUrl({ TELEGRAM_INVITE_URL: 'https://evil.example/t.me' }), '');
});

test('only active or trialing records within the paid period count as members', () => {
    const future = new Date(NOW + 864e5).toISOString();
    assert.equal(isActiveRecord({ status: 'active', currentPeriodEnd: future }, NOW), true);
    assert.equal(isActiveRecord({ status: 'past_due', currentPeriodEnd: future }, NOW), false);
    assert.equal(isActiveRecord({ status: 'active', currentPeriodEnd: new Date(NOW - 1).toISOString() }, NOW), false);
    assert.equal(isActiveRecord(null, NOW), false);
});

test('checkout is a yearly AUD subscription with GST added on top, tagged #aifoundation', async () => {
    const { svc, stripe } = service();
    const { url } = await svc.createCheckout({ user: member, origin: 'https://www.aifoundation.net.au', body: { returnPath: '/projects' } });
    assert.match(url, /^https:\/\/checkout\.stripe\.com\//);
    const p = stripe.calls.checkout[0];
    assert.equal(p.mode, 'subscription');
    assert.equal('payment_method_types' in p, false, 'Stripe rejects payment_method_types on Checkout Sessions');
    assert.deepEqual(p.automatic_tax, { enabled: true });
    const price = p.line_items[0].price_data;
    assert.equal(price.currency, 'aud');
    assert.equal(price.unit_amount, 9000);
    assert.equal(price.tax_behavior, 'exclusive');
    assert.deepEqual(price.recurring, { interval: 'year' });
    assert.equal(p.metadata.businessId, '#aifoundation');
    assert.equal(p.subscription_data.metadata.uid, member.uid);
    assert.equal(p.customer_email, member.email);
    assert.match(p.success_url, /^https:\/\/www\.aifoundation\.net\.au\/projects\?membership=success&session_id=\{CHECKOUT_SESSION_ID\}$/);
});

test('an unsafe returnPath falls back to the home page', async () => {
    const { svc, stripe } = service();
    await svc.createCheckout({ user: member, origin: 'https://x.test', body: { returnPath: '//evil.example' } });
    assert.match(stripe.calls.checkout[0].success_url, /^https:\/\/x\.test\/\?membership=success/);
});

test('active members cannot subscribe twice; extra body fields are rejected', async () => {
    const { svc } = service();
    await svc.syncSubscription('sub_123');
    await assert.rejects(svc.createCheckout({ user: member, origin: 'https://x.test', body: {} }), e => e.statusCode === 409);
    const fresh = service();
    await assert.rejects(fresh.svc.createCheckout({ user: member, origin: 'https://x.test', body: { price: 1 } }), e => e.statusCode === 400);
});

test('without Stripe keys checkout answers 503', async () => {
    const { svc } = service({ stripe: null });
    await assert.rejects(svc.createCheckout({ user: member, origin: 'https://x.test', body: {} }), e => e.statusCode === 503);
});

test('confirm activates the membership, is idempotent, and only the buyer can confirm', async () => {
    const { svc, firebase } = service();
    const first = await svc.confirmCheckout({ uid: member.uid, sessionId: 'cs_test_abcdefghijkl' });
    assert.equal(first.isMember, true);
    assert.equal(first.telegramUrl, ENV.TELEGRAM_INVITE_URL);
    const again = await svc.confirmCheckout({ uid: member.uid, sessionId: 'cs_test_abcdefghijkl' });
    assert.equal(again.isMember, true);
    assert.equal(firebase.cols.get(MEMBERS_COLLECTION).size, 1);
    await assert.rejects(svc.confirmCheckout({ uid: 'someone_else1', sessionId: 'cs_test_abcdefghijkl' }), e => e.statusCode === 404);
    await assert.rejects(svc.confirmCheckout({ uid: member.uid, sessionId: 'bad' }), e => e.statusCode === 400);
    await assert.rejects(svc.confirmCheckout({ uid: member.uid, sessionId: 'cs_test_missing00000' }), e => e.statusCode === 404);
});

test('non-members get no Telegram link', async () => {
    const { svc } = service();
    const s = await svc.getStatus(member.uid);
    assert.equal(s.isMember, false);
    assert.equal(s.telegramUrl, '');
    assert.equal(s.status, 'none');
});

test('webhook: each of the five events syncs the subscription; other events are ignored', async () => {
    const { svc, stripe, firebase } = service();
    const events = [
        { type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_123', metadata: { kind: 'membership' } } } },
        { type: 'invoice.paid', data: { object: { parent: { subscription_details: { subscription: 'sub_123' } } } } },
        { type: 'invoice.payment_failed', data: { object: { subscription: 'sub_123' } } },
        { type: 'customer.subscription.updated', data: { object: { id: 'sub_123' } } },
        { type: 'customer.subscription.deleted', data: { object: { id: 'sub_123' } } }
    ];
    for (const e of events) assert.equal((await svc.handleWebhookEvent(e)).handled, true, e.type);

    stripe.subscription.status = 'past_due';
    await svc.handleWebhookEvent(events[2]);
    assert.equal(firebase.cols.get(MEMBERS_COLLECTION).get(member.uid).status, 'past_due');
    assert.equal((await svc.getStatus(member.uid)).isMember, false, 'failed renewal pauses access');

    stripe.subscription.status = 'canceled';
    await svc.handleWebhookEvent(events[4]);
    assert.equal((await svc.getStatus(member.uid)).isMember, false);

    assert.equal((await svc.handleWebhookEvent({ type: 'payment_intent.succeeded', data: { object: {} } })).handled, false);
    assert.equal((await svc.handleWebhookEvent({ type: 'checkout.session.completed', data: { object: { mode: 'payment', metadata: { kind: 'tokens' } } } })).handled, false);
});

test('webhook ignores subscriptions that are not AI Foundation memberships', async () => {
    const { svc, firebase } = service({ stripe: fakeStripe({ metadata: { kind: 'other' } }) });
    const r = await svc.handleWebhookEvent({ type: 'customer.subscription.updated', data: { object: { id: 'sub_123' } } });
    assert.equal(r.handled, false);
    assert.equal(firebase.cols.has(MEMBERS_COLLECTION), false);
});

test('members chat: members and admins only, text validated, rate limited', async () => {
    const { svc, advance, firebase } = service();
    await assert.rejects(svc.listMessages(member, 'jobs'), e => e.statusCode === 403);
    await assert.rejects(svc.postMessage(member, { topic: 'jobs', text: 'hi' }), e => e.statusCode === 403);

    await svc.syncSubscription('sub_123');
    const posted = await svc.postMessage(member, { topic: 'jobs', text: '  Hello\u0007 team  ' });
    assert.equal(posted.text, 'Hello team');
    await assert.rejects(svc.postMessage(member, { topic: 'jobs', text: 'too fast' }), e => e.statusCode === 429);
    advance(3000);
    await assert.rejects(svc.postMessage(member, { topic: 'nope', text: 'x' }), e => e.statusCode === 400);
    await assert.rejects(svc.postMessage(member, { topic: 'jobs', text: '   ' }), e => e.statusCode === 400);
    await assert.rejects(svc.postMessage(member, { topic: 'jobs', text: 'x'.repeat(2001) }), e => e.statusCode === 400);
    await assert.rejects(svc.postMessage(member, { topic: 'jobs', text: 'ok', extra: 1 }), e => e.statusCode === 400);

    const list = await svc.listMessages(member, 'jobs');
    assert.equal(list.length, 1);
    assert.equal(list[0].mine, true);
    assert.equal('authorUid' in list[0], false, 'uids are not sent to the browser');
    assert.equal((await svc.listMessages(admin, 'jobs'))[0].mine, false, 'admins can read without a membership');
    assert.equal(firebase.cols.get(CHAT_COLLECTION).get(posted.id).businessId, '#aifoundation');
});

test('only admins can delete chat messages', async () => {
    const { svc, firebase } = service();
    await svc.syncSubscription('sub_123');
    const m = await svc.postMessage(member, { topic: 'jobs', text: 'remove me' });
    await assert.rejects(svc.deleteMessage(member, m.id), e => e.statusCode === 403);
    await assert.rejects(svc.deleteMessage(admin, '../etc'), e => e.statusCode === 400);
    assert.deepEqual(await svc.deleteMessage(admin, m.id), { deleted: m.id });
    assert.equal(firebase.cols.get(CHAT_COLLECTION).has(m.id), false);
});

test('SuperAdmins get complimentary membership: member access, Telegram link, and never a Stripe charge', async () => {
    const superAdmin = { uid: 'super_admin01', email: 's@example.com', name: 'Super', isAdmin: true, isSuperAdmin: true };
    const { svc, stripe, firebase } = service();
    const s = await svc.getStatus(superAdmin.uid, { isSuperAdmin: true });
    assert.equal(s.isMember, true);
    assert.equal(s.status, 'complimentary');
    assert.equal(s.telegramUrl, ENV.TELEGRAM_INVITE_URL);
    await assert.rejects(svc.createCheckout({ user: superAdmin, origin: 'https://x.test', body: {} }), e => e.statusCode === 409);
    assert.equal(stripe.calls.checkout.length, 0, 'no Checkout Session created');
    assert.equal(firebase.cols.has(MEMBERS_COLLECTION), false, 'no membership record needed');
    assert.equal((await svc.postMessage(superAdmin, { topic: 'jobs', text: 'hello' })).mine, true, 'chat access');
    const regular = await svc.getStatus(member.uid, { isSuperAdmin: false });
    assert.equal(regular.isMember, false, 'regular users are not complimentary');
});

test('both SuperAdmins and active members can send http/https links in Members Chat', async () => {
    const superAdmin = { uid: 'super_admin01', email: 's@example.com', name: 'Super', isAdmin: true, isSuperAdmin: true };
    const { svc } = service();
    await svc.syncSubscription('sub_123');
    const saMsg = await svc.postMessage(superAdmin, {
        topic: 'asean-projects',
        text: 'Project brief: https://www.aifoundation.net.au/projects.html (check today).'
    });
    const memMsg = await svc.postMessage(member, {
        topic: 'asean-projects',
        text: 'Shared deck at https://docs.example.org/deck'
    });
    assert.match(saMsg.text, /https:\/\/www\.aifoundation\.net\.au\/projects\.html/);
    assert.match(memMsg.text, /https:\/\/docs\.example\.org\/deck/);
    const listed = await svc.listMessages(member, 'asean-projects');
    assert.equal(listed.length, 2);
    assert.equal(listed[0].text, saMsg.text);
    assert.equal(listed[1].text, memMsg.text);
});

test('Firestore unreachable: status answers 503 and chat access is refused', async () => {
    const { svc } = service({ firebase: fakeFirebase({ unreachable: true }) });
    await assert.rejects(svc.getStatus(member.uid), e => e.statusCode === 503);
    await assert.rejects(svc.listMessages(member, 'jobs'), e => e.statusCode === 403);
});
