// SuperAdmin Message Box (message-box.js): which chat_interactions documents count as messages to or from the
// SuperAdmin, how each app's format is read, and how messages group into tenant-tagged conversations.
// Usage: npm test. The fixtures mirror the formats found in the shared collection; nothing touches Firestore.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMessage, buildConversations, summarizeTenants, loadMessageBox } = require('../message-box');

const SA_UID = 'L5euSJAfNKdDOX6mT0qmrCGjUA53';
const SA_UID_2 = 'ZK79FRQoVlYhsgvMibhi81dRUWj2';
const SA_EMAIL = 'support@aifoundation.net.au';

// This site's supporter chat
const siteQuestion = {
    tag: 'aifoundation', businessId: 'aifoundation', conversationId: 'conv_user1', senderUid: 'user1',
    senderEmail: 'Jane@Example.com', senderName: 'Jane Citizen', senderRole: 'supporter', recipientUid: 'superadmin',
    recipientEmail: SA_EMAIL, recipientName: 'SuperAdmin', userMessage: 'Do you offer workshops?', createdAt: '2026-10-13T07:04:08.644Z'
};
const siteReply = {
    tag: 'aifoundation', conversationId: 'conv_user1', senderUid: SA_UID, senderEmail: SA_EMAIL, senderName: 'AI Foundation',
    senderRole: 'superadmin', recipientUid: 'user1', recipientEmail: 'jane@example.com', recipientName: 'Jane Citizen',
    userMessage: 'Yes, see https://www.aifoundation.net.au', createdAt: '2026-10-13T07:08:45.091Z'
};
// LMS: a student's support message to the SuperAdmin, and a welcome thread the SuperAdmin sent a student
const lmsSupport = {
    kind: 'lms_message', schema: 1, tag: 'lms', category: 'support', threadId: 'thr_support_1', participants: ['student1', SA_UID],
    senderUid: 'student1', senderEmail: 'sam@student.edu', senderName: 'Sam Student', senderRole: 'supporter',
    recipientEmail: SA_EMAIL, recipientName: 'SuperAdmin', subject: 'Login help', body: 'I cannot open unit 2.',
    createdAt: '2026-10-16T06:33:33.687Z', createdAtMs: 1792128813687
};
const lmsWelcome = (n, ms) => ({
    kind: 'lms_message', schema: 1, tag: 'lms', category: 'admin', threadId: 'thr_welcome_1', participants: [SA_UID, SA_UID_2, 'student2'],
    senderUid: SA_UID, senderEmail: SA_EMAIL, senderName: 'AI Foundation', senderRole: 'superadmin',
    recipientEmail: 'lee@student.edu', recipientName: 'Lee Learner', subject: `Welcome to unit ${n}`, body: `Welcome message ${n}`,
    createdAtMs: ms, meta: { enrolmentWelcome: true }
});
// AI assistant log (no tag, no people), and a message between two other people
const aiLog = { userMessage: 'What courses are open?', assistantResponse: 'Here are the courses...', systemId: 'admissions', createdAt: '2026-10-01T00:00:00.000Z' };
const userToUser = { tag: 'lms', threadId: 'thr_x', participants: ['a', 'b'], senderUid: 'a', senderEmail: 'a@x.com', recipientEmail: 'b@x.com', body: 'hi', createdAtMs: 1 };

test('AI assistant logs and messages not involving the SuperAdmin are left out', () => {
    assert.equal(normalizeMessage('ai1', aiLog), null);
    assert.equal(normalizeMessage('u1', userToUser), null);
    assert.equal(normalizeMessage('empty', { ...siteQuestion, userMessage: '   ' }), null);
    assert.equal(normalizeMessage('none', null), null);
});

test("this site's supporter message: to the SuperAdmin, counterpart is the sender, email lower-cased", () => {
    const m = normalizeMessage('m1', siteQuestion);
    assert.equal(m.tenant, 'aifoundation');
    assert.equal(m.conversationKey, 'aifoundation:conv_user1');
    assert.equal(m.fromSuperAdmin, false);
    assert.deepEqual(m.counterpart, { uid: 'user1', email: 'jane@example.com', name: 'Jane Citizen' });
    assert.equal(m.text, 'Do you offer workshops?');
    assert.equal(m.createdAt, '2026-10-13T07:04:08.644Z');
});

test('SuperAdmin replies are recognised by UID, email or role (including the older super_admin)', () => {
    assert.equal(normalizeMessage('r1', siteReply).fromSuperAdmin, true);
    assert.equal(normalizeMessage('r2', { ...siteReply, senderUid: 'x', senderEmail: 'davidrobertson.info@gmail.com', senderRole: '' }).fromSuperAdmin, true);
    assert.equal(normalizeMessage('r3', { ...siteReply, senderUid: 'x', senderEmail: 'x@y.com', senderRole: 'super_admin' }).fromSuperAdmin, true);
    assert.deepEqual(normalizeMessage('r1', siteReply).counterpart, { uid: 'user1', email: 'jane@example.com', name: 'Jane Citizen' });
});

