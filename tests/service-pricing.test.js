// Services 2 prices: the shared rules (public/service-pricing.js) and the price store (service-prices.js).
// Usage: npm test. The store is given a fake Firestore and a temporary file, so nothing real is read or written.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pricing = require('../public/service-pricing');
const { createServicePriceStore, COLLECTION, DOCUMENT_ID } = require('../service-prices');

const BLANK_PRICES = {
    '30-day-roadmap': { price: { usd: null, aud: null } },
    'regulatory-roadmap': { price: { usd: null, aud: null } },
    'stack-selection': { price: { usd: null, aud: null } },
    'ai-agent-hosting': { setup: { usd: null, aud: null }, monthly: { usd: null, aud: null } }
};

test('the four services, with a setup and a monthly price for AI Agent Hosting', () => {
    assert.deepEqual(pricing.SERVICES.map(s => s.name), ['30 Day Roadmap', 'Regulatory Roadmap', 'Stack Selection', 'AI Agent Hosting']);
    assert.deepEqual(pricing.SERVICES.map(s => s.parts.map(p => p.key)), [['price'], ['price'], ['price'], ['setup', 'monthly']]);
});

test('parseAmount: blank boxes are null', () => {
    for (const value of [null, undefined, '', '   ', '$', ' $ ']) {
        assert.equal(pricing.parseAmount(value), null, JSON.stringify(value));
    }
});

test('parseAmount: plain, comma-grouped and $-prefixed amounts', () => {
    const cases = [['1500', 1500], ['1,500', 1500], ['$1,499.95', 1499.95], [' 250.5 ', 250.5], ['0.01', 0.01],
        ['1,000,000', 1000000], [1500, 1500], [19.99, 19.99]];
    for (const [value, expected] of cases) {
        assert.equal(pricing.parseAmount(value), expected, JSON.stringify(value));
    }
});

test('parseAmount: anything that is not a price is NaN', () => {
    const cases = ['0', '-5', '12.345', '1e3', 'abc', '1,50', '1500.', '1 500', 'AUD 100', '1000000.01',
        0, -1, NaN, Infinity, 1.234, true, {}, []];
    for (const value of cases) {
        assert.ok(Number.isNaN(pricing.parseAmount(value)), JSON.stringify(value));
    }
});

test('cleanPrices: every service and part is filled in; unknown keys are dropped', () => {
    const { prices, errors } = pricing.cleanPrices({
        '30-day-roadmap': { price: { usd: '1,500', aud: 2300 } },
        'ai-agent-hosting': { setup: { usd: 2000 }, monthly: { usd: 300, aud: '450.50' } },
        'stack-selection': { price: { usd: 900, gbp: 700 } },
        'not-a-service': { price: { usd: 1 } }
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(prices, {
        '30-day-roadmap': { price: { usd: 1500, aud: 2300 } },
        'regulatory-roadmap': { price: { usd: null, aud: null } },
        'stack-selection': { price: { usd: 900, aud: null } },
        'ai-agent-hosting': { setup: { usd: 2000, aud: null }, monthly: { usd: 300, aud: 450.5 } }
    });
});

test('cleanPrices: each invalid box is reported by service, part and currency', () => {
    const { prices, errors } = pricing.cleanPrices({
        'ai-agent-hosting': { monthly: { aud: '-20' } },
        'regulatory-roadmap': { price: { usd: 'free' } }
    });
    assert.deepEqual(errors.map(e => [e.serviceId, e.part, e.currency]), [
        ['regulatory-roadmap', 'price', 'usd'],
        ['ai-agent-hosting', 'monthly', 'aud']
    ]);
    assert.match(errors[0].message, /^Regulatory Roadmap: the USD price/);
    assert.match(errors[1].message, /^AI Agent Hosting \(Monthly servicing\): the AUD price/);
    assert.equal(prices['ai-agent-hosting'].monthly.aud, null);
});

test('cleanPrices: missing or malformed input gives blank prices', () => {
    for (const input of [undefined, null, 'x', [], { '30-day-roadmap': 'x' }, { 'ai-agent-hosting': { setup: 5 } }]) {
        const { prices, errors } = pricing.cleanPrices(input);
        assert.deepEqual(errors, [], JSON.stringify(input));
        assert.deepEqual(prices, BLANK_PRICES, JSON.stringify(input));
    }
});

test('resolvePrice: AUD only in Australia, USD by default, USD in Australia when no AUD price is set', () => {
    const both = { usd: 1500, aud: 2300 };
    const usdOnly = { usd: 1500, aud: null };
    const audOnly = { usd: null, aud: 2300 };
    assert.deepEqual(pricing.resolvePrice(both, 'AU'), { currency: 'AUD', amount: 2300 });
    assert.deepEqual(pricing.resolvePrice(both, 'au'), { currency: 'AUD', amount: 2300 });
    assert.deepEqual(pricing.resolvePrice(both, 'US'), { currency: 'USD', amount: 1500 });
    assert.deepEqual(pricing.resolvePrice(both, 'NZ'), { currency: 'USD', amount: 1500 });
    assert.deepEqual(pricing.resolvePrice(both, ''), { currency: 'USD', amount: 1500 });
    assert.deepEqual(pricing.resolvePrice(usdOnly, 'AU'), { currency: 'USD', amount: 1500 });
    assert.deepEqual(pricing.resolvePrice(audOnly, 'AU'), { currency: 'AUD', amount: 2300 });
    assert.equal(pricing.resolvePrice(audOnly, 'US'), null, 'AUD is never shown outside Australia');
    assert.equal(pricing.resolvePrice({ usd: null, aud: null }, 'AU'), null);
    assert.equal(pricing.resolvePrice(undefined, 'AU'), null);
});

test('formatPrice: currency code, thousands separators, cents only when present', () => {
    assert.equal(pricing.formatPrice({ currency: 'USD', amount: 1500 }), 'USD $1,500');
    assert.equal(pricing.formatPrice({ currency: 'AUD', amount: 2499.5 }), 'AUD $2,499.50');
    assert.equal(pricing.formatPrice({ currency: 'AUD', amount: 1000000 }), 'AUD $1,000,000');
    assert.equal(pricing.formatPrice(null), '');
});

// ---------- Price store ----------

function fakeFirestore({ available = true } = {}) {
    const docs = new Map();
    return {
        docs,
        async getDocument(collection, id) {
            return available ? docs.get(`${collection}/${id}`) || null : null;
        },
        async writeDocument(collection, id, data) {
            if (!available) return { success: false, error: 'Authentication unavailable' };
            docs.set(`${collection}/${id}`, JSON.parse(JSON.stringify(data)));
            return { success: true };
        }
    };
}

const tempDirs = [];
after(() => tempDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

function tempDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'service-prices-'));
    tempDirs.push(dir);
    return dir;
}

