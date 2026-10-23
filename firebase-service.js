/**
 * AI Foundation - Firebase Service Layer
 * Multi-Tenant Cloud Firestore Client for 'ai-foundation-firebase'
 * Partitioned with: tag = 'aifoundation', businessId = 'aifoundation'
 * 
 * Secure server-side Firestore operations via Google Cloud Service Account OAuth2
 */

require('dotenv').config();
const crypto = require('crypto');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'ai-foundation-firebase';
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const RAW_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;
const TRANSACTION_TAG = process.env.TRANSACTION_TAG || 'aifoundation';
const BUSINESS_ID = process.env.BUSINESS_ID || 'aifoundation';

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Format private key handling literal \n strings
 */
function getFormattedPrivateKey() {
    if (!RAW_PRIVATE_KEY) return null;
    return RAW_PRIVATE_KEY.replace(/\\n/g, '\n');
}

/**
 * Obtain Google OAuth2 access token using Service Account JWT
 */
async function getAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    // Reuse cached token if valid for more than 2 minutes
    if (cachedToken && tokenExpiresAt > now + 120) {
        return cachedToken;
    }

    const privateKey = getFormattedPrivateKey();
    if (!CLIENT_EMAIL || !privateKey) {
        console.warn('[Firebase] Service account credentials not configured. Direct Firestore writes disabled.');
        return null;
    }

    try {
        const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({
            iss: CLIENT_EMAIL,
            scope: 'https://www.googleapis.com/auth/datastore',
            aud: 'https://oauth2.googleapis.com/token',
            exp: now + 3600,
            iat: now
        })).toString('base64url');

        const signer = crypto.createSign('RSA-SHA256');
        signer.update(header + '.' + payload);
        const signature = signer.sign(privateKey, 'base64url');
        const jwt = `${header}.${payload}.${signature}`;

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt
        });

        const data = await tokenRes.json();
        if (data.access_token) {
            cachedToken = data.access_token;
            tokenExpiresAt = now + (data.expires_in || 3600);
            return cachedToken;
        } else {
            console.error('[Firebase] OAuth token error:', data);
            return null;
        }
    } catch (err) {
        console.error('[Firebase] Failed to create access token:', err.message);
        return null;
    }
}

/**
 * Convert native JavaScript value to Firestore REST field structure
 */
function toFirestoreValue(val) {
    if (val === null || val === undefined) {
        return { nullValue: null };
    }
    if (typeof val === 'boolean') {
        return { booleanValue: val };
    }
    if (typeof val === 'number') {
        if (Number.isInteger(val)) {
            return { integerValue: val.toString() };
        }
        return { doubleValue: val };
    }
    if (typeof val === 'string') {
        // Detect ISO 8601 timestamps
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(val)) {
            return { timestampValue: val };
        }
        return { stringValue: val };
    }
    if (val instanceof Date) {
        return { timestampValue: val.toISOString() };
    }
    if (Array.isArray(val)) {
        return {
            arrayValue: {
                values: val.map(toFirestoreValue)
            }
        };
    }
    if (typeof val === 'object') {
        const fields = {};
        for (const [k, v] of Object.entries(val)) {
            if (v !== undefined) {
                fields[k] = toFirestoreValue(v);
            }
        }
        return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
}

/**
 * Convert native JavaScript object to Firestore fields map
 */
function toFirestoreFields(obj) {
    const fields = {};
    for (const [key, val] of Object.entries(obj)) {
        if (val !== undefined) {
            fields[key] = toFirestoreValue(val);
        }
    }
    return fields;
}

/**
 * Convert Firestore REST field structure to native JavaScript value
 */
function fromFirestoreValue(valObj) {
    if (!valObj) return null;
    if ('stringValue' in valObj) return valObj.stringValue;
    if ('integerValue' in valObj) return parseInt(valObj.integerValue, 10);
    if ('doubleValue' in valObj) return parseFloat(valObj.doubleValue);
    if ('booleanValue' in valObj) return valObj.booleanValue;
    if ('timestampValue' in valObj) return valObj.timestampValue;
    if ('nullValue' in valObj) return null;
    if ('arrayValue' in valObj) {
        return (valObj.arrayValue.values || []).map(fromFirestoreValue);
    }
    if ('mapValue' in valObj) {
        return fromFirestoreFields(valObj.mapValue.fields || {});
    }
    return null;
}

/**
 * Convert Firestore fields map to native JavaScript object
 */
