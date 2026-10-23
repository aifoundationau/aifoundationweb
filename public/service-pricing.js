/**
 * AI Foundation - Service Prices (Services 2)
 * Shared by the browser (window.ServicePricing) and the server (require), so the admin panel, the service
 * cards and the API use the same service list, the same price validation and the same currency rule.
 *
 * Admins enter each price in USD and AUD (two separate boxes). Visitors in Australia see the AUD price,
 * or the USD price when the AUD box is blank. Everyone else always sees the USD price.
 * Prices are whole dollars: decimals are rounded to the nearest dollar.
 * Token prices (Buy Tokens in the admin panel) follow the same rule, and the token box limits live here too.
 */
(function (root) {
    'use strict';

    // One entry per priced service on Services 2. Each part is one price; AI Agent Hosting has two
    const SERVICES = [
        { id: '30-day-roadmap', name: '30 Day Roadmap', parts: [{ key: 'price', label: 'Price' }] },
        { id: 'regulatory-roadmap', name: 'Regulatory Roadmap', parts: [{ key: 'price', label: 'Price' }] },
        { id: 'stack-selection', name: 'Stack Selection', parts: [{ key: 'price', label: 'Price' }] },
        {
            id: 'ai-agent-hosting',
            name: 'AI Agent Hosting',
            parts: [
                { key: 'setup', label: 'Setup' },
                { key: 'monthly', label: 'Monthly servicing', suffix: ' / month' }
            ]
        }
    ];

    // Token pricing: the price of one token, saved with the service prices and edited in the same form.
    // A blank USD box means the default, USD $1 per token
    const DEFAULT_TOKEN_PRICE = { usd: 1, aud: null };
    const TOKENS = {
        id: 'tokens',
        name: 'Tokens',
        note: 'Price per token: USD $1 unless you enter another price. In Buy Tokens, people buy 10 at a time (10, 20, 30 and so on), with no upper limit.',
        parts: [{ key: 'perToken', label: 'Price per token', placeholders: { usd: '1 (default)' } }]
    };

    // Every card in Services & Pricing, in the order shown
    const PRICE_GROUPS = [...SERVICES, TOKENS];

    const CURRENCIES = [
        { key: 'usd', code: 'USD', name: 'US dollars' },
        { key: 'aud', code: 'AUD', name: 'Australian dollars' }
    ];

    const MAX_AMOUNT = 1000000;

    // Token boxes (Buy Tokens and the SuperAdmin's Token Accounts) start at 10 and the + and - buttons change them by 10.
    // Tokens are bought 10 at a time (step) and priced per token (pricedPer). There is no upper limit; max only guards
    // against typing mistakes (a billion tokens in one go)
    const TOKEN_LIMITS = { min: 10, max: 1000000000, step: 10, pricedPer: 1 };

    // Stripe's smallest and largest card payment, in USD and in AUD
    const MIN_CARD_PAYMENT = 0.5;
    const MAX_CARD_PAYMENT = 999999.99;

    // A price box value as a whole number of dollars, null when the box is blank, or NaN when it isn't a price.
    // Accepts numbers and text such as "1500", "1,500" or "$1,499.95"; decimals are rounded to the nearest dollar
    // (1,499.95 is 1,500), and the result must be from 1 to MAX_AMOUNT
    function parseAmount(value) {
        if (value === null || value === undefined) return null;
        let amount;
        if (typeof value === 'number') {
            amount = value;
        } else if (typeof value === 'string') {
            const text = value.trim().replace(/^\$\s*/, '');
            if (!text) return null;
            if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(text)) return NaN;
            amount = Number(text.replace(/,/g, ''));
        } else {
            return NaN;
        }
        if (!Number.isFinite(amount)) return NaN;
        const dollars = Math.round(amount);
        return dollars >= 1 && dollars <= MAX_AMOUNT ? dollars : NaN;
    }

    // Prices in a fixed shape, { [serviceId]: { [partKey]: { usd, aud } } } with every amount a number or null,
    // plus one error per box that isn't a valid price. Covers every price group (the services and tokens).
    // Unknown services, parts and currencies are dropped
    function cleanPrices(input) {
        const source = input && typeof input === 'object' ? input : {};
        const prices = {};
        const errors = [];
        PRICE_GROUPS.forEach(service => {
            const serviceIn = source[service.id] && typeof source[service.id] === 'object' ? source[service.id] : {};
            prices[service.id] = {};
            service.parts.forEach(part => {
                const partIn = serviceIn[part.key] && typeof serviceIn[part.key] === 'object' ? serviceIn[part.key] : {};
                const cleaned = {};
                CURRENCIES.forEach(currency => {
                    const amount = parseAmount(partIn[currency.key]);
                    cleaned[currency.key] = Number.isNaN(amount) ? null : amount;
                    if (Number.isNaN(amount)) {
                        const label = service.parts.length > 1 ? `${service.name} (${part.label})` : service.name;
                        errors.push({
                            serviceId: service.id,
                            part: part.key,
                            currency: currency.key,
                            message: `${label}: the ${currency.code} price must be a whole number from 1 to 1,000,000, or left blank.`
                        });
                    }
                });
                prices[service.id][part.key] = cleaned;
            });
        });
        return { prices, errors };
    }

    // The price a visitor sees for one part of a service: AUD for visitors in Australia when an AUD price is set,
    // otherwise USD. Returns { currency, amount }, or null when there is no price to show
    function resolvePrice(part, countryCode) {
        const usd = parseAmount(part ? part.usd : null);
        const aud = parseAmount(part ? part.aud : null);
        if (String(countryCode || '').toUpperCase() === 'AU' && Number.isFinite(aud)) {
            return { currency: 'AUD', amount: aud };
        }
        return Number.isFinite(usd) ? { currency: 'USD', amount: usd } : null;
    }

    // "USD $1,500" or "AUD $2,499.50" (cents only when the price has them)
    function formatPrice(price) {
        if (!price) return '';
        const hasCents = !Number.isInteger(price.amount);
        const amount = price.amount.toLocaleString('en-AU', {
            minimumFractionDigits: hasCents ? 2 : 0,
            maximumFractionDigits: 2
        });
        return `${price.currency} $${amount}`;
    }

    // The AUD box's amount for a USD price at an exchange rate (AUD per USD), rounded to the nearest dollar.
    // null when the USD box isn't a price or the converted amount isn't a valid price
    function convertUsdToAud(usd, rate) {
        const amount = parseAmount(usd);
        if (!Number.isFinite(amount) || !(rate > 0)) return null;
        const aud = parseAmount(amount * rate);
        return Number.isFinite(aud) ? aud : null;
    }

    // A number of tokens as a whole number, or NaN when it isn't one from min (TOKEN_LIMITS.min unless given) to
    // TOKEN_LIMITS.max, or isn't a multiple of multipleOf (purchases pass TOKEN_LIMITS.step: tokens are bought 10 at a time).
    // Accepts numbers and text such as "300" or "1,500"
    function parseTokenQuantity(value, { min = TOKEN_LIMITS.min, multipleOf = 1 } = {}) {
        let quantity;
        if (typeof value === 'number') {
            quantity = value;
        } else if (typeof value === 'string' && /^\s*(?:\d{1,3}(?:,\d{3})+|\d+)\s*$/.test(value)) {
            quantity = Number(value.replace(/[,\s]/g, ''));
        } else {
            return NaN;
        }
        const valid = Number.isInteger(quantity) && quantity >= min && quantity <= TOKEN_LIMITS.max && quantity % multipleOf === 0;
        return valid ? quantity : NaN;
    }

    // The token price in use ({ usd, aud }) from saved prices: the saved USD price, or the default USD $1 when that box
    // is blank, and the saved AUD price (blank means visitors in Australia pay in USD too)
    function tokenPricePart(prices) {
        const saved = (prices && prices.tokens && prices.tokens.perToken) || {};
        const usd = parseAmount(saved.usd);
        const aud = parseAmount(saved.aud);
        return { usd: Number.isFinite(usd) ? usd : DEFAULT_TOKEN_PRICE.usd, aud: Number.isFinite(aud) ? aud : null };
    }

    // What a number of tokens costs at the price per token ({ currency, amount }), in whole dollars like every price
    function tokenTotal(pricePerToken, quantity) {
        if (!pricePerToken || !Number.isFinite(pricePerToken.amount) || !Number.isInteger(quantity)) return null;
        return { currency: pricePerToken.currency, amount: Math.round(pricePerToken.amount * quantity / TOKEN_LIMITS.pricedPer) };
    }

    const api = {
        SERVICES, TOKENS, PRICE_GROUPS, CURRENCIES, MAX_AMOUNT, TOKEN_LIMITS, MIN_CARD_PAYMENT, MAX_CARD_PAYMENT, DEFAULT_TOKEN_PRICE,
        parseAmount, cleanPrices, resolvePrice, formatPrice, convertUsdToAud, parseTokenQuantity, tokenPricePart, tokenTotal
    };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ServicePricing = api;
})(typeof window !== 'undefined' ? window : globalThis);