function tempPricesFile() {
    return path.join(tempDir(), 'data', 'service-prices.json');
}

const SAMPLE = pricing.cleanPrices({
    '30-day-roadmap': { price: { usd: 1500, aud: 2300 } },
    'ai-agent-hosting': { setup: { usd: 2000 }, monthly: { usd: 300, aud: 450 } }
}).prices;

test('store: nothing saved yet gives blank prices', async () => {
    const store = createServicePriceStore({ firebase: fakeFirestore(), filePath: tempPricesFile() });
    assert.deepEqual(await store.read(), { prices: BLANK_PRICES, updatedAt: null });
});

test('store: saves to Firestore with the partition key, and a local copy without the admin email', async () => {
    const firebase = fakeFirestore();
    const filePath = tempPricesFile();
    const store = createServicePriceStore({ firebase, filePath });

    const result = await store.save(SAMPLE, 'support@aifoundation.net.au');
    assert.equal(result.firestore, true);
    assert.equal(result.file, true);

    const doc = firebase.docs.get(`${COLLECTION}/${DOCUMENT_ID}`);
    assert.equal(`${COLLECTION}/${DOCUMENT_ID}`, 'system_settings/aifoundation_service_prices');
    assert.deepEqual(
        { tag: doc.tag, businessId: doc.businessId, businessName: doc.businessName, source: doc.source },
        { tag: 'aifoundation', businessId: 'aifoundation', businessName: 'AI Foundation', source: 'aifoundation' }
    );
    assert.deepEqual(doc.prices, SAMPLE);
    assert.equal(doc.updatedBy, 'support@aifoundation.net.au');
    assert.equal(doc.updatedAt, result.updatedAt);

    const copy = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.deepEqual(copy, { prices: SAMPLE, updatedAt: result.updatedAt });

    assert.deepEqual(await store.read(), { prices: SAMPLE, updatedAt: result.updatedAt });
});

test('store: Firestore wins over an older local copy', async () => {
    const firebase = fakeFirestore();
    const filePath = tempPricesFile();
    const store = createServicePriceStore({ firebase, filePath });
    await store.save(SAMPLE, 'support@aifoundation.net.au');
    fs.writeFileSync(filePath, JSON.stringify({ prices: BLANK_PRICES, updatedAt: '2020-01-01T00:00:00.000Z' }));
    assert.deepEqual((await store.read()).prices, SAMPLE);
});

test('store: uses the local copy when Firestore is unavailable', async () => {
    const store = createServicePriceStore({ firebase: fakeFirestore({ available: false }), filePath: tempPricesFile() });
    const result = await store.save(SAMPLE, 'support@aifoundation.net.au');
    assert.equal(result.firestore, false);
    assert.equal(result.file, true);
    assert.deepEqual((await store.read()).prices, SAMPLE);
});

test('store: reports when neither Firestore nor the local copy could be saved', async () => {
    // A path inside a regular file can't be created, like Vercel's read-only file system
    const blocker = path.join(tempDir(), 'not-a-folder');
    fs.writeFileSync(blocker, '');
    const store = createServicePriceStore({ firebase: fakeFirestore({ available: false }), filePath: path.join(blocker, 'service-prices.json') });
    const result = await store.save(SAMPLE, 'support@aifoundation.net.au');
    assert.equal(result.firestore, false);
    assert.equal(result.file, false);
});

test('store: bad values saved earlier are read back as blank', async () => {
    const firebase = fakeFirestore();
    firebase.docs.set(`${COLLECTION}/${DOCUMENT_ID}`, {
        prices: { '30-day-roadmap': { price: { usd: -5, aud: 'abc' } }, 'stack-selection': { price: { usd: '1,500' } } },
        updatedAt: '2026-10-23T00:00:00.000Z'
    });
    const store = createServicePriceStore({ firebase, filePath: tempPricesFile() });
    const { prices } = await store.read();
    assert.deepEqual(prices['30-day-roadmap'].price, { usd: null, aud: null });
    assert.deepEqual(prices['stack-selection'].price, { usd: 1500, aud: null });
});
