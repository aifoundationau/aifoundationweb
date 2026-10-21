// Compiles firestore.rules and runs test cases via the Firebase Rules API (projects:test). Nothing is deployed.
// Usage: RULES_TEST_TOKEN="$(gcloud auth print-access-token)" node tests/firestore-rules-test.js
//   (needs the firebaserules.rulesets.test permission; without RULES_TEST_TOKEN it tries the .env service account)
const crypto = require('crypto'); const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'ai-foundation-firebase';

async function token() {
  if (process.env.RULES_TEST_TOKEN) return process.env.RULES_TEST_TOKEN;
  const now = Math.floor(Date.now() / 1000), b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b({ alg: 'RS256', typ: 'JWT' }) + '.' + b({ iss: process.env.FIREBASE_CLIENT_EMAIL, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 });
  const jwt = h + '.' + crypto.sign('RSA-SHA256', Buffer.from(h), process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
  const j = await r.json(); if (!j.access_token) throw new Error(JSON.stringify(j)); return j.access_token;
}

const P = p => `/databases/(default)/documents/${p}`;
const SUPER = { uid: 'ZK79FRQoVlYhsgvMibhi81dRUWj2', token: { email: 'support@aifoundation.net.au', email_verified: true } };
const USER = { uid: 'user1', token: { email: 'user1@example.com', email_verified: true } };
const FAKE_SUPER = { uid: 'attacker', token: { email: 'support@aifoundation.net.au', email_verified: false } };
const noProfile = [{ function: 'exists', args: [{ anyValue: {} }], result: { value: false } }];
const adminProfile = [
  { function: 'exists', args: [{ anyValue: {} }], result: { value: true } },
  { function: 'get', args: [{ anyValue: {} }], result: { value: { data: { role: 'admin' } } } }
];
const sup = { role: 'supporter', status: 'supporter', classification: 'Supporter', isSuperAdmin: false, email: 'user1@example.com' };

const T = (name, expectation, method, p, auth, opts = {}) => ({ name, tc: {
  expectation, functionMocks: opts.mocks || noProfile,
  request: { method, path: P(p), ...(auth ? { auth } : {}), ...(opts.newData ? { resource: { data: opts.newData } } : {}) },
  ...(opts.oldData ? { resource: { data: opts.oldData } } : {}) } });

const cases = [
  T('public can read content', 'ALLOW', 'get', 'content/a', null),
  T('anonymous cannot write content', 'DENY', 'create', 'content/a', null, { newData: { title: 'x' } }),
  T('normal user cannot write content', 'DENY', 'create', 'content/a', USER, { newData: { title: 'x' } }),
  T('admin (role in profile) can write content', 'ALLOW', 'create', 'content/a', USER, { newData: { title: 'x' }, mocks: adminProfile }),
  T('superadmin can delete content', 'ALLOW', 'delete', 'content/a', SUPER, { oldData: { title: 'x' } }),
  T('unverified email cannot impersonate superadmin', 'DENY', 'delete', 'content/a', FAKE_SUPER, { oldData: { title: 'x' } }),
  T('anonymous cannot read user profile (PII)', 'DENY', 'get', 'users/user1', null, { oldData: sup }),
  T('user cannot read another user profile', 'DENY', 'get', 'users/user2', USER, { oldData: sup }),
  T('user can read own profile', 'ALLOW', 'get', 'users/user1', USER, { oldData: sup }),
  T('superadmin can read any profile', 'ALLOW', 'get', 'users/user2', SUPER, { oldData: sup }),
  T('user can create own supporter profile', 'ALLOW', 'create', 'users/user1', USER, { newData: sup }),
  T('user cannot create own profile as admin', 'DENY', 'create', 'users/user1', USER, { newData: { ...sup, role: 'admin' } }),
  T('user can update own displayName', 'ALLOW', 'update', 'users/user1', USER, { oldData: sup, newData: { ...sup, displayName: 'New' } }),
  T('user cannot promote self to admin', 'DENY', 'update', 'users/user1', USER, { oldData: sup, newData: { ...sup, role: 'admin' } }),
  T('user cannot set isSuperAdmin', 'DENY', 'update', 'users/user1', USER, { oldData: sup, newData: { ...sup, isSuperAdmin: true } }),
  T('user cannot write another profile', 'DENY', 'update', 'users/user2', USER, { oldData: sup, newData: { ...sup, displayName: 'x' } }),
  T('user cannot read transactions', 'DENY', 'get', 'transactions/t1', USER, { oldData: { amount: 50 } }),
  T('admin can read transactions', 'ALLOW', 'get', 'transactions/t1', SUPER, { oldData: { amount: 50 } }),
  T('nobody writes transactions from client', 'DENY', 'create', 'transactions/t1', SUPER, { newData: { amount: 50 } }),
  T('user cannot read stripe_transactions', 'DENY', 'get', 'stripe_transactions/pi_1', USER, { oldData: { amount: 50 } }),
  T('admin can read paypal_transactions', 'ALLOW', 'get', 'paypal_transactions/o1', SUPER, { oldData: { amount: 50 } }),
  T('nobody writes stripe_transactions from client', 'DENY', 'create', 'stripe_transactions/pi_1', SUPER, { newData: { amount: 50 } }),
  T('user can send chat as self', 'ALLOW', 'create', 'chat_interactions/m1', USER, { newData: { senderUid: 'user1' } }),
  T('user cannot send chat as someone else', 'DENY', 'create', 'chat_interactions/m1', USER, { newData: { senderUid: 'user2' } }),
  T('user can read own chat', 'ALLOW', 'get', 'chat_interactions/m1', USER, { oldData: { senderUid: 'user1', recipientUid: 'superadmin' } }),
  T('user cannot read another chat', 'DENY', 'get', 'chat_interactions/m1', USER, { oldData: { senderUid: 'user2', recipientUid: 'superadmin' } }),
  T('public cannot read admin email list', 'DENY', 'get', 'system_settings/admin_emails', null, { oldData: { emails: [] } }),
  T('user cannot read admins list', 'DENY', 'get', 'admins/admin_emails', USER, { oldData: { emails: [] } }),
  T('fallback: other tenant collection still public read', 'ALLOW', 'get', 'lms_courses/c1', null, { oldData: { x: 1 } }),
  T('fallback: other tenant collection signed-in write', 'ALLOW', 'create', 'lms_courses/c1', USER, { newData: { x: 1 } }),
  T('fallback: subcollection of users stays protected', 'DENY', 'get', 'users/user1/private/x', null, { oldData: { x: 1 } }),
];

(async () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  const r = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rules }] }, testSuite: { testCases: cases.map(c => c.tc) } })
  });
  const j = await r.json();
  if (!r.ok) { console.log('API error', r.status, JSON.stringify(j).slice(0, 800)); process.exit(2); }
  if (j.issues?.length) console.log('Compile issues:', JSON.stringify(j.issues, null, 1));
  let fail = 0;
  (j.testResults || []).forEach((t, i) => {
    const ok = t.state === 'SUCCESS'; if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${cases[i].name}${ok ? '' : '  ' + JSON.stringify(t.debugMessages || t.errorPosition || '')}`);
  });
  console.log(`\n${cases.length - fail}/${cases.length} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(2); });
