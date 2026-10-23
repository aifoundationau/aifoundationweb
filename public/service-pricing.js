/**
 * AI Foundation - Service Prices (Services 2)
 * Shared by the browser (window.ServicePricing) and the server (require), so the admin panel, the service
 * cards and the API use the same service list, the same price validation and the same currency rule.
 *
 * Admins enter each price in USD and AUD (two separate boxes). Visitors in Australia see the AUD price,
 * or the USD price when the AUD box is blank. Everyone else always sees the USD price.
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

    const CURRENCIES = [
        { key: 'usd', code: 'USD', name: 'US dollars' },
        { key: 'aud', code: 'AUD', name: 'Australian dollars' }
    ];

    const MAX_AMOUNT = 1000000;

    // A price box value as a number (rounded to cents), null when the box is blank, or NaN when it isn't a price.
    // Accepts numbers and text such as "1500", "1,500" or "$1,499.95"; must be above 0 and at most MAX_AMOUNT
    function parseAmount(value) {
        if (value === null || value === undefined) return null;
        let amount;
        if (typeof value === 'number') {
            amount = value;
        } else if (typeof value === 'string') {
            const text = value.trim().replace(/^\$\s*/, '');
            if (!text) return null;
            if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(text)) return NaN;
            amount = Number(text.replace(/,/g, ''));
        } else {
            return NaN;
        }
        if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return NaN;
        const cents = Math.round(amount * 100);
        if (Math.abs(cents - amount * 100) > 1e-6) return NaN;
        return cents / 100;
    }

    // Prices in a fixed shape, { [serviceId]: { [partKey]: { usd, aud } } } with every amount a number or null,
    // plus one error per box that isn't a valid price. Unknown services, parts and currencies are dropped
    function cleanPrices(input) {
        const source = input && typeof input === 'object' ? input : {};
        const prices = {};
        const errors = [];
        SERVICES.forEach(service => {
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
                            message: `${label}: the ${currency.code} price must be a number from 0.01 to 1,000,000 with up to 2 decimal places, or left blank.`
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

    const api = { SERVICES, CURRENCIES, MAX_AMOUNT, parseAmount, cleanPrices, resolvePrice, formatPrice };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ServicePricing = api;
})(typeof window !== 'undefined' ? window : globalThis);