test('LMS format: threadId, body, subject and participants are read', () => {
    const support = normalizeMessage('l1', lmsSupport);
    assert.equal(support.tenant, 'lms');
    assert.equal(support.conversationKey, 'lms:thr_support_1');
    assert.equal(support.subject, 'Login help');
    assert.equal(support.text, 'I cannot open unit 2.');
    assert.equal(support.fromSuperAdmin, false);

    const welcome = normalizeMessage('l2', lmsWelcome(1, 1792128813000));
    assert.equal(welcome.fromSuperAdmin, true);
    // The student's UID comes from the participants list (the LMS has no recipientUid)
    assert.deepEqual(welcome.counterpart, { uid: 'student2', email: 'lee@student.edu', name: 'Lee Learner' });
    assert.equal(welcome.createdAt, new Date(1792128813000).toISOString());
});

test('the SuperAdmin is found in participants given as objects too, and untagged messages are "unknown"', () => {
    const m = normalizeMessage('p1', { participants: [{ uid: 'z1' }, { email: SA_EMAIL }], senderUid: 'z1', message: 'hello', timestamp: '2026-01-01T00:00:00Z' });
    assert.equal(m.tenant, 'unknown');
    assert.equal(m.text, 'hello');
    assert.equal(m.conversationKey, 'unknown:conv_z1');
});

test('conversations: grouped per tenant thread, newest first, messages oldest first, replies only on this site', () => {
    const docs = [
        ['m1', siteQuestion], ['m2', siteReply], ['l1', lmsSupport],
        ['w2', lmsWelcome(2, Date.parse('2026-10-14T01:00:00Z'))], ['w1', lmsWelcome(1, Date.parse('2026-10-14T00:00:00Z'))],
        ['ai', aiLog], ['x', userToUser]
    ];
    const conversations = buildConversations(docs.map(([id, f]) => normalizeMessage(id, f)).filter(Boolean));
    assert.deepEqual(conversations.map(c => c.key), ['lms:thr_support_1', 'lms:thr_welcome_1', 'aifoundation:conv_user1']);

    const [support, welcome, site] = conversations;
    assert.equal(support.replyable, false);
    assert.equal(welcome.replyable, false);
    assert.equal(site.replyable, true);
    assert.equal(site.conversationId, 'conv_user1');
    assert.deepEqual(welcome.messages.map(m => m.text), ['Welcome message 1', 'Welcome message 2']);
    assert.equal(welcome.subject, 'Welcome to unit 1');
    assert.equal(welcome.lastFromSuperAdmin, true);
    assert.equal(site.messageCount, 2);
    assert.equal(site.lastFromSuperAdmin, true);
    assert.deepEqual(site.counterpart, { uid: 'user1', email: 'jane@example.com', name: 'Jane Citizen' });
    assert.ok(!('counterpart' in site.messages[0]), 'messages carry only what the thread view needs');
});

test('preview is the latest message, cut to 160 characters', () => {
    const long = { ...siteQuestion, userMessage: 'x'.repeat(500) };
    const [c] = buildConversations([normalizeMessage('m', long)]);
    assert.equal(c.preview.length, 160);
});

test('tenant summary: every tenant found, with conversation and message counts, most messages first', () => {
    const conversations = buildConversations([
        ['m1', siteQuestion], ['m2', siteReply], ['l1', lmsSupport],
        ['w1', lmsWelcome(1, 1)], ['w2', lmsWelcome(2, 2)], ['w3', lmsWelcome(3, 3)]
    ].map(([id, f]) => normalizeMessage(id, f)));
    assert.deepEqual(summarizeTenants(conversations), [
        { tag: 'lms', conversations: 2, messages: 4 },
        { tag: 'aifoundation', conversations: 1, messages: 2 }
    ]);
});

test('Message Box access: only the two SuperAdmins get through, not site admins', () => {
    const { requireSuperAdmin } = require('../auth-middleware');
    const run = user => {
        let status = null;
        let passed = false;
        const res = { status(code) { status = code; return { json: () => {} }; } };
        requireSuperAdmin({ user }, res, () => { passed = true; });
        return passed ? 'next' : status;
    };
    assert.equal(run(null), 401);
    assert.equal(run({ uid: 'admin1', isAdmin: true, isSuperAdmin: false }), 403);
    assert.equal(run({ uid: SA_UID, isAdmin: true, isSuperAdmin: true }), 'next');
});

test('loadMessageBox reads the whole collection, and reports when Firestore is unavailable', async () => {
    const calls = [];
    const firebase = {
        async listDocuments(collection) {
            calls.push(collection);
            return [{ id: 'm1', fields: siteQuestion }, { id: 'ai', fields: aiLog }, { id: 'l1', fields: lmsSupport }];
        }
    };
    const box = await loadMessageBox({ firebase });
    assert.deepEqual(calls, ['chat_interactions']);
    assert.equal(box.conversations.length, 2);
    assert.deepEqual(box.tenants.map(t => t.tag).sort(), ['aifoundation', 'lms']);

    assert.equal(await loadMessageBox({ firebase: { listDocuments: async () => null } }), null);
});
