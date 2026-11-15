const dns = require('dns');
const net = require('net');

const DEFAULT_BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const LINKEDIN_BOT_UA = 'LinkedInBot/1.0 (compatible; Mozilla/5.0; +https://www.aifoundation.net.au)';
const FACEBOOK_BOT_UA = 'facebookexternalhit/1.1';
const FETCH_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 5;

const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'localhost.localdomain',
    'metadata.google.internal',
    'metadata',
    'instance-data'
]);

const NAMED_HTML_ENTITIES = {
    quot: '"',
    apos: "'",
    rsquo: '\u2019',
    lsquo: '\u2018',
    rdquo: '\u201d',
    ldquo: '\u201c',
    mdash: '\u2014',
    ndash: '\u2013',
    hellip: '\u2026',
    bull: '\u2022',
    nbsp: ' ',
    lt: '<',
    gt: '>',
    amp: '&'
};

function createHttpError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

function detectPlatform(url) {
    const lower = String(url || '').toLowerCase();
    if (lower.includes('linkedin.com') || lower.includes('lnkd.in')) return 'linkedin';
    if (lower.includes('instagram.com')) return 'instagram';
    if (lower.includes('facebook.com')) return 'facebook';
    if (lower.includes('twitter.com') || lower.includes('x.com')) return 'twitter';
    if (lower.includes('google.com/maps') || lower.includes('g.page')) return 'google_business';
    if (lower.includes('share.google') || lower.includes('google.com')) return 'google';
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
    return 'website';
}

function isLinkedInHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    return host === 'linkedin.com' || host.endsWith('.linkedin.com') || host === 'lnkd.in';
}

function isTwitterHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    return host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com');
}

function decodeHtmlEntities(str) {
    if (!str) return '';
    let text = String(str);
    text = text.replace(/&#(\d+);/g, (full, dec) => {
        const code = Number.parseInt(dec, 10);
        if (!Number.isInteger(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
            return full;
        }
        return String.fromCodePoint(code);
    });
    text = text.replace(/&#x([0-9a-fA-F]+);/g, (full, hex) => {
        const code = Number.parseInt(hex, 16);
        if (!Number.isInteger(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
            return full;
        }
        return String.fromCodePoint(code);
    });
    // Decode named entities with &amp; last so double-escaped tags stay safe
    text = text.replace(/&(quot|apos|rsquo|lsquo|rdquo|ldquo|mdash|ndash|hellip|bull|nbsp|lt|gt);/gi, (full, name) => {
        return NAMED_HTML_ENTITIES[name.toLowerCase()] ?? full;
    });
    text = text.replace(/&amp;/gi, '&');
    return text;
}

function normalizeInputUrl(rawInput) {
    if (typeof rawInput !== 'string') {
        throw createHttpError('URL is required', 400);
    }
    const trimmed = rawInput.trim();
    if (!trimmed) {
        throw createHttpError('URL is required', 400);
    }
    if (trimmed.length > 4096) {
        throw createHttpError('URL input is too long', 400);
    }

    let candidate = trimmed;
    const embeddedUrlMatch = candidate.match(/https?:\/\/[^\s"'<>]+/i);
    if (embeddedUrlMatch) {
        candidate = decodeHtmlEntities(embeddedUrlMatch[0]).replace(/[),.;]+$/, '');
    } else if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/.*)?$/i.test(candidate)) {
        candidate = `https://${candidate}`;
    }

    if (candidate.length > 2048) {
        throw createHttpError('URL exceeds maximum length of 2048 characters', 400);
    }

    let parsed;
    try {
        parsed = new URL(candidate);
    } catch {
        throw createHttpError('Please enter a valid HTTP or HTTPS URL', 400);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw createHttpError('Only HTTP and HTTPS URLs are supported', 400);
    }

    const normalizedUrl = parsed.toString();
    let cleanLink = normalizedUrl;
    const embedMatch = normalizedUrl.match(/^https?:\/\/(?:[a-z0-9-]+\.)?linkedin\.com\/embed\/feed\/update\/(urn:li:(?:activity|share|ugcPost):\d+)/i);
    if (embedMatch) {
        cleanLink = `https://www.linkedin.com/feed/update/${embedMatch[1]}/`;
    }

    return {
        normalizedUrl,
        cleanLink,
        wasEmbedInput: Boolean(embedMatch),
        wasShortLink: /(?:^|\.)lnkd\.in$/i.test(parsed.hostname)
    };
}