function fromFirestoreFields(fields) {
    const obj = {};
    for (const [key, valObj] of Object.entries(fields || {})) {
        obj[key] = fromFirestoreValue(valObj);
    }
    return obj;
}

/**
 * Write document to Cloud Firestore collection
 * @param {string} collectionId - Firestore collection name (e.g. 'transactions', 'stripe_transactions')
 * @param {string} documentId - Firestore document ID
 * @param {object} data - Data to persist
 * @param {boolean} merge - Whether to patch/merge with existing document
 */
async function writeDocument(collectionId, documentId, data, merge = true) {
    const token = await getAccessToken();
    if (!token) return { success: false, error: 'Authentication unavailable' };

    const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
    const docPath = `${collectionId}/${encodeURIComponent(documentId)}`;

    try {
        if (merge) {
            // Use PATCH with fieldMasks or direct document patch
            const maskParams = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
            const url = `${baseUrl}/${docPath}?${maskParams}`;
            const res = await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fields: toFirestoreFields(data)
                })
            });
            const result = await res.json();
            if (res.ok) {
                return { success: true, path: result.name };
            } else {
                console.warn(`[Firebase] Write failed for ${docPath}:`, result.error?.message || result);
                return { success: false, error: result.error?.message || 'Firestore write error' };
            }
        } else {
            const url = `${baseUrl}/${collectionId}?documentId=${encodeURIComponent(documentId)}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fields: toFirestoreFields(data)
                })
            });
            const result = await res.json();
            return res.ok ? { success: true, path: result.name } : { success: false, error: result.error?.message };
        }
    } catch (err) {
        console.error(`[Firebase] Network error writing ${docPath}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Read document from Cloud Firestore
 */
async function getDocument(collectionId, documentId) {
    const token = await getAccessToken();
    if (!token) return null;

    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionId}/${encodeURIComponent(documentId)}`;
    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return null;
        const data = await res.json();
        return fromFirestoreFields(data.fields);
    } catch (err) {
        console.error(`[Firebase] Error fetching ${collectionId}/${documentId}:`, err.message);
        return null;
    }
}

/**
 * Read every document in a collection, following Firestore's pages (one request returns at most a page).
 * Returns [{ id, fields }] with plain values, or null when Firestore can't be reached or a page fails
 */
async function listDocuments(collectionId, { pageSize = 300, maxPages = 40 } = {}) {
    const token = await getAccessToken();
    if (!token) return null;

    const docs = [];
    let pageToken = '';
    try {
        for (let page = 0; page < maxPages; page++) {
            const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionId}?pageSize=${pageSize}` +
                (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) {
                console.warn(`[Firebase] Listing ${collectionId} failed (HTTP ${res.status})`);
                return null;
            }
            const data = await res.json();
            for (const d of data.documents || []) {
                docs.push({ id: d.name.split('/').pop(), fields: fromFirestoreFields(d.fields || {}) });
            }
            pageToken = data.nextPageToken || '';
            if (!pageToken) return docs;
        }
        console.warn(`[Firebase] Listing ${collectionId} stopped after ${maxPages} pages (${docs.length} documents)`);
        return docs;
    } catch (err) {
        console.error(`[Firebase] Error listing ${collectionId}:`, err.message);
        return null;
    }
}

/**
 * Delete document from Cloud Firestore
 */
async function deleteDocument(collectionId, documentId) {
    const token = await getAccessToken();
    if (!token) return { success: false, error: 'No token' };

    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionId}/${encodeURIComponent(documentId)}`;
    try {
        const res = await fetch(url, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return { success: res.ok, status: res.status };
    } catch (err) {
        console.error(`[Firebase] Error deleting ${collectionId}/${documentId}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Record a transaction in Cloud Firestore.
 * GUARANTEE: Every transaction MUST have tag 'aifoundation' attached to it.
 * 
 * Writes to:
 * 1. 'transactions' (primary multi-tenant collection, filtered by tag = 'aifoundation')
 * 2. 'stripe_transactions' (if paymentMethod is 'stripe')
 * 3. 'paypal_transactions' (if paymentMethod is 'paypal')
 */
