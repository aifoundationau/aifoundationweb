/**
 * AI Foundation - Unified Multi-Database SuperAdmin Message Box
 * Aggregates every message sent to or by the SuperAdmin across all Firebase databases and tenant web apps,
 * normalizes each app's native schema into one unified conversation feed tagged with its website database tag,
 * and routes SuperAdmin replies back to the originating database and collection in that app's native format.
 * Served to the two SuperAdmins only (GET /api/message-box and POST /api/chat/send in server.js).
 */

const firebaseService = require('./firebase-service');

const { SUPERADMIN_UIDS, SUPERADMIN_EMAILS } = firebaseService;
const PREVIEW_LENGTH = 160;
const SEVEN_YEARS_MS = 7 * 365 * 24 * 60 * 60 * 1000;

// All website database tags in the AI Foundation Firebase ecosystem
const KNOWN_WEBSITE_TAGS = [
    'aifoundation',
    'lms',
    'hr',
    'ad-radar',
    'itsasimplejob',
    'trainerdavid',
    'rto-ai',
    'health',
    'nihongo',
    'finance',
    'kangoorental',
    'lawyerselect'
];

function str(value) {
    return typeof value === 'string' ? value.trim() : '';
}

// A UID, email or recipient id that means one of the two SuperAdmins
function isSuperAdminRef(value) {
    const v = str(value);
    return v === 'superadmin' || SUPERADMIN_UIDS.includes(v) || SUPERADMIN_EMAILS.includes(v.toLowerCase());
}