function isUnsafeIpv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
        return true;
    }
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a >= 224) return true; // Multicast & reserved
    return false;
}

function isUnsafeIp(rawIp) {
    const ip = String(rawIp || '').trim().replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
    const version = net.isIP(ip);
    if (!version) return false;

    if (version === 4) {
        return isUnsafeIpv4(ip);
    }

    // IPv6 checks
    if (ip === '::' || ip === '::1' || ip === '0:0:0:0:0:0:0:0' || ip === '0:0:0:0:0:0:0:1') {
        return true;
    }
    if (ip.startsWith('::ffff:')) {
        const mapped = ip.slice(7);
        if (net.isIP(mapped) === 4) {
            return isUnsafeIpv4(mapped);
        }
        const hexParts = mapped.split(':');
        if (hexParts.length === 2) {
            const hi = Number.parseInt(hexParts[0], 16);
            const lo = Number.parseInt(hexParts[1], 16);
            if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
                const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
                return isUnsafeIpv4(v4);
            }
        }
    }
    // fc00::/7 (Unique Local Addresses)
    if (/^f[cd][0-9a-f]{0,2}:/i.test(ip)) return true;
    // fe80::/10 (Link-local)
    if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;

    return false;
}

async function assertSafeUrl(urlObj, lookupImpl) {
    const hostname = String(urlObj.hostname || '').toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
    if (!hostname) {
        throw createHttpError('URL hostname is required', 400);
    }

    if (
        BLOCKED_HOSTNAMES.has(hostname) ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal')
    ) {
        throw createHttpError('Private or internal network URLs are not allowed', 400);
    }

    if (net.isIP(hostname)) {
        if (isUnsafeIp(hostname)) {
            throw createHttpError('Private or internal IP addresses are not allowed', 400);
        }
        return;
    }

    if (!lookupImpl) return;

    let records;
    try {
        records = await lookupImpl(hostname, { all: true });
    } catch {
        // Let the subsequent fetch attempt fail cleanly if DNS does not resolve here
        return;
    }

    const list = Array.isArray(records) ? records : (records ? [records] : []);
    for (const entry of list) {
        const addr = typeof entry === 'string' ? entry : entry?.address;
        if (addr && isUnsafeIp(addr)) {
            throw createHttpError('URL resolves to a private or internal IP address', 400);
        }
    }
}

function getUserAgentForHost(hostname, preferBotUa = false) {
    if (isLinkedInHost(hostname)) {
        return LINKEDIN_BOT_UA;
    }
    if (preferBotUa) {
        return FACEBOOK_BOT_UA;
    }
    return DEFAULT_BROWSER_UA;
}

async function safeFetchHtml(targetUrl, options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const lookupImpl = options.lookupImpl !== undefined
        ? options.lookupImpl
        : (options.fetchImpl ? null : dns.promises.lookup);

    let currentUrl = targetUrl;
    let lastRes = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        let parsed = new URL(currentUrl);
        if (isTwitterHost(parsed.hostname)) {
            parsed.hostname = 'fxtwitter.com';
            currentUrl = parsed.toString();
            parsed = new URL(currentUrl);
        }

        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw createHttpError('Redirected to a non-HTTP(S) URL', 400);
        }

        await assertSafeUrl(parsed, lookupImpl);

        const ua = getUserAgentForHost(parsed.hostname, false);
        let res = await fetchImpl(currentUrl, {
            headers: {
                'User-Agent': ua,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            redirect: 'manual',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });

        if (res.status >= 400 && !isLinkedInHost(parsed.hostname)) {
            const retryRes = await fetchImpl(currentUrl, {
                headers: {
                    'User-Agent': getUserAgentForHost(parsed.hostname, true),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                redirect: 'manual',
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
            });
            if (retryRes.status < res.status) {
                res = retryRes;
            }
        }

        lastRes = res;
        if (res.status >= 300 && res.status < 400) {
            const location = res.headers?.get ? res.headers.get('location') : null;
            if (!location) break;
            currentUrl = new URL(location, currentUrl).toString();
            continue;
        }

        const html = await res.text();
        return {
            status: res.status,
            finalUrl: res.url || currentUrl,
            html
        };
    }

    const html = lastRes ? await lastRes.text() : '';
    return {
        status: lastRes ? lastRes.status : 0,
        finalUrl: currentUrl,
        html
    };
}