async function recordTransaction(txData) {
    if (!txData || !txData.transactionId) {
        throw new Error('Transaction ID is required to record a transaction.');
    }

    const now = new Date().toISOString();
    const payload = {
        transactionId: txData.transactionId,
        tag: TRANSACTION_TAG, // CRITICAL: 'aifoundation'
        businessId: BUSINESS_ID, // 'aifoundation'
        businessName: 'AI Foundation',
        source: 'aifoundation',
        amount: Number(txData.amount) || 0,
        currency: (txData.currency || 'aud').toLowerCase(),
        paymentMethod: txData.paymentMethod || 'stripe', // 'stripe' or 'paypal'
        paymentType: txData.paymentType || 'donation',
        status: txData.status || 'initiated', // 'initiated', 'succeeded', 'failed', 'cancelled'
        description: txData.description || `AI Foundation Contribution of AUD $${txData.amount || 0}`,
        recordedAt: txData.recordedAt || now,
        updatedAt: now,
        metadata: {
            platform: 'web',
            originUrl: txData.originUrl || 'https://aifoundation.com.au',
            customerEmail: txData.customerEmail || '',
            customerName: txData.customerName || '',
            ...(txData.metadata || {})
        }
    };

    console.log(`[Firebase] Recording transaction ${payload.transactionId} with tag [${payload.tag}] (${payload.paymentMethod}, status: ${payload.status})`);

    const results = {};

    // 1. Universal transactions collection
    results.transactions = await writeDocument('transactions', payload.transactionId, payload, true);

    // 2. Provider-specific collection for cross-system parity
    if (payload.paymentMethod === 'stripe') {
        results.stripe_transactions = await writeDocument('stripe_transactions', payload.transactionId, payload, true);
    } else if (payload.paymentMethod === 'paypal') {
        results.paypal_transactions = await writeDocument('paypal_transactions', payload.transactionId, payload, true);
    }

    return {
        success: results.transactions.success,
        payload,
        results
    };
}

/**
 * Update transaction status (e.g. from 'initiated' to 'succeeded')
 */
async function updateTransactionStatus(transactionId, status, extraData = {}) {
    if (!transactionId) return { success: false, error: 'No transactionId' };

    const updatePayload = {
        tag: TRANSACTION_TAG, // Re-enforce tag: 'aifoundation'
        businessId: BUSINESS_ID,
        status: status,
        updatedAt: new Date().toISOString(),
        ...extraData
    };

    console.log(`[Firebase] Updating transaction ${transactionId} status to '${status}' [tag: ${TRANSACTION_TAG}]`);

    const res1 = await writeDocument('transactions', transactionId, updatePayload, true);
    let res2 = { success: true };

    if (extraData.paymentMethod === 'stripe' || transactionId.startsWith('pi_') || transactionId.startsWith('cs_')) {
        res2 = await writeDocument('stripe_transactions', transactionId, updatePayload, true);
    } else if (extraData.paymentMethod === 'paypal') {
        res2 = await writeDocument('paypal_transactions', transactionId, updatePayload, true);
    }

    return { success: res1.success || res2.success, updated: updatePayload };
}

/**
 * Query recent transactions for AI Foundation
 */
async function listAIFoundationTransactions(limit = 50) {
    const token = await getAccessToken();
    if (!token) return [];

    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
    const queryPayload = {
        structuredQuery: {
            from: [{ collectionId: 'transactions' }],
            where: {
                fieldFilter: {
                    field: { fieldPath: 'tag' },
                    op: 'EQUAL',
                    value: { stringValue: TRANSACTION_TAG }
                }
            },
            limit: limit
        }
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(queryPayload)
        });

        if (!res.ok) {
            console.warn('[Firebase] Query failed:', await res.text());
            return [];
        }

        const rawList = await res.json();
        const results = [];
        for (const item of rawList) {
            if (item.document && item.document.fields) {
                results.push(fromFirestoreFields(item.document.fields));
            }
        }
        return results;
    } catch (err) {
        console.error('[Firebase] Failed to query transactions:', err.message);
        return [];
    }
}

// SuperAdmin is the Firebase Admin service account email (registered on the Firebase project)
const SUPERADMIN_UIDS = [];
const SUPERADMIN_EMAILS = process.env.FIREBASE_CLIENT_EMAIL ? [process.env.FIREBASE_CLIENT_EMAIL] : [];


function isSuperAdminUser(uid, email) {
    const normUid = (uid || '').trim();
    const normEmail = (email || '').toLowerCase().trim();
    return SUPERADMIN_UIDS.includes(normUid) || SUPERADMIN_EMAILS.includes(normEmail);
}

let cachedAdminEmails = null;
let adminEmailsCachedAt = 0;

/**
 * Retrieve verified admin email addresses listed in Firebase.
 * Sources in Firebase:
 * 1. system_settings/admin_emails (emails array)
 * 2. admins/admin_emails (emails array)
 * 3. users collection in Firestore (any user with role: 'admin', 'super_admin', or 'superadmin')
 */
