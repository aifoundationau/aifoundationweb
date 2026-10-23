/**
 * AI Foundation - Service Prices Store (Services 2)
 * The prices admins enter in the admin panel live in one Firestore document,
 * system_settings/aifoundation_service_prices. firestore.rules lets only SuperAdmins reach system_settings
 * from a browser, so the server reads and writes it with the service account: the public site loads prices
 * from GET /api/services/prices and admins save them with PUT /api/services/prices.
 * data/service-prices.json is a local copy, used when Firestore can't be reached (e.g. local development).
 */

const fs = require('fs');
const path = require('path');
const firebaseService = require('./firebase-service');
const { cleanPrices } = require('./public/service-pricing');

const COLLECTION = 'system_settings';
const DOCUMENT_ID = 'aifoundation_service_prices';
const DEFAULT_FILE = path.join(__dirname, 'data', 'service-prices.json');

// Partition key required on every AI Foundation record (data-contracts.md, Invariant Rule 1)
const PARTITION_KEY = { tag: 'aifoundation', businessId: 'aifoundation', businessName: 'AI Foundation', source: 'aifoundation' };

function createServicePriceStore({ firebase = firebaseService, filePath = DEFAULT_FILE } = {}) {
    function readLocalCopy() {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            return null;
        }
    }

    // Saved prices from Firestore, else the local copy, else no prices yet (every amount null)
    async function read() {
        let saved = null;
        try {
            saved = await firebase.getDocument(COLLECTION, DOCUMENT_ID);
        } catch (e) {
            console.warn('[Service Prices] Firestore read failed:', e.message);
        }
        if (!saved || !saved.prices) saved = readLocalCopy();
        return {
            prices: cleanPrices(saved && saved.prices).prices,
            updatedAt: saved && typeof saved.updatedAt === 'string' ? saved.updatedAt : null
        };
    }

    // Save prices that already passed cleanPrices(). Firestore is where saved prices live (Vercel's file system
    // is read-only); the local copy is best effort. The result says which of the two were written
    async function save(prices, updatedBy) {
        const updatedAt = new Date().toISOString();
        let firestore = false;
        try {
            const result = await firebase.writeDocument(COLLECTION, DOCUMENT_ID, {
                ...PARTITION_KEY,
                prices,
                updatedAt,
                updatedBy: updatedBy || ''
            });
            firestore = Boolean(result && result.success);
        } catch (e) {
            console.warn('[Service Prices] Firestore write failed:', e.message);
        }

        let file = false;
        try {
            // The admin's email stays out of the local copy, which may be committed to the repository
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify({ prices, updatedAt }, null, 2));
            file = true;
        } catch (e) {
            console.warn('[Service Prices] Read-only environment, skipping local copy:', e.message);
        }
        return { firestore, file, updatedAt };
    }

    return { read, save };
}

module.exports = { createServicePriceStore, COLLECTION, DOCUMENT_ID };
