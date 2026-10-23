/**
 * AI Foundation - SuperAdmin Message Box
 * Every message sent to or by the SuperAdmin in the shared chat_interactions collection, from all tenant apps.
 * Each app stores messages in its own format (this site: conversationId / userMessage / recipientUid; the LMS:
 * threadId / body / participants), so each document is converted to one shape and tagged with its tenant.
 * Documents that don't involve the SuperAdmin, such as AI assistant logs, are left out.
 * Served to the two SuperAdmins only (GET /api/message-box in server.js).
 */

const firebaseService = require('./firebase-service');

const { SUPERADMIN_UIDS, SUPERADMIN_EMAILS } = firebaseService;
const PREVIEW_LENGTH = 160;

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

// One message in the Message Box shape, or null when the document isn't a message to or from the SuperAdmin
function normalizeMessage(id, f) {
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

    const tenant = (str(f.tag) || str(f.businessId) || str(f.source) || 'unknown').toLowerCase();
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
            // Replies are written in this site's format, so only this site's conversations can take one
            replyable: /^conv_[A-Za-z0-9_-]+$/.test(last.conversationId),
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

// The whole Message Box, or null when Firestore can't be reached
async function loadMessageBox({ firebase = firebaseService } = {}) {
    const docs = await firebase.listDocuments('chat_interactions');
    if (!docs) return null;
    const messages = docs.map(d => normalizeMessage(d.id, d.fields)).filter(Boolean);
    const conversations = buildConversations(messages);
    return { tenants: summarizeTenants(conversations), conversations };
}

module.exports = { normalizeMessage, buildConversations, summarizeTenants, loadMessageBox, isSuperAdminRef };