async function getAdminEmailsFromFirebase(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedAdminEmails && (now - adminEmailsCachedAt < 60000)) {
        return cachedAdminEmails;
    }

    const adminSet = new Set(SUPERADMIN_EMAILS);

    // 1. Check system_settings/admin_emails in Firebase
    try {
        const sysDoc = await getDocument('system_settings', 'admin_emails');
        if (sysDoc && Array.isArray(sysDoc.emails)) {
            sysDoc.emails.forEach(e => {
                if (typeof e === 'string' && e.trim()) adminSet.add(e.toLowerCase().trim());
            });
        }
    } catch (e) {
        console.warn('[Firebase] Notice reading system_settings/admin_emails:', e.message);
    }

    // 2. Check admins/admin_emails in Firebase
    try {
        const adminsDoc = await getDocument('admins', 'admin_emails');
        if (adminsDoc && Array.isArray(adminsDoc.emails)) {
            adminsDoc.emails.forEach(e => {
                if (typeof e === 'string' && e.trim()) adminSet.add(e.toLowerCase().trim());
            });
        }
    } catch (e) {
        console.warn('[Firebase] Notice reading admins/admin_emails:', e.message);
    }

    // 3. Check users collection in Firebase for existing admin roles
    try {
        const token = await getAccessToken();
        if (token) {
            const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users?pageSize=100`;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                for (const d of (data.documents || [])) {
                    const f = fromFirestoreFields(d.fields || {});
                    const role = (f.role || '').toLowerCase();
                    if (['admin', 'super_admin', 'superadmin'].includes(role) || f.status === 'admin' || f.status === 'superadmin') {
                        if (f.email && typeof f.email === 'string') {
                            adminSet.add(f.email.toLowerCase().trim());
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[Firebase] Notice querying admin users in Firestore:', e.message);
    }

    cachedAdminEmails = Array.from(adminSet);
    adminEmailsCachedAt = now;
    return cachedAdminEmails;
}

/**
 * Check if a specific user/email is authorized as superadmin in Firebase
 */
async function isEmailAdminInFirebase(email, uid) {
    if (isSuperAdminUser(uid, email)) return true;
    if (!email) return false;
    const normalized = email.toLowerCase().trim();
    const adminEmails = await getAdminEmailsFromFirebase();
    return adminEmails.includes(normalized);
}

/**
 * Synchronize Google Auth User Profile to Cloud Firestore
 * RULE: Only ZK79FRQoVlYhsgvMibhi81dRUWj2 and L5euSJAfNKdDOX6mT0qmrCGjUA53 are SuperAdmin.
 * Everyone else registering or logging in is strictly 'supporter'.
 */
async function syncUser(userData) {
    if (!userData || !userData.uid) {
        throw new Error('User UID is required to synchronize user profile.');
    }

    const email = (userData.email || '').toLowerCase().trim();
    const uid = (userData.uid || '').trim();
    
    // Check existing document to preserve fields
    let existing = null;
    try {
        existing = await getUser(uid);
    } catch (e) { }

    // Strictly verify if this user is one of the two allowed SuperAdmins
    const isSuperAdmin = isSuperAdminUser(uid, email);

    // Only these two are superadmin; everyone else is supporter (or admin if listed in Firebase)
    let assignedRole = 'supporter';
    let assignedStatus = 'supporter';
    let assignedClassification = 'Supporter';

    if (isSuperAdmin) {
        assignedRole = 'superadmin';
        assignedStatus = 'superadmin';
        assignedClassification = 'Superadmin';
    } else {
        const isAdmin = await isEmailAdminInFirebase(email, uid);
        if (isAdmin) {
            assignedRole = 'admin';
            assignedStatus = 'admin';
            assignedClassification = 'Admin';
        }
    }

    const now = new Date().toISOString();
    const resolvedDisplayName = (userData.displayName || '').trim() || (existing && existing.displayName) || '';
    const resolvedPhotoURL = userData.photoURL || (existing && existing.photoURL) || '';

    const payload = {
        uid: uid,
        email: email,
        displayName: resolvedDisplayName,
        photoURL: resolvedPhotoURL,
        tag: TRANSACTION_TAG, // 'aifoundation'
        businessId: BUSINESS_ID, // 'aifoundation'
        businessName: 'AI Foundation',
        source: 'aifoundation',
        authProvider: 'google',
        role: assignedRole,
        status: assignedStatus,
        classification: assignedClassification,
        isSuperAdmin: isSuperAdmin,
        lastLoginAt: now,
        updatedAt: now
    };

    // Clean up tags: SuperAdmin must never retain 'supporter' tag
    let userTags = [];
    if (existing && Array.isArray(existing.tags)) {
        userTags = existing.tags.slice();
    }
    if (isSuperAdmin) {
        userTags = userTags.filter(t => t !== 'supporter');
        if (!userTags.includes('superadmin')) userTags.push('superadmin');
        payload.tags = userTags;
    } else if (userTags.length > 0) {
        payload.tags = userTags;
    }

    if (userData.phoneNumber !== undefined && userData.phoneNumber !== null) {
        payload.phoneNumber = String(userData.phoneNumber).trim();
    } else if (existing && existing.phoneNumber) {
        payload.phoneNumber = existing.phoneNumber;
    }

    if (userData.address !== undefined && userData.address !== null) {
        payload.address = userData.address;
    } else if (existing && existing.address) {
        payload.address = existing.address;
    }

    if (userData.detailsRegistered !== undefined) {
        payload.detailsRegistered = Boolean(userData.detailsRegistered);
    } else if (existing && existing.detailsRegistered !== undefined) {
        payload.detailsRegistered = existing.detailsRegistered;
    }

    if (userData.registeredAt) {
        payload.registeredAt = userData.registeredAt;
    } else if (existing && existing.registeredAt) {
        payload.registeredAt = existing.registeredAt;
    }

    if (userData.createdAt) {
        payload.createdAt = userData.createdAt;
    } else if (existing && (existing.createdAt || existing.registeredAt)) {
        payload.createdAt = existing.createdAt || existing.registeredAt;
    } else {
        payload.createdAt = now;
        if (!payload.registeredAt) payload.registeredAt = now;
    }

    console.log(`🔥 [Firestore] Syncing user ${payload.uid} (${payload.email}) with tag: ${payload.tag}, role: ${payload.role}, status: ${payload.status}`);

    // Persist to 'users' collection at doc uid
    const result = await writeDocument('users', payload.uid, payload, true);
    return { success: result.success, user: payload, error: result.error };
}

/**
 * Retrieve user by UID
 */
async function getUser(uid) {
    if (!uid) return null;
    return await getDocument('users', uid);
}

/**
 * Extract web URLs from message text
 */
function extractUrls(text) {
    if (!text || typeof text !== 'string') return [];
    const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;
    const matches = text.match(urlRegex) || [];
    return [...new Set(matches)];
}

/**
 * Record a chat message in Firebase collection 'chat_interactions'
 * COMPLIANCE & CONSTRAINTS:
 * 1. Partitioned with tag: 'aifoundation', businessId: 'aifoundation'
 * 2. 7-Year statutory record retention (retainedUntil calculated as exactly +7 years)
 * 3. Text & web links only; file uploads are explicitly prohibited and rejected
 */
async function sendChatMessage(data) {
    if (!data) throw new Error('Message payload is required.');

    const userMessage = (data.userMessage || data.message || '').trim();
    if (!userMessage) throw new Error('Message text cannot be empty.');
    if (userMessage.length > 4000) throw new Error('Message exceeds 4,000 character maximum.');

    const senderUid = data.senderUid || data.uid;
    const senderEmail = (data.senderEmail || data.email || '').toLowerCase().trim();
    if (!senderUid || !senderEmail) {
        throw new Error('Sender identity (UID and email) is required.');
    }

    // Determine conversation ID: group by supporter UID
    const conversationId = data.conversationId || `conv_${senderUid}`;

    // Extract links
    const extractedLinks = extractUrls(userMessage);

    const now = new Date();
    // 7-Year Statutory Record Retention (Corporations Act 2001 & APP 11)
    const retentionDate = new Date(now);
    retentionDate.setFullYear(retentionDate.getFullYear() + 7);

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Multi-tenant tag identification
    const tenantTag = (data.tag || data.businessId || data.source || TRANSACTION_TAG || 'aifoundation').toLowerCase().trim();
    const businessId = (data.businessId || tenantTag || BUSINESS_ID || 'aifoundation').toLowerCase().trim();
    const businessName = data.businessName || (tenantTag === 'aifoundation' ? 'AI Foundation' : tenantTag);

    const payload = {
        id: messageId,
        messageId: messageId,
        conversationId: conversationId,
        tag: tenantTag, // Multi-tenant tag attached: 'aifoundation', 'pro-lms', 'healthlms', 'itsasimplejob', 'rto-ai'
        businessId: businessId,
        businessName: businessName,
        source: data.source || tenantTag,
        senderUid: senderUid,
        senderEmail: senderEmail,
        senderName: (data.senderName || data.displayName || 'Supporter').trim(),
        senderPhoto: data.senderPhoto || data.photoURL || '',
        senderRole: data.senderRole || 'supporter', // 'supporter' or 'super_admin'
        recipientUid: data.recipientUid || 'superadmin',
        recipientEmail: (data.recipientEmail || 'support@aifoundation.net.au').toLowerCase().trim(),
        recipientName: data.recipientName || 'SuperAdmin',
        userMessage: userMessage,
        hasLinks: extractedLinks.length > 0,
        links: extractedLinks,
        hasUploads: false, // Strict constraint: no file uploads permitted
        createdAt: now.toISOString(),
        timestamp: now.toISOString(),
        updatedAt: now.toISOString(),
        retentionYears: 7,
        retainedUntil: retentionDate.toISOString(),
        statutoryRetention: '7-Year Corporations Act / APP 11 Compliance'
    };

    console.log(`💬 [Firebase] Writing chat message ${messageId} to 'chat_interactions' [tag: ${tenantTag}, conv: ${conversationId}, retainedUntil: ${payload.retainedUntil}]`);

    const result = await writeDocument('chat_interactions', messageId, payload, true);
    return {
        success: result.success,
        message: payload,
        error: result.error
    };
}

/**
 * Retrieve chat messages for a specific conversation from 'chat_interactions'.
 * - SuperAdmin can read messages from ALL tenants and sees the tenant tag.
 * - Regular supporters can ONLY read their own messages and CANNOT read or see the tag.
 */
async function getChatMessages(conversationId, options = {}) {
    if (!conversationId) return [];
    const limit = Math.min(Number(options.limit) || 100, 200);
    const isSuperAdmin = Boolean(options.isSuperAdmin);
    const requesterUid = options.requesterUid ? String(options.requesterUid).trim() : null;

    try {
        const docs = await listDocuments('chat_interactions');
        if (!docs) return [];
        const messages = [];

        for (const { id, fields } of docs) {
            // This site's chat format only (other apps' messages and AI assistant logs share the collection)
            if (typeof fields.userMessage !== 'string' || fields.assistantResponse !== undefined) continue;

            // Filter by conversationId
            const isMatch = (fields.conversationId === conversationId) ||
                            (conversationId.startsWith('conv_') && fields.senderUid === conversationId.replace('conv_', '')) ||
                            (conversationId.startsWith('conv_') && fields.recipientUid === conversationId.replace('conv_', ''));
            
            if (!isMatch) continue;

            // Access control: if not SuperAdmin, user can only access their own conversation
            if (!isSuperAdmin && requesterUid) {
                const isParticipant = fields.senderUid === requesterUid || fields.recipientUid === requesterUid;
                if (!isParticipant) continue;
            }

            const msgObj = {
                id,
                ...fields
            };

            // TAG PRIVACY: Only SuperAdmin can read the tag attached to each message!
            // Strip tenant tag and tenant internal IDs for standard supporters
            if (!isSuperAdmin) {
                delete msgObj.tag;
                delete msgObj.businessId;
                delete msgObj.businessName;
                delete msgObj.source;
            }

            messages.push(msgObj);
        }

        // Sort chronologically ascending (oldest first for chat display)
        messages.sort((a, b) => new Date(a.createdAt || a.timestamp).getTime() - new Date(b.createdAt || b.timestamp).getTime());

        return messages.slice(-limit);
    } catch (e) {
        console.error('[Chat Fetch] Error fetching messages:', e.message);
        return [];
    }
}

/**
 * Retrieve active supporter chat conversations for SuperAdmin view.
 * SuperAdmin is able to read all messages sent to superadmin from ALL tenants.
 * Each conversation has its tenant tag attached for SuperAdmin inspection.
 */
async function getChatConversations(options = {}) {
    try {
        const docs = await listDocuments('chat_interactions');
        if (!docs) return [];
        const convMap = new Map();

        for (const { fields } of docs) {
            if (!fields.conversationId) continue;

            // Multi-tenant: SuperAdmin reads messages from all tenants
            const convId = fields.conversationId;
            const existing = convMap.get(convId);
            const msgTime = new Date(fields.createdAt || fields.timestamp).getTime();

            // Supporter identity
            const isSupporterSender = fields.senderRole === 'supporter' || fields.recipientUid === 'superadmin';
            const supporterEmail = isSupporterSender ? fields.senderEmail : fields.recipientEmail;
            const supporterName = isSupporterSender ? fields.senderName : fields.recipientName;
            const supporterUid = isSupporterSender ? fields.senderUid : fields.recipientUid;
            const tenantTag = fields.tag || fields.businessId || fields.source || 'aifoundation';

            if (!existing || msgTime > new Date(existing.lastMessageAt).getTime()) {
                convMap.set(convId, {
                    conversationId: convId,
                    supporterUid: supporterUid || convId.replace('conv_', ''),
                    supporterEmail: supporterEmail || 'Supporter',
                    supporterName: supporterName || 'Supporter',
                    tag: tenantTag, // Tenant tag attached (SuperAdmin readable)
                    businessId: fields.businessId || tenantTag,
                    businessName: fields.businessName || (tenantTag === 'aifoundation' ? 'AI Foundation' : tenantTag),
                    lastMessage: fields.userMessage || '',
                    lastSenderRole: fields.senderRole || 'supporter',
                    lastMessageAt: fields.createdAt || fields.timestamp,
                    hasLinks: Boolean(fields.hasLinks),
                    totalMessages: (existing?.totalMessages || 0) + 1
                });
            } else if (existing) {
                existing.totalMessages += 1;
                if (!existing.tag && tenantTag) existing.tag = tenantTag;
            }
        }

        const conversations = Array.from(convMap.values());
        // Sort descending by most recent message
        conversations.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
        return conversations;
    } catch (e) {
        console.error('[Chat Conversations] Error:', e.message);
        return [];
    }
}

/**
 * Retrieve recent database inputs across the shared multi-tenant database.
 * Supports filtering by tenant/website and collection.
 * 
 * @param {object} options
 * @param {string} options.tenant - 'all' or specific tag ('aifoundation', 'itsasimplejob', 'rto-ai', 'pro-lms', 'other')
 * @param {string} options.collection - 'all' or specific collection ('users', 'transactions', 'chat_interactions', 'activity_logs', 'metrics')
 * @param {number} options.limit - maximum records to return
 */
async function getDatabaseRecentInputs(options = {}) {
    const tenantFilter = (options.tenant || 'all').toLowerCase().trim();
    const collectionFilter = (options.collection || 'all').trim();
    const limit = Math.min(Number(options.limit) || 50, 100);

    const token = await getAccessToken();
    if (!token) return { records: [], totalCount: 0, error: 'Authentication unavailable' };

    let targetCollections = ['transactions', 'users', 'chat_interactions', 'activity_logs', 'metrics', 'test_ping'];
    if (collectionFilter !== 'all') {
        targetCollections = [collectionFilter];
    }

    const allRecords = [];

    for (const col of targetCollections) {
        try {
            const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${col}?pageSize=50`;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) continue;

            const data = await res.json();
            const docs = data.documents || [];

            for (const d of docs) {
                const docId = d.name.split('/').pop();
                const fields = fromFirestoreFields(d.fields || {});

                // Resolve tenant tag & human-readable website name
                let rawTag = (fields.tag || fields.businessId || fields.source || '').toLowerCase().trim();
                let websiteLabel = 'Shared Tenant';
                let websiteKey = 'other';

                if (rawTag === 'aifoundation' || fields.businessName === 'AI Foundation' || (fields.email && (fields.email.endsWith('@aifoundation.com.au') || fields.email.endsWith('@aifoundation.net.au')))) {
                    rawTag = 'aifoundation';
                    websiteLabel = 'AI Foundation';
                    websiteKey = 'aifoundation';
                } else if (rawTag.includes('simplejob') || rawTag === 'itsasimplejob') {
                    websiteLabel = "It's A Simple Job";
                    websiteKey = 'itsasimplejob';
                } else if (rawTag.includes('rto') || rawTag === 'rto-ai') {
                    websiteLabel = 'RTO AI';
                    websiteKey = 'rto-ai';
                } else if (rawTag.includes('lms') || rawTag === 'pro-lms' || col === 'chat_interactions') {
                    websiteLabel = 'Pro LMS / Admissions';
                    websiteKey = 'pro-lms';
                } else if (fields.businessName) {
                    websiteLabel = fields.businessName;
                    websiteKey = rawTag || 'other';
                }

                // Apply tenant filter if specified
                if (tenantFilter !== 'all') {
                    if (tenantFilter === 'aifoundation' && websiteKey !== 'aifoundation') continue;
                    if (tenantFilter === 'itsasimplejob' && websiteKey !== 'itsasimplejob') continue;
                    if (tenantFilter === 'rto-ai' && websiteKey !== 'rto-ai') continue;
                    if (tenantFilter === 'pro-lms' && websiteKey !== 'pro-lms') continue;
                    if (tenantFilter === 'other' && ['aifoundation', 'itsasimplejob', 'pro-lms', 'rto-ai'].includes(websiteKey)) continue;
                }

                // Generate descriptive summary
                let summary = '';
                if (col === 'transactions') {
                    summary = `${fields.paymentMethod?.toUpperCase() || 'PAYMENT'} AUD $${fields.amount || 0} (${fields.status || 'unknown'}) - ${fields.customerEmail || fields.description || docId}`;
                } else if (col === 'users') {
                    const addrInfo = fields.address ? ` [${[fields.address.suburb, fields.address.state].filter(Boolean).join(', ')}]` : '';
                    const userStatus = fields.status || fields.role || 'supporter';
                    summary = `User Profile: ${fields.displayName || 'Unnamed'} (${fields.email || 'No email'})${addrInfo} - Status: ${userStatus} (Role: ${fields.role || 'supporter'})`;
                } else if (col === 'chat_interactions') {
                    const userMsg = fields.userMessage ? `"${fields.userMessage.substring(0, 50)}..."` : (fields.currentApplicationId || 'Admissions Inquiry');
                    summary = `Chat Query: ${userMsg}`;
                } else if (col === 'metrics') {
                    summary = `Platform Metrics: ${fields.totalEvents ? fields.totalEvents + ' total events' : 'Stats'} (Last: ${fields.lastActiveUser || 'System'})`;
                } else {
                    summary = `${col} record: ${docId}`;
                }

                const timestamp = fields.updatedAt || fields.recordedAt || fields.lastLoginAt || fields.createdAt || fields.timestamp || fields.lastEventAt || d.updateTime || d.createTime || new Date().toISOString();

                allRecords.push({
                    id: docId,
                    collection: col,
                    tag: rawTag || 'shared',
                    websiteKey: websiteKey,
                    websiteLabel: websiteLabel,
                    summary: summary,
                    timestamp: timestamp,
                    raw: fields
                });
            }
        } catch (colErr) {
            console.warn(`[Firebase] Notice querying collection ${col}:`, colErr.message);
        }
    }

    // Sort descending by timestamp
    allRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const tenantCounts = {
        total: allRecords.length,
        aifoundation: allRecords.filter(r => r.websiteKey === 'aifoundation').length,
        itsasimplejob: allRecords.filter(r => r.websiteKey === 'itsasimplejob').length,
        pro_lms: allRecords.filter(r => r.websiteKey === 'pro-lms').length,
        rto_ai: allRecords.filter(r => r.websiteKey === 'rto-ai').length,
        other: allRecords.filter(r => !['aifoundation', 'itsasimplejob', 'pro-lms', 'rto-ai'].includes(r.websiteKey)).length
    };

    return {
        records: allRecords.slice(0, limit),
        totalCount: allRecords.length,
        tenantCounts,
        filters: { tenant: tenantFilter, collection: collectionFilter, limit }
    };
}