function parseMetaTags(html) {
    const map = {};
    if (!html) return map;

    const tagRegex = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gis;
    const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_.:]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gs;

    const tags = html.match(tagRegex) || [];
    for (const tag of tags) {
        const attrs = {};
        let m;
        attrRegex.lastIndex = 0;
        while ((m = attrRegex.exec(tag)) !== null) {
            const key = m[1].toLowerCase();
            const val = m[2] ?? m[3] ?? m[4] ?? '';
            if (!(key in attrs)) {
                attrs[key] = val;
            }
        }

        const content = decodeHtmlEntities(attrs.content || '').trim();
        if (!content) continue;

        for (const keyAttr of ['property', 'name', 'itemprop']) {
            const metaKey = (attrs[keyAttr] || '').toLowerCase().trim();
            if (metaKey && !map[metaKey]) {
                map[metaKey] = content;
            }
        }
    }

    return map;
}

function parseTitleTag(html) {
    const match = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    return match ? decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim() : '';
}

function collectJsonLdNodes(parsed, out = []) {
    if (!parsed) return out;
    if (Array.isArray(parsed)) {
        for (const item of parsed) collectJsonLdNodes(item, out);
        return out;
    }
    if (typeof parsed === 'object') {
        out.push(parsed);
        if (Array.isArray(parsed['@graph'])) {
            collectJsonLdNodes(parsed['@graph'], out);
        }
    }
    return out;
}

function extractImagesFromValue(val, out = []) {
    if (!val) return out;
    if (typeof val === 'string') {
        out.push(val);
    } else if (Array.isArray(val)) {
        for (const item of val) extractImagesFromValue(item, out);
    } else if (typeof val === 'object') {
        if (typeof val.url === 'string') out.push(val.url);
        if (typeof val.contentUrl === 'string') out.push(val.contentUrl);
        if (typeof val.thumbnailUrl === 'string') out.push(val.thumbnailUrl);
    }
    return out;
}