function toIso(value) {
    if (value === null || value === undefined || value === '') return null;
    const date = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// One message in the Message Box shape from chat_interactions (or generic collection),
// or null when the document isn't a message to or from the SuperAdmin
function normalizeMessage(id, f, defaultTenant = '') {
    if (!f || typeof f !== 'object' || f.assistantResponse !== undefined) return null;
    const text = str(f.userMessage) || str(f.body) || str(f.message) || str(f.text) || str(f.content);
    if (!text) return null;

    const participants = (Array.isArray(f.participants) ? f.participants : [])
        .map(p => (p && typeof p === 'object' ? str(p.uid) || str(p.email) : str(p)))
        .filter(Boolean);
    const role = str(f.senderRole).toLowerCase();
    const fromSuperAdmin = isSuperAdminRef(f.senderUid) || isSuperAdminRef(f.senderEmail) || role === 'superadmin' || role === 'super_admin';
    const toSuperAdmin = isSuperAdminRef(f.recipientUid) || isSuperAdminRef(f.recipientEmail) || participants.some(isSuperAdminRef);
    if (!fromSuperAdmin && !toSuperAdmin) return null;

    // The other person in the conversation
    const counterpart = fromSuperAdmin
        ? {
            uid: str(f.recipientUid) || participants.find(p => !isSuperAdminRef(p)) || '',
            email: str(f.recipientEmail).toLowerCase(),
            name: str(f.recipientName)
        }
        : { uid: str(f.senderUid), email: str(f.senderEmail).toLowerCase(), name: str(f.senderName) };

    const tenant = (str(f.tag) || str(f.businessId) || str(f.source) || defaultTenant || 'unknown').toLowerCase();
    const threadId = str(f.conversationId) || str(f.threadId) || str(f.conversation_id) || str(f.thread_id) ||
        `conv_${counterpart.uid || counterpart.email || id}`;

    return {
        id: String(id),
        tenant,
        conversationKey: `${tenant}:${threadId}`,
        conversationId: threadId,
        fromSuperAdmin,
        senderName: str(f.senderName) || (fromSuperAdmin ? 'SuperAdmin' : counterpart.name),
        senderEmail: str(f.senderEmail).toLowerCase(),
        counterpart,
        subject: str(f.subject),
        text,
        createdAt: toIso(f.createdAt) || toIso(f.timestamp) || toIso(f.createdAtMs) || toIso(f.created_at)
    };
}

// Normalize Social Radar (ad-radar database -> admin_messages collection)
function normalizeAdRadarMessage(id, f) {
    if (!f || typeof f !== 'object') return null;
    const text = str(f.body) || str(f.message) || str(f.text);
    if (!text) return null;

    const direction = str(f.direction).toLowerCase();
    const fromSuperAdmin = direction === 'admin_to_user' ||
        (direction !== 'user_to_admin' && (isSuperAdminRef(f.senderUid) || isSuperAdminRef(f.senderEmail)));

    const counterpart = fromSuperAdmin
        ? {
            uid: str(f.recipientUid),
            email: str(f.recipientEmail).toLowerCase(),
            name: str(f.recipientName) || str(f.recipientEmail).split('@')[0] || ''
        }
        : {
            uid: str(f.uid || f.senderUid),
            email: str(f.senderEmail).toLowerCase(),
            name: str(f.senderName) || str(f.senderEmail).split('@')[0] || ''
        };

    const threadId = str(f.conversationId) || str(f.threadId) || `adradar_${counterpart.email || counterpart.uid || id}`;
    return {
        id: `adradar_${id}`,
        tenant: 'ad-radar',
        conversationKey: `ad-radar:${threadId}`,
        conversationId: threadId,
        fromSuperAdmin,
        senderName: fromSuperAdmin ? 'SuperAdmin' : (counterpart.name || counterpart.email || 'User'),
        senderEmail: fromSuperAdmin ? (str(f.senderEmail).toLowerCase() || SUPERADMIN_EMAILS[0]) : counterpart.email,
        counterpart,
        subject: str(f.subject),
        text,
        createdAt: toIso(f.createdAt) || toIso(f.timestamp)
    };
}

// Normalize What HR (human-resources database -> hr_conversations + messages subcollection)
function normalizeHrConversationMessages(convId, convFields, msgDocs = [], userMap = new Map()) {
    if (!convFields || typeof convFields !== 'object') return [];
    const participants = Array.isArray(convFields.participants) ? convFields.participants.map(str) : [];
    const isAdminConv = str(convFields.kind).toLowerCase() === 'admin' ||
        str(convFields.buyerRole).toLowerCase() === 'superadmin' ||
        isSuperAdminRef(convFields.buyerUid) ||
        isSuperAdminRef(convFields.jobseekerUid) ||
        participants.some(isSuperAdminRef);
    if (!isAdminConv) return [];

    const buyerIsSa = isSuperAdminRef(convFields.buyerUid) || str(convFields.buyerRole).toLowerCase() === 'superadmin';
    const counterpartUid = buyerIsSa ? str(convFields.jobseekerUid) : str(convFields.buyerUid);
    const profile = userMap.get(counterpartUid) || {};
    const counterpart = {
        uid: counterpartUid,
        email: (str(convFields.recipientEmail) || str(convFields.jobseekerEmail) || str(profile.email)).toLowerCase(),
        name: (buyerIsSa ? str(convFields.jobseekerName) : str(convFields.buyerName)) || str(profile.displayName || profile.name)
    };

    const results = [];
    for (const doc of msgDocs) {
        const m = doc.fields || {};
        const text = str(m.text) || str(m.body) || str(m.message) ||
            (str(m.kind) === 'appointment' ? `[Appointment] ${str(m.slot)} (${str(m.status || 'proposed')})` : '');
        if (!text) continue;
        const fromSuperAdmin = isSuperAdminRef(m.senderUid) ||
            (buyerIsSa && str(m.senderRole).toLowerCase() === 'buyer') ||
            str(m.senderRole).toLowerCase() === 'superadmin';
        results.push({
            id: `hr_${doc.id}`,
            tenant: 'hr',
            conversationKey: `hr:${convId}`,
            conversationId: String(convId),
            fromSuperAdmin,
            senderName: fromSuperAdmin ? (str(convFields.buyerName) || 'SuperAdmin') : (counterpart.name || counterpart.email || 'HR User'),
            senderEmail: fromSuperAdmin ? SUPERADMIN_EMAILS[0] : counterpart.email,
            counterpart,
            subject: str(convFields.subject),
            text,
            createdAt: toIso(m.sentAt) || toIso(m.createdAt) || toIso(convFields.lastMessageAt)
        });
    }

    if (!results.length && str(convFields.lastMessagePreview)) {
        const fromSuperAdmin = isSuperAdminRef(convFields.lastSenderUid);
        results.push({
            id: `hr_${convId}`,
            tenant: 'hr',
            conversationKey: `hr:${convId}`,
            conversationId: String(convId),
            fromSuperAdmin,
            senderName: fromSuperAdmin ? 'SuperAdmin' : (counterpart.name || counterpart.email || 'HR User'),
            senderEmail: fromSuperAdmin ? SUPERADMIN_EMAILS[0] : counterpart.email,
            counterpart,
            subject: str(convFields.subject),
            text: str(convFields.lastMessagePreview),
            createdAt: toIso(convFields.lastMessageAt) || toIso(convFields.createdAt)
        });
    }

    return results;
}

// Normalize It's A Simple Job / Trades (itsasimplejob database -> mailboxes/superadmin/inbox & sent)
function normalizeSimpleJobMessage(id, f, boxType = 'inbox') {
    if (!f || typeof f !== 'object') return null;
    const text = str(f.body) || str(f.message) || str(f.text);
    if (!text) return null;

    const fromObj = f.from && typeof f.from === 'object' ? f.from : {};
    const toObj = f.to && typeof f.to === 'object' ? f.to : {};
    const fromSuperAdmin = boxType === 'sent' ||
        str(fromObj.role).toLowerCase() === 'superadmin' ||
        isSuperAdminRef(fromObj.uid) ||
        isSuperAdminRef(fromObj.email);
    const other = fromSuperAdmin ? toObj : fromObj;
    const counterpart = {
        uid: str(other.uid || f.senderUid || f.recipientUid),
        email: str(other.email || f.senderEmail || f.recipientEmail).toLowerCase(),
        name: str(other.name || f.senderName || f.recipientName)
    };
    const threadId = str(f.conversationId) || `iasj_${counterpart.uid || counterpart.email || id}`;

    return {
        id: `iasj_${id}`,
        tenant: 'itsasimplejob',
        conversationKey: `itsasimplejob:${threadId}`,
        conversationId: threadId,
        fromSuperAdmin,
        senderName: fromSuperAdmin ? (str(fromObj.name) || 'SuperAdmin') : (counterpart.name || counterpart.email || 'User'),
        senderEmail: fromSuperAdmin ? (str(fromObj.email).toLowerCase() || SUPERADMIN_EMAILS[0]) : counterpart.email,
        counterpart,
        subject: str(f.subject),
        text,
        createdAt: toIso(f.createdAt) || toIso(f.timestamp)
    };
}

// Normalize Trainer David / PT (trainerdavid database -> creator_messages collection)
function normalizeTrainerDavidMessage(id, f) {
    if (!f || typeof f !== 'object') return null;
    const text = str(f.message) || str(f.body) || str(f.text);
    if (!text) return null;

    const senderIsSa = isSuperAdminRef(f.senderUid) || isSuperAdminRef(f.senderEmail) || /trainer david|superadmin/i.test(str(f.senderName));
    const creatorIsSa = isSuperAdminRef(f.creatorUid) || isSuperAdminRef(f.creatorEmail) || /trainer david|superadmin/i.test(str(f.creatorName));
    if (!senderIsSa && !creatorIsSa && str(f.kind).toLowerCase() !== 'admin') return null;

    const fromSuperAdmin = senderIsSa && !creatorIsSa;
    const counterpart = fromSuperAdmin
        ? { uid: str(f.creatorUid), email: str(f.creatorEmail).toLowerCase(), name: str(f.creatorName) }
        : { uid: str(f.senderUid), email: str(f.senderEmail).toLowerCase(), name: str(f.senderName) };
    const threadId = str(f.conversationId) || `pt_${counterpart.uid || counterpart.email || id}`;

    return {
        id: `pt_${id}`,
        tenant: 'trainerdavid',
        conversationKey: `trainerdavid:${threadId}`,
        conversationId: threadId,
        fromSuperAdmin,
        senderName: fromSuperAdmin ? (str(f.senderName) || 'Trainer David') : (counterpart.name || counterpart.email || 'Member'),
        senderEmail: fromSuperAdmin ? (str(f.senderEmail).toLowerCase() || SUPERADMIN_EMAILS[0]) : counterpart.email,
        counterpart,
        subject: str(f.subject),
        text,
        createdAt: toIso(f.createdAt) || toIso(f.timestamp)
    };
}

// Normalize RTO / Super-RTO ((default) database -> superadmin_messages collection)
function normalizeRtoMessage(id, f) {
    if (!f || typeof f !== 'object') return null;
    const text = str(f.message) || str(f.body) || str(f.text);
    if (!text) return null;

    const fromSuperAdmin = isSuperAdminRef(f.senderUid) || isSuperAdminRef(f.senderEmail) || str(f.senderRole).toLowerCase() === 'superadmin';
    const counterpart = fromSuperAdmin
        ? { uid: str(f.recipientUid), email: str(f.recipientEmail).toLowerCase(), name: str(f.recipientName) }
        : { uid: str(f.senderUid), email: str(f.senderEmail).toLowerCase(), name: str(f.senderName) };
    const tenant = (str(f.tag) || 'rto-ai').toLowerCase();
    const threadId = str(f.conversationId) || str(f.threadId) || `rto_${counterpart.uid || counterpart.email || id}`;

    return {
        id: `rto_${id}`,
        tenant,
        conversationKey: `${tenant}:${threadId}`,
        conversationId: threadId,
        fromSuperAdmin,
        senderName: fromSuperAdmin ? (str(f.senderName) || 'SuperAdmin') : (counterpart.name || counterpart.email || 'User'),
        senderEmail: fromSuperAdmin ? (str(f.senderEmail).toLowerCase() || SUPERADMIN_EMAILS[0]) : counterpart.email,
        counterpart,
        subject: str(f.subject),
        text,
        createdAt: toIso(f.createdAt) || toIso(f.timestamp)
    };
}

// Group messages into conversations, newest conversation first, each with its messages oldest first
function buildConversations(messages) {
    const byKey = new Map();
    for (const message of messages) {
        if (!byKey.has(message.conversationKey)) byKey.set(message.conversationKey, []);
        byKey.get(message.conversationKey).push(message);
    }

    const conversations = [...byKey.values()].map(list => {
        list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
        const last = list[list.length - 1];
        // The other person: the latest known name, email and UID across the conversation
        const counterpart = { uid: '', email: '', name: '' };
        for (const message of [...list].reverse()) {
            for (const field of Object.keys(counterpart)) {
                if (!counterpart[field] && message.counterpart[field]) counterpart[field] = message.counterpart[field];
            }
        }
        return {
            key: last.conversationKey,
            conversationId: last.conversationId,
            tenant: last.tenant,
            // SuperAdmins can reply directly from the unified Message Box to any app's conversation
            replyable: Boolean(counterpart.uid || counterpart.email || last.conversationId),
            counterpart,
            subject: (list.find(m => m.subject) || {}).subject || '',
            lastMessageAt: last.createdAt,
            lastFromSuperAdmin: last.fromSuperAdmin,
            preview: last.text.slice(0, PREVIEW_LENGTH),
            messageCount: list.length,
            messages: list.map(m => ({
                id: m.id,
                fromSuperAdmin: m.fromSuperAdmin,
                senderName: m.senderName,
                senderEmail: m.senderEmail,
                subject: m.subject,
                text: m.text,
                createdAt: m.createdAt
            }))
        };
    });

    conversations.sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''));
    return conversations;
}