/**
 * Public configuration for frontend client SDK
 */
function getFirebasePublicConfig() {
    return {
        apiKey: process.env.FIREBASE_API_KEY || '',
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'ai-foundation-firebase.firebaseapp.com',
        projectId: process.env.FIREBASE_PROJECT_ID || 'ai-foundation-firebase',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'ai-foundation-firebase.firebasestorage.app',
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '614773274800',
        appId: process.env.FIREBASE_APP_ID || '1:614773274800:web:a7c2a66e4e8c4409afb221',
        tag: TRANSACTION_TAG, // 'aifoundation'
        businessId: BUSINESS_ID // 'aifoundation'
    };
}

module.exports = {
    TRANSACTION_TAG,
    BUSINESS_ID,
    PROJECT_ID,
    recordTransaction,
    updateTransactionStatus,
    getDocument,
    listAIFoundationTransactions,
    syncUser,
    getUser,
    getAdminEmailsFromFirebase,
    isEmailAdminInFirebase,
    getDatabaseRecentInputs,
    getFirebasePublicConfig,
    sendChatMessage,
    getChatMessages,
    getChatConversations,
    isSuperAdminUser,
    SUPERADMIN_UIDS,
    SUPERADMIN_EMAILS,
    writeDocument,
    deleteDocument,
    listDocuments
};
