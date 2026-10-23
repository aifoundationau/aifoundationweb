// Services & Pricing: today's USD to AUD rate from Frankfurter (exchange-rates.js).
// Usage: npm test. Frankfurter is replaced by a fake, so nothing is fetched from the internet.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createExchangeRates, RATE_URL } = require('../exchange-rates');

const HOUR = 60 * 60 * 1000;

// A fake fetch answering with each body in turn (a number is an HTTP error status, an Error is a network failure)
function fakeFrankfurter(...answers) {
    const calls = [];
    const fetchImpl = async (url) => {
        calls.push(url);
        const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
        if (answer instanceof Error) throw answer;
        if (typeof answer === 'number') return { ok: false, status: answer, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => answer };
    };
    return { fetchImpl, calls };
}

const TODAY = { date: '2026-10-23', base: 'USD', quote: 'AUD', rate: 1.4261 };

test('gets the USD to AUD rate from Frankfurter v2', async () => {
    const { fetchImpl, calls } = fakeFrankfurter(TODAY);
    const rates = createExchangeRates({ fetchImpl });
    assert.deepEqual(await rates.usdToAud(), { rate: 1.4261, date: '2026-10-23' });
    assert.deepEqual(calls, [RATE_URL]);
    assert.equal(RATE_URL, 'https://api.frankfurter.dev/v2/rate/USD/AUD');
});

test('keeps the rate for an hour, then fetches it again', async () => {
    let clock = 0;
    const { fetchImpl, calls } = fakeFrankfurter(TODAY, { ...TODAY, date: '2026-10-24', rate: 1.43 });
    const rates = createExchangeRates({ fetchImpl, now: () => clock });
    await rates.usdToAud();
    clock = HOUR - 1;
    assert.equal((await rates.usdToAud()).rate, 1.4261);
    assert.equal(calls.length, 1);
    clock = HOUR;
    assert.deepEqual(await rates.usdToAud(), { rate: 1.43, date: '2026-10-24' });
    assert.equal(calls.length, 2);
});

test('bad answers are refused when there is no earlier rate', async () => {
    const bad = [500, new Error('network down'), { ...TODAY, base: 'EUR' }, { ...TODAY, quote: 'NZD' },
        { ...TODAY, rate: 0 }, { ...TODAY, rate: 'abc' }, { ...TODAY, rate: 50 }, {}];
    for (const answer of bad) {
        const rates = createExchangeRates(fakeFrankfurter(answer));
        await assert.rejects(rates.usdToAud(), JSON.stringify(answer) || String(answer));
    }
});

test('uses the last rate fetched when Frankfurter fails later', async () => {
    let clock = 0;
    const rates = createExchangeRates({ ...fakeFrankfurter(TODAY, 503), now: () => clock });
    await rates.usdToAud();
    clock = 2 * HOUR;
    assert.deepEqual(await rates.usdToAud(), { rate: 1.4261, date: '2026-10-23' });
});
