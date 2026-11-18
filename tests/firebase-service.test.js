// syncUser saves the role on a user's profile, and isAdmin() in firestore.rules trusts that role. So an email counts
// towards the SuperAdmin and admin lists only once Google has verified it: anyone can sign up with email/password
// using an address they don't own, such as the service account's, which the server's SuperAdmin list includes.
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
