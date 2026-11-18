// firebase-service.js decisions that must rest on the verified sign-in, not on what anyone can write to Firestore:
// - syncUser saves the role on a user's profile, and isAdmin() in firestore.rules trusts that role. So an email counts
//   towards the SuperAdmin and admin lists only once Google has verified it: anyone can sign up with email/password
//   using an address they don't own, such as the service account's, which the server's SuperAdmin list includes.
// - A supporter's chat shows only their own messages and real SuperAdmin replies, recognised by senderUid: anyone
//   signed in can write a chat message straight to Firestore with any senderRole, senderName or recipient.
// Usage: npm test. Firestore is switched off (no private key) and fetch is blocked, so nothing is read or saved.
const SERVICE_ACCOUNT = 'firebase-adminsdk-fbsvc@test-project.iam.gserviceaccount.com';
// Set before firebase-service.js loads: dotenv never overrides variables that are already set
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = SERVICE_ACCOUNT;
process.env.FIREBASE_PRIVATE_KEY = '';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const fetchCalls = [];
globalThis.fetch = async url => {
    fetchCalls.push(String(url));
    throw new Error('Network is blocked in this test');
};

const firebase = require('../firebase-service');

const SUPPORTER = { role: 'supporter', status: 'supporter', classification: 'Supporter', isSuperAdmin: false };
const SUPERADMIN = { role: 'superadmin', status: 'superadmin', classification: 'Superadmin', isSuperAdmin: true };

// The role syncUser would save for this sign-in
async function savedRole(t, userData) {
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'warn', () => {});
    const { user } = await firebase.syncUser(userData);
    assert.deepEqual(fetchCalls, [], 'nothing may be read from or saved to Firestore');
    return { role: user.role, status: user.status, classification: user.classification, isSuperAdmin: user.isSuperAdmin };
}

test('the service account address is on the server SuperAdmin list, as on the live site', () => {
    assert.ok(firebase.SUPERADMIN_EMAILS.includes(SERVICE_ACCOUNT));
});

test('signing up with the service account address (unverified) does not make a SuperAdmin', async t => {
    assert.deepEqual(await savedRole(t, { uid: 'attacker1', email: SERVICE_ACCOUNT, emailVerified: false }), SUPPORTER);
});

test('an unverified SuperAdmin email does not make a SuperAdmin', async t => {
    assert.deepEqual(await savedRole(t, { uid: 'attacker2', email: 'support@aifoundation.net.au', emailVerified: false }), SUPPORTER);
});

test('an email nobody says is verified is not trusted', async t => {
    assert.deepEqual(await savedRole(t, { uid: 'attacker3', email: 'davidrobertson.info@gmail.com' }), SUPPORTER);
});

test('a verified SuperAdmin email makes a SuperAdmin, whatever its case', async t => {
    assert.deepEqual(await savedRole(t, { uid: 'new-uid', email: 'Support@AIFoundation.net.au', emailVerified: true }), SUPERADMIN);
});

test('a SuperAdmin UID stays SuperAdmin whatever its email', async t => {
    assert.deepEqual(await savedRole(t, { uid: 'ZK79FRQoVlYhsgvMibhi81dRUWj2', email: 'someone@example.com', emailVerified: false }), SUPERADMIN);
});

test('a verified email on no list stays a supporter', async t => {
    assert.deepEqual(await savedRole(t, { uid: 'user1', email: 'user1@example.com', emailVerified: true }), SUPPORTER);
});

// Chat messages as listDocuments('chat_interactions') returns them ({ id, fields })
const SUPERADMIN_UID = 'ZK79FRQoVlYhsgvMibhi81dRUWj2';
const chatDoc = (id, fields) => ({
    id,
    fields: { userMessage: `text ${id}`, tag: 'aifoundation', businessId: '#aifoundation', businessName: 'AI Foundation', source: 'aifoundation', ...fields }
});
const chat = [
    chatDoc('own', { senderUid: 'user1', senderRole: 'supporter', recipientUid: 'superadmin', conversationId: 'conv_user1', createdAt: '2026-11-18T01:00:00.000Z' }),
    chatDoc('reply', { senderUid: SUPERADMIN_UID, senderRole: 'superadmin', recipientUid: 'user1', conversationId: 'conv_user1', createdAt: '2026-11-18T02:00:00.000Z' }),
    // Written straight to Firestore by another signed-in user, dressed up as the SuperAdmin
    chatDoc('forged', { senderUid: 'attacker', senderRole: 'superadmin', senderName: 'AI Foundation', senderEmail: 'support@aifoundation.net.au', recipientUid: 'user1', conversationId: 'conv_user1', createdAt: '2026-11-18T03:00:00.000Z' }),
    // A Message Box reply that knew only the conversation, not the supporter's UID
    chatDoc('reply-by-conversation', { senderUid: SUPERADMIN_UID, senderRole: 'superadmin', recipientUid: 'supporter', conversationId: 'conv_user1', createdAt: '2026-11-18T04:00:00.000Z' }),
    chatDoc('older-reply', { senderUid: 'superadmin', senderRole: 'super_admin', recipientUid: 'user1', conversationId: 'conv_user1', createdAt: '2026-11-18T00:30:00.000Z' }),
    chatDoc('someone-else', { senderUid: 'user2', senderRole: 'supporter', recipientUid: 'superadmin', conversationId: 'conv_user2', createdAt: '2026-11-18T01:30:00.000Z' }),
    { id: 'assistant-log', fields: { userMessage: 'q', assistantResponse: 'a', senderUid: 'user1', conversationId: 'conv_user1' } }
];
const ids = messages => messages.map(m => m.id);

test('chat: a supporter sees their own messages and real SuperAdmin replies, oldest first, without tenant tags', () => {
    const shown = firebase.selectConversationMessages(chat, 'conv_user1', { requesterUid: 'user1' });
    assert.deepEqual(ids(shown), ['older-reply', 'own', 'reply', 'reply-by-conversation']);
    for (const m of shown) assert.ok(!('tag' in m) && !('businessId' in m) && !('businessName' in m) && !('source' in m));
});

test('chat: a message another user dressed up as the SuperAdmin is not shown to the supporter', () => {
    assert.ok(!ids(firebase.selectConversationMessages(chat, 'conv_user1', { requesterUid: 'user1' })).includes('forged'));
});

test('chat: nothing is shown without a signed-in supporter', () => {
    assert.deepEqual(firebase.selectConversationMessages(chat, 'conv_user1', {}), []);
});

test('chat: the SuperAdmin still sees every message in the conversation, with tenant tags', () => {
    const shown = firebase.selectConversationMessages(chat, 'conv_user1', { isSuperAdmin: true, requesterUid: SUPERADMIN_UID });
    assert.deepEqual(ids(shown), ['older-reply', 'own', 'reply', 'forged', 'reply-by-conversation']);
    assert.ok(shown.every(m => m.tag === 'aifoundation'));
});

test('chat: only the last `limit` messages are returned', () => {
    assert.deepEqual(ids(firebase.selectConversationMessages(chat, 'conv_user1', { requesterUid: 'user1', limit: 2 })), ['reply', 'reply-by-conversation']);
});