// Each tenant found, with its number of conversations and messages (most messages first)
function summarizeTenants(conversations) {
    const byTag = new Map();
    for (const c of conversations) {
        const entry = byTag.get(c.tenant) || { tag: c.tenant, conversations: 0, messages: 0 };
        entry.conversations += 1;
        entry.messages += c.messageCount;
        byTag.set(c.tenant, entry);
    }
    return [...byTag.values()].sort((a, b) => b.messages - a.messages || a.tag.localeCompare(b.tag));
}

// Load additional multi-database messages when firebase.listDatabaseDocuments is available
async function loadMultiDatabaseMessages(firebase) {
    if (typeof firebase.listDatabaseDocuments !== 'function') return [];
    const extra = [];

    const safeList = async (db, path) => {
        try {
            const res = await firebase.listDatabaseDocuments(db, path);
            return Array.isArray(res) ? res : [];
        } catch (_) {
            return [];
        }
    };

    const [
        rtoDocs,
        adRadarDocs,
        hrConvDocs,
        hrUserDocs,
        iasjInboxDocs,
        iasjSentDocs,
        ptDocs,
        financeChatDocs,
        kangoChatDocs,
        lawyerChatDocs
    ] = await Promise.all([
        safeList('(default)', 'superadmin_messages'),
        safeList('ad-radar', 'admin_messages'),
        safeList('human-resources', 'hr_conversations'),
        safeList('human-resources', 'hr_users'),
        safeList('itsasimplejob', 'mailboxes/superadmin/inbox'),
        safeList('itsasimplejob', 'mailboxes/superadmin/sent'),
        safeList('trainerdavid', 'creator_messages'),
        safeList('finance', 'chat_interactions'),
        safeList('kangoorental', 'chat_interactions'),
        safeList('lawyerselect', 'chat_interactions')
    ]);

    for (const d of rtoDocs) {
        const m = normalizeRtoMessage(d.id, d.fields);
        if (m) extra.push(m);
    }
    for (const d of adRadarDocs) {
        const m = normalizeAdRadarMessage(d.id, d.fields);
        if (m) extra.push(m);
    }
    for (const d of iasjInboxDocs) {
        const m = normalizeSimpleJobMessage(d.id, d.fields, 'inbox');
        if (m) extra.push(m);
    }
    for (const d of iasjSentDocs) {
        const m = normalizeSimpleJobMessage(d.id, d.fields, 'sent');
        if (m) extra.push(m);
    }
    for (const d of ptDocs) {
        const m = normalizeTrainerDavidMessage(d.id, d.fields);
        if (m) extra.push(m);
    }
    for (const d of financeChatDocs) {
        const m = normalizeMessage(d.id, d.fields, 'finance');
        if (m) extra.push(m);
    }
    for (const d of kangoChatDocs) {
        const m = normalizeMessage(d.id, d.fields, 'kangoorental');
        if (m) extra.push(m);
    }
    for (const d of lawyerChatDocs) {
        const m = normalizeMessage(d.id, d.fields, 'lawyerselect');
        if (m) extra.push(m);
    }

    if (hrConvDocs.length) {
        const userMap = new Map();
        for (const u of hrUserDocs) {
            userMap.set(u.id, u.fields || {});
        }
        const hrSublists = await Promise.all(
            hrConvDocs.map(async conv => {
                const msgs = await safeList('human-resources', `hr_conversations/${conv.id}/messages`);
                return normalizeHrConversationMessages(conv.id, conv.fields, msgs, userMap);
            })
        );
        for (const list of hrSublists) {
            extra.push(...list);
        }
    }

    return extra;
}