function parseJsonLd(html) {
    const result = {
        isSocialPosting: false,
        headline: '',
        articleBody: '',
        description: '',
        canonicalUrl: '',
        images: []
    };
    if (!html) return result;

    const scriptRegex = /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
        const raw = (match[1] || '').trim();
        if (!raw) continue;
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            continue;
        }
        const nodes = collectJsonLdNodes(parsed);
        for (const node of nodes) {
            const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
            if (types.some(t => t === 'SocialMediaPosting' || t === 'DiscussionForumPosting')) {
                result.isSocialPosting = true;
            }
            if (!result.headline && typeof node.headline === 'string') {
                result.headline = decodeHtmlEntities(node.headline).trim();
            }
            if (typeof node.articleBody === 'string') {
                const body = decodeHtmlEntities(node.articleBody).trim();
                if (body.length > result.articleBody.length) {
                    result.articleBody = body;
                }
            }
            if (typeof node.description === 'string') {
                const desc = decodeHtmlEntities(node.description).trim();
                if (desc.length > result.description.length) {
                    result.description = desc;
                }
            }
            if (!result.canonicalUrl) {
                const candidateUrl = (typeof node.url === 'string' && node.url) ||
                    (typeof node['@id'] === 'string' && /^https?:\/\//i.test(node['@id']) && node['@id']) ||
                    (typeof node.mainEntityOfPage === 'string' && /^https?:\/\//i.test(node.mainEntityOfPage) && node.mainEntityOfPage) ||
                    (typeof node.mainEntityOfPage?.['@id'] === 'string' && /^https?:\/\//i.test(node.mainEntityOfPage['@id']) && node.mainEntityOfPage['@id']) ||
                    '';
                if (candidateUrl) result.canonicalUrl = candidateUrl;
            }
            extractImagesFromValue(node.image, result.images);
            extractImagesFromValue(node.video?.thumbnailUrl, result.images);
            extractImagesFromValue(node.sharedContent?.image, result.images);
        }
    }

    return result;
}

function extractLinkedInUrn(...urls) {
    for (const raw of urls) {
        if (!raw) continue;
        let text = String(raw);
        try {
            text = decodeURIComponent(text);
        } catch {
            // Keep raw text if malformed percent encoding
        }
        const urnMatch = text.match(/urn:li:(activity|share|ugcPost):(\d+)/i);
        if (urnMatch) {
            const kind = urnMatch[1] === 'ugcPost' ? 'ugcPost' : urnMatch[1].toLowerCase();
            return `urn:li:${kind}:${urnMatch[2]}`;
        }
        const slugMatch = text.match(/\/posts\/[^/?#]*?-(activity|ugcPost|share)-(\d+)/i);
        if (slugMatch) {
            const kind = slugMatch[1] === 'ugcPost' ? 'ugcPost' : slugMatch[1].toLowerCase();
            return `urn:li:${kind}:${slugMatch[2]}`;
        }
    }
    return '';
}

function isAuthWallTitle(title) {
    const t = String(title || '').trim().toLowerCase();
    if (!t) return true;
    if (t === 'linkedin' || t === 'just a moment...') return true;
    if (/^(?:sign up|join linkedin|security verification|linkedin login|linkedin:\s*log in)/.test(t)) return true;
    if (/\|\s*linkedin\s*$/.test(t) && /(?:sign in|sign up|log in|security verification)/i.test(t)) return true;
    return false;
}

function isBoilerplateDescription(text) {
    const t = String(text || '').trim().toLowerCase();
    if (!t) return true;
    return (
        t.includes('500 million+ members') ||
        t.includes('manage your professional identity') ||
        t.includes('sign in to view more content') ||
        t.includes('join linkedin today for free') ||
        t.includes('view your professional network')
    );
}

function cleanLinkedInTitle(raw) {
    let text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!text || isAuthWallTitle(text)) return '';

    text = text.replace(/\s*\|\s*[^|]+?\s+posted on the topic\s*\|\s*LinkedIn\s*$/i, '');
    text = text.replace(/\s*\|\s*\d[\d,]*\s+comments?\s*$/i, '');
    text = text.replace(/\s*[-|]\s*LinkedIn\s*$/i, '');
    text = text.replace(/^[^:\n]{1,80}\s+on LinkedIn:\s*/i, '');
    text = text.trim();

    if (
        (text.startsWith('"') && text.endsWith('"')) ||
        (text.startsWith("'") && text.endsWith("'")) ||
        (text.startsWith('\u201c') && text.endsWith('\u201d'))
    ) {
        text = text.slice(1, -1).trim();
    }

    if (!text || isAuthWallTitle(text)) return '';
    return text;
}

function cleanTitleForPlatform(raw, platform) {
    if (!raw) return '';
    if (platform === 'linkedin') {
        return cleanLinkedInTitle(raw);
    }
    const text = String(raw).replace(/\s+/g, ' ').trim();
    if (/^just a moment\.\.\.$/i.test(text)) return '';
    return text;
}

function cleanImageCandidate(rawUrl, baseUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    const decoded = decodeHtmlEntities(rawUrl)
        .replace(/&(?:amp|#0*38|#x0*26);/gi, '&')
        .trim();
    if (!decoded || decoded.startsWith('data:')) return '';
    if (/static\.licdn\.com\//i.test(decoded)) return '';

    try {
        const resolved = new URL(decoded, baseUrl);
        if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return '';
        return resolved.toString();
    } catch {
        return '';
    }
}

function isLinkedInAvatarUrl(imgUrl) {
    return /profile-displayphoto|company-logo_/i.test(String(imgUrl || ''));
}

function selectBestImage(candidates, baseUrl, platform) {
    const cleaned = [];
    for (const c of candidates) {
        const url = cleanImageCandidate(c, baseUrl);
        if (url && !cleaned.includes(url)) {
            cleaned.push(url);
        }
    }
    if (cleaned.length === 0) return '';
    if (platform === 'linkedin') {
        const contentMedia = cleaned.find(u => !isLinkedInAvatarUrl(u));
        if (contentMedia) return contentMedia;
    }
    return cleaned[0];
}

function parseAttributes(tag) {
    const attrs = {};
    const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_.:]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gs;
    let m;
    while ((m = attrRegex.exec(tag)) !== null) {
        const key = m[1].toLowerCase();
        const val = m[2] ?? m[3] ?? m[4] ?? '';
        if (!(key in attrs)) attrs[key] = val;
    }
    return attrs;
}

function parseLinkedInEmbedHtml(embedHtml) {
    const result = {
        title: '',
        summary: '',
        images: []
    };
    if (!embedHtml) return result;

    result.title = cleanLinkedInTitle(parseTitleTag(embedHtml));

    const commentaryMatch = embedHtml.match(/<p\b[^>]*data-test-id=["']main-feed-activity-embed-card__commentary["'][^>]*>([\s\S]*?)<\/p>/i);
    if (commentaryMatch) {
        const rawText = commentaryMatch[1]
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '');
        const decoded = decodeHtmlEntities(rawText).trim();
        if (decoded && !isBoilerplateDescription(decoded)) {
            result.summary = decoded;
        }
    }

    // Remove the author lockup avatar link before scanning media images
    const withoutActorAvatar = embedHtml.replace(
        /<a\b[^>]*data-tracking-control-name=["']public_post_embed_feed-actor-image["'][\s\S]*?<\/a>/gi,
        ''
    );

    const imgTags = withoutActorAvatar.match(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gis) || [];
    for (const tag of imgTags) {
        const attrs = parseAttributes(tag);
        const src = attrs['data-delayed-url'] || attrs.src || '';
        if (src && !/static\.licdn\.com\//i.test(src)) {
            result.images.push(src);
        }
    }

    const videoTags = withoutActorAvatar.match(/<video\b(?:[^>"']|"[^"]*"|'[^']*')*>/gis) || [];
    for (const tag of videoTags) {
        const attrs = parseAttributes(tag);
        const poster = attrs['data-poster-url'] || attrs.poster || '';
        if (poster && !/static\.licdn\.com\//i.test(poster)) {
            result.images.push(poster);
        }
    }

    return result;
}

function normalizeSummaryText(text) {
    return String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 3000);
}

function deriveTitleFromSummary(summary) {
    const text = String(summary || '').trim();
    if (!text) return '';
    const firstLine = text.split('\n')[0].trim();
    const sentenceMatch = firstLine.match(/^(.{1,120}?[.!?])(?:\s|$)/);
    if (sentenceMatch) return sentenceMatch[1].trim();
    if (firstLine.length <= 120) return firstLine;
    return firstLine.slice(0, 117).trimEnd() + '...';
}

async function extractMetadata(rawInput, options = {}) {
    const { normalizedUrl, cleanLink, wasEmbedInput, wasShortLink } = normalizeInputUrl(rawInput);
    const initialPlatform = detectPlatform(normalizedUrl);
    const initialUrn = extractLinkedInUrn(normalizedUrl, cleanLink);

    let primary = { status: 0, finalUrl: normalizedUrl, html: '' };
    let primaryMeta = {};
    let primaryJsonLd = { isSocialPosting: false, headline: '', articleBody: '', description: '', canonicalUrl: '', images: [] };
    let primaryHtmlTitle = '';

    try {
        const primaryTarget = wasEmbedInput && cleanLink ? cleanLink : normalizedUrl;
        primary = await safeFetchHtml(primaryTarget, options);
        if (primary.html) {
            primaryMeta = parseMetaTags(primary.html);
            primaryJsonLd = parseJsonLd(primary.html);
            primaryHtmlTitle = parseTitleTag(primary.html);
        }
    } catch (err) {
        if (err && err.statusCode === 400) {
            throw err;
        }
    }

    const resolvedUrl = primary.finalUrl || normalizedUrl;
    const platform = detectPlatform(resolvedUrl) !== 'website' ? detectPlatform(resolvedUrl) : initialPlatform;
    const urn = extractLinkedInUrn(normalizedUrl, cleanLink, resolvedUrl, primaryMeta['og:url'], primaryJsonLd.canonicalUrl) || initialUrn;

    const rawOgTitle = cleanTitleForPlatform(primaryMeta['og:title'] || primaryMeta['twitter:title'] || primaryHtmlTitle, platform);
    const rawHeadline = cleanTitleForPlatform(primaryJsonLd.headline, platform);
    const rawImage = selectBestImage(
        [
            primaryMeta['og:image'],
            primaryMeta['og:image:secure_url'],
            primaryMeta['twitter:image'],
            primaryMeta['twitter:image:src'],
            ...primaryJsonLd.images
        ],
        resolvedUrl,
        platform
    );

    const ogDesc = !isBoilerplateDescription(primaryMeta['og:description']) ? primaryMeta['og:description'] : '';
    const twDesc = !isBoilerplateDescription(primaryMeta['twitter:description']) ? primaryMeta['twitter:description'] : '';
    const metaDesc = !isBoilerplateDescription(primaryMeta['description']) ? primaryMeta['description'] : '';
    const ldDesc = !isBoilerplateDescription(primaryJsonLd.description) ? primaryJsonLd.description : '';
    const ldBody = !isBoilerplateDescription(primaryJsonLd.articleBody) ? primaryJsonLd.articleBody : '';

    let hasNonAvatarImage = Boolean(rawImage && (platform !== 'linkedin' || !isLinkedInAvatarUrl(rawImage)));
    const hasUsefulPrimarySummary = Boolean(ldBody || ogDesc || twDesc || metaDesc || ldDesc);

    let embedData = { title: '', summary: '', images: [] };
    if (
        platform === 'linkedin' &&
        urn &&
        (primary.status === 0 || primary.status >= 400 || !rawOgTitle || !hasUsefulPrimarySummary || !hasNonAvatarImage)
    ) {
        const embedUrl = `https://www.linkedin.com/embed/feed/update/${urn}`;
        try {
            const embedRes = await safeFetchHtml(embedUrl, options);
            if (embedRes.status >= 200 && embedRes.status < 400 && embedRes.html) {
                embedData = parseLinkedInEmbedHtml(embedRes.html);
            }
        } catch (err) {
            if (err && err.statusCode === 400) {
                throw err;
            }
        }
    }

    const isLinkedInSocialPost = platform === 'linkedin' && (primaryJsonLd.isSocialPosting || Boolean(urn)) && !/\/pulse\//i.test(resolvedUrl);

    let summary = '';
    if (isLinkedInSocialPost) {
        const candidates = [ldBody, embedData.summary, ogDesc, twDesc, metaDesc, ldDesc]
            .map(normalizeSummaryText)
            .filter(Boolean);
        candidates.sort((a, b) => b.length - a.length);
        summary = candidates[0] || '';
    } else {
        summary = normalizeSummaryText(ogDesc || twDesc || metaDesc || ldDesc || ldBody || embedData.summary);
    }

    let title = rawOgTitle || rawHeadline || embedData.title || deriveTitleFromSummary(summary) || '';
    title = title.replace(/\s+/g, ' ').trim().slice(0, 250);

    const imageUrl = selectBestImage(
        [
            primaryMeta['og:image'],
            primaryMeta['og:image:secure_url'],
            primaryMeta['twitter:image'],
            primaryMeta['twitter:image:src'],
            ...primaryJsonLd.images,
            ...embedData.images
        ],
        resolvedUrl,
        platform
    );

    let finalLink = normalizedUrl;
    if (wasShortLink || wasEmbedInput) {
        finalLink = primaryMeta['og:url'] || primaryJsonLd.canonicalUrl || (primary.status >= 200 && primary.status < 400 ? resolvedUrl : '') || cleanLink;
    }

    const hasTitle = Boolean(title);
    const partial = !hasTitle && !summary && !imageUrl;

    return {
        title: title || 'Update from link',
        summary,
        imageUrl,
        platform,
        link: finalLink,
        partial
    };
}

module.exports = {
    detectPlatform,
    normalizeInputUrl,
    assertSafeUrl,
    decodeHtmlEntities,
    parseMetaTags,
    parseTitleTag,
    parseJsonLd,
    extractLinkedInUrn,
    cleanLinkedInTitle,
    parseLinkedInEmbedHtml,
    extractMetadata
};

