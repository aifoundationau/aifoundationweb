/**
 * AI Foundation - Firebase ID Token Verification Middleware
 * Verifies the `Authorization: Bearer <Firebase ID token>` header against Google's
 * published securetoken signing keys, so the server never trusts uid/email sent in a request body.
 */

const crypto = require('crypto');
const firebaseService = require('./firebase-service');

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const PROJECT_ID = firebaseService.PROJECT_ID;
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
const CLOCK_SKEW_SECONDS = 300;

let cachedKeys = null;
let keysExpireAt = 0;

async function getSigningKeys(forceRefresh = false) {
    if (!forceRefresh && cachedKeys && Date.now() < keysExpireAt) return cachedKeys;

    const res = await fetch(JWKS_URL);
    if (!res.ok) throw new Error(`Unable to fetch Firebase signing keys (HTTP ${res.status})`);
    const { keys } = await res.json();

    const maxAge = Number((res.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1]) || 3600;
    cachedKeys = new Map(keys.map(jwk => [jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' })]));
    keysExpireAt = Date.now() + maxAge * 1000;
    return cachedKeys;
}

function decodeSegment(segment) {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

/**
 * Verify a Firebase ID token and return its claims. Throws on any failure.
 */
async function verifyIdToken(idToken) {
    const parts = (idToken || '').split('.');
    if (parts.length !== 3) throw new Error('Malformed token');

    const header = decodeSegment(parts[0]);
    const claims = decodeSegment(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) throw new Error('Unexpected token algorithm');

    let keys = await getSigningKeys();
    if (!keys.has(header.kid)) keys = await getSigningKeys(true);
    const publicKey = keys.get(header.kid);
    if (!publicKey) throw new Error('Unknown signing key');

    const signedData = Buffer.from(`${parts[0]}.${parts[1]}`);
    const signature = Buffer.from(parts[2], 'base64url');
    if (!crypto.verify('RSA-SHA256', signedData, publicKey, signature)) throw new Error('Invalid token signature');

    const now = Math.floor(Date.now() / 1000);
    if (claims.aud !== PROJECT_ID) throw new Error('Token audience mismatch');
    if (claims.iss !== ISSUER) throw new Error('Token issuer mismatch');
    if (!claims.sub || typeof claims.sub !== 'string') throw new Error('Token subject missing');
    if (!(claims.exp > now)) throw new Error('Token expired');
    if (!(claims.iat <= now + CLOCK_SKEW_SECONDS)) throw new Error('Token issued in the future');
    if (claims.auth_time && !(claims.auth_time <= now + CLOCK_SKEW_SECONDS)) throw new Error('Invalid auth_time');

    return claims;
}

/**
 * Attach req.user ({ uid, email, emailVerified, name, picture, isAdmin, isSuperAdmin }) when a valid token
 * is present. Requests without a token continue as anonymous (req.user = null).
 */
async function attachUser(req, res, next) {
    req.user = null;
    const match = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!match) return next();

    try {
        const claims = await verifyIdToken(match[1].trim());
        const email = (claims.email || '').toLowerCase().trim();
        const emailVerified = claims.email_verified === true;
        // Email-based admin lists are only trusted for verified email addresses
        const isAdmin = firebaseService.isSuperAdminUser(claims.sub, '') ||
            (emailVerified && await firebaseService.isEmailAdminInFirebase(email, claims.sub));
        req.user = {
            uid: claims.sub,
            email,
            emailVerified,
            name: claims.name || '',
            picture: claims.picture || '',
            isAdmin: Boolean(isAdmin),
            // Only the two SuperAdmins: matched by UID, or by email once Google has verified it
            isSuperAdmin: firebaseService.isSuperAdminUser(claims.sub, emailVerified ? email : '')
        };
        next();
    } catch (e) {
        console.warn('[Auth] Rejected ID token:', e.message);
        res.status(401).json({ error: 'Invalid or expired sign-in session. Please sign in again.' });
    }
}

function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Sign-in required.' });
    next();
}

function requireAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Sign-in required.' });
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Administrator access required.' });
    next();
}

function requireSuperAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Sign-in required.' });
    if (!req.user.isSuperAdmin) return res.status(403).json({ error: 'SuperAdmin access required.' });
    next();
}

module.exports = { verifyIdToken, attachUser, requireAuth, requireAdmin, requireSuperAdmin };
