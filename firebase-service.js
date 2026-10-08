/**
 * AI Foundation - Firebase Service Layer
 * Multi-Tenant Cloud Firestore Client for 'ai-foundation-firebase'
 * Partitioned with: tag = 'aifoundation', businessId = 'aifoundation'
 * 
 * Secure server-side Firestore operations via Google Cloud Service Account OAuth2
 */

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

/**
 * Synchronize Google Auth User Profile to Cloud Firestore
 * GUARANTEE: User profiles MUST have tag 'aifoundation' and businessId 'aifoundation'
 */
async function syncUser(userData) {
    if (!userData || !userData.uid) {
        throw new Error('User UID is required to synchronize user profile.');
    }

    const now = new Date().toISOString();
    const payload = {
        uid: userData.uid,
        email: (userData.email || '').toLowerCase().trim(),
        displayName: (userData.displayName || '').trim(),
        photoURL: userData.photoURL || '',
        tag: TRANSACTION_TAG, // 'aifoundation'
        businessId: BUSINESS_ID, // 'aifoundation'
        businessName: 'AI Foundation',
        source: 'aifoundation',
        authProvider: 'google',
        role: userData.role || 'supporter',
        lastLoginAt: now,
        updatedAt: now
    };

    if (userData.phoneNumber !== undefined && userData.phoneNumber !== null) {
        payload.phoneNumber = String(userData.phoneNumber).trim();
    } else {
        try {
            const existing = await getUser(userData.uid);
            if (existing && existing.phoneNumber) {
                payload.phoneNumber = existing.phoneNumber;
            }
        } catch (e) { }
    }

    if (userData.address !== undefined && userData.address !== null) {
        payload.address = userData.address;
    } else {
        try {
            const existing = await getUser(userData.uid);
            if (existing && existing.address) {
                payload.address = existing.address;
            }
        } catch (e) { }
    }

    if (userData.createdAt) {
        payload.createdAt = userData.createdAt;
    }

    console.log(`🔥 [Firestore] Syncing user ${payload.uid} (${payload.email}) with tag: ${payload.tag}`);

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
                    summary = `User Profile: ${fields.displayName || 'Unnamed'} (${fields.email || 'No email'})${addrInfo} - Role: ${fields.role || 'supporter'}`;
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
    getDatabaseRecentInputs,
    getFirebasePublicConfig,
    toFirestoreFields,
    fromFirestoreFields,
    writeDocument,
    deleteDocument
};