// The whole Message Box across all databases and apps, or null when Firestore can't be reached
async function loadMessageBox({ firebase = firebaseService } = {}) {
    const [docs, extraMessages] = await Promise.all([
        firebase.listDocuments('chat_interactions'),
        loadMultiDatabaseMessages(firebase)
    ]);
    if (!docs) return null;
    const primaryMessages = docs.map(d => normalizeMessage(d.id, d.fields)).filter(Boolean);
    const messages = [...primaryMessages, ...extraMessages];
    const conversations = buildConversations(messages);
    return {
        tenants: summarizeTenants(conversations),
        websiteTags: KNOWN_WEBSITE_TAGS,
        conversations
    };
}

/**
 * Send a SuperAdmin reply to a conversation in any tenant app's native Firestore database and format.
 */
async function replyToConversation({
    tenant = 'aifoundation',
    conversationId = '',
    counterpart = {},
    subject = '',
    text = '',
    senderUid = SUPERADMIN_UIDS[0],
    senderEmail = SUPERADMIN_EMAILS[0],
    senderName = 'AI Foundation',
    senderPhoto = ''
} = {}, { firebase = firebaseService } = {}) {
    const cleanText = str(text);
    if (!cleanText) return { success: false, error: 'Message cannot be empty.' };

    const appTag = (str(tenant) || 'aifoundation').toLowerCase();
    const recipientUid = str(counterpart.uid);
    const recipientEmail = str(counterpart.email).toLowerCase();
    const recipientName = str(counterpart.name) || recipientEmail || 'Supporter';
    const convId = str(conversationId) || `conv_${recipientUid || recipientEmail || Date.now()}`;
    const now = new Date();
    const nowMs = now.getTime();
    const nowIso = now.toISOString();
    const retainUntilIso = new Date(nowMs + SEVEN_YEARS_MS).toISOString();
    const rand = Math.random().toString(36).slice(2, 8);
    const replySubject = str(subject)
        ? (/^re:/i.test(str(subject)) ? str(subject) : `Re: ${str(subject)}`)
        : 'Reply from SuperAdmin';

    // 1. AI Foundation (this site)
    if (appTag === 'aifoundation' && typeof firebase.sendChatMessage === 'function') {
        return firebase.sendChatMessage({
            senderUid,
            senderEmail,
            senderName,
            senderPhoto,
            senderRole: 'superadmin',
            recipientUid: recipientUid || 'supporter',
            recipientEmail,
            recipientName,
            conversationId: convId,
            userMessage: cleanText,
            tag: 'aifoundation',
            businessId: 'aifoundation',
            businessName: 'AI Foundation',
            source: 'aifoundation'
        });
    }

    const writeDbDoc = typeof firebase.writeDatabaseDocument === 'function'
        ? firebase.writeDatabaseDocument.bind(firebase)
        : (db, col, docId, data, merge) => firebase.writeDocument(col, docId, data, merge);

    // 2. Pro LMS / OzEdu ((default) database -> chat_interactions in lms_message format)
    if (appTag === 'lms' || appTag === 'pro-lms') {
        const docId = `${String(9999999999999 - nowMs).padStart(13, '0')}_${rand}`;
        const participants = Array.from(new Set([
            senderEmail,
            'superadmin',
            senderUid,
            recipientEmail,
            recipientUid
        ].filter(Boolean)));
        const payload = {
            kind: 'lms_message',
            tag: 'lms',
            schema: 1,
            threadId: convId,
            conversationId: convId,
            category: 'admin',
            senderUid,
            senderEmail,
            senderName: senderName || 'AI Foundation',
            senderRole: 'superadmin',
            recipientUid,
            recipientEmail,
            recipientName,
            participants,
            courseId: '',
            courseTitle: '',
            subject: replySubject,
            body: cleanText,
            userMessage: cleanText,
            meta: { requestStatus: 'accepted' },
            readBy: [senderEmail],
            createdAt: nowIso,
            createdAtMs: nowMs,
            retainedUntil: retainUntilIso
        };
        const res = await writeDbDoc('(default)', 'chat_interactions', docId, payload, false);
        return res.success
            ? { success: true, message: { messageId: docId, ...payload } }
            : { success: false, error: res.error || 'Failed to write LMS reply.' };
    }

    // 3. What HR (human-resources database -> hr_conversations/{convId}/messages + parent update)
    if (appTag === 'hr') {
        const msgId = `m_${nowMs}_${rand}`;
        const msgPayload = {
            kind: 'text',
            senderUid,
            senderRole: 'buyer',
            visibleTo: Array.from(new Set([senderUid, recipientUid].filter(Boolean))),
            text: cleanText,
            sentAt: nowIso,
            expireAt: retainUntilIso,
            tokensCharged: 0
        };
        const msgRes = await writeDbDoc('human-resources', `hr_conversations/${convId}/messages`, msgId, msgPayload, false);
        if (!msgRes.success) {
            return { success: false, error: msgRes.error || 'Failed to write HR reply.' };
        }
        await writeDbDoc('human-resources', 'hr_conversations', convId, {
            lastMessageAt: nowIso,
            lastMessagePreview: cleanText.slice(0, 140),
            lastSenderUid: senderUid,
            expireAt: retainUntilIso,
            started: true
        }, true);
        return {
            success: true,
            message: {
                messageId: msgId,
                conversationId: convId,
                tag: 'hr',
                userMessage: cleanText,
                createdAt: nowIso,
                retainedUntil: retainUntilIso
            }
        };
    }

    // 4. Social Radar (ad-radar database -> admin_messages collection)
    if (appTag === 'ad-radar') {
        const msgId = `msg_out_${nowMs}_${rand}`;
        const payload = {
            messageId: msgId,
            uid: senderUid,
            senderEmail,
            recipientEmail,
            ...(recipientUid ? { recipientUid } : {}),
            recipientName,
            direction: 'admin_to_user',
            subject: replySubject,
            body: cleanText,
            status: 'unread',
            createdAt: nowIso,
            retentionUntil: retainUntilIso
        };
        const res = await writeDbDoc('ad-radar', 'admin_messages', msgId, payload, false);
        return res.success
            ? { success: true, message: { ...payload, userMessage: cleanText, retainedUntil: retainUntilIso } }
            : { success: false, error: res.error || 'Failed to write Social Radar reply.' };
    }

    // 5. It's A Simple Job / Trades (itsasimplejob database -> mailboxes/superadmin/sent & user inbox)
    if (appTag === 'itsasimplejob') {
        const msgId = `msg_${nowMs}_${rand}`;
        const baseDoc = {
            from: { uid: senderUid, name: senderName || "It's A Simple Job Superadmin", email: senderEmail, role: 'superadmin' },
            to: { uid: recipientUid, name: recipientName, email: recipientEmail, role: 'user' },
            conversationId: convId,
            subject: replySubject,
            body: cleanText,
            createdAt: nowIso,
            tokensCharged: 0
        };
        const sentRes = await writeDbDoc('itsasimplejob', 'mailboxes/superadmin/sent', msgId, { ...baseDoc, read: true }, false);
        if (recipientUid) {
            await writeDbDoc('itsasimplejob', `mailboxes/${recipientUid}/inbox`, msgId, { ...baseDoc, read: false }, false);
        }
        return sentRes.success
            ? { success: true, message: { messageId: msgId, ...baseDoc, userMessage: cleanText, retainedUntil: retainUntilIso } }
            : { success: false, error: sentRes.error || 'Failed to write Trades reply.' };
    }

    // 6. Trainer David / PT (trainerdavid database -> creator_messages collection)
    if (appTag === 'trainerdavid') {
        const msgId = `msg_${nowMs}_${rand}`;
        const payload = {
            id: msgId,
            kind: 'admin',
            conversationId: convId,
            senderUid,
            senderEmail,
            senderName: senderName || 'Trainer David (Head Coach)',
            creatorUid: recipientUid,
            creatorEmail: recipientEmail,
            creatorName: recipientName,
            subject: replySubject,
            message: cleanText,
            tokenCost: 0,
            videoId: null,
            videoTitle: null,
            postId: null,
            postTitle: null,
            read: false,
            createdAt: nowIso
        };
        const res = await writeDbDoc('trainerdavid', 'creator_messages', msgId, payload, false);
        return res.success
            ? { success: true, message: { messageId: msgId, ...payload, userMessage: cleanText, retainedUntil: retainUntilIso } }
            : { success: false, error: res.error || 'Failed to write Trainer David reply.' };
    }

    // 7. RTO / Super-RTO ((default) database -> superadmin_messages + notifications)
    if (appTag === 'rto-ai') {
        const msgId = `msg_${nowMs}_${rand}`;
        const payload = {
            category: 'support',
            tag: 'rto-ai',
            conversationId: convId,
            subject: replySubject,
            message: cleanText,
            senderUid,
            senderEmail,
            senderName: senderName || 'SuperAdmin',
            senderRole: 'superadmin',
            recipientUid,
            recipientEmail,
            recipientName,
            status: 'replied',
            createdAt: nowIso,
            retainedUntil: retainUntilIso
        };
        const res = await writeDbDoc('(default)', 'superadmin_messages', msgId, payload, false);
        if (recipientEmail) {
            await writeDbDoc('(default)', 'notifications', `notif_${nowMs}_${rand}`, {
                recipientEmail,
                type: 'superadmin_message',
                title: replySubject,
                body: cleanText,
                read: false,
                createdAt: nowIso,
                createdBy: senderEmail
            }, false);
        }
        return res.success
            ? { success: true, message: { messageId: msgId, ...payload, userMessage: cleanText } }
            : { success: false, error: res.error || 'Failed to write RTO reply.' };
    }

    // 8. Any other tenant app (finance, kangoorental, lawyerselect, health, nihongo, etc.)
    const msgId = `msg_${nowMs}_${rand}`;
    const genericPayload = {
        messageId: msgId,
        conversationId: convId,
        tag: appTag,
        businessId: appTag,
        source: appTag,
        senderUid,
        senderEmail,
        senderName: senderName || 'SuperAdmin',
        senderRole: 'superadmin',
        recipientUid: recipientUid || 'supporter',
        recipientEmail,
        recipientName,
        subject: replySubject,
        userMessage: cleanText,
        body: cleanText,
        createdAt: nowIso,
        timestamp: nowIso,
        retainedUntil: retainUntilIso
    };
    const namedDbs = ['finance', 'kangoorental', 'lawyerselect'];
    const targetDb = namedDbs.includes(appTag) ? appTag : '(default)';
    const res = await writeDbDoc(targetDb, 'chat_interactions', msgId, genericPayload, false);
    if (targetDb !== '(default)') {
        await writeDbDoc('(default)', 'chat_interactions', msgId, genericPayload, false);
    }
    return res.success
        ? { success: true, message: genericPayload }
        : { success: false, error: res.error || `Failed to write ${appTag} reply.` };
}

module.exports = {
    KNOWN_WEBSITE_TAGS,
    normalizeMessage,
    normalizeAdRadarMessage,
    normalizeHrConversationMessages,
    normalizeSimpleJobMessage,
    normalizeTrainerDavidMessage,
    normalizeRtoMessage,
    buildConversations,
    summarizeTenants,
    loadMessageBox,
    replyToConversation,
    isSuperAdminRef
};
