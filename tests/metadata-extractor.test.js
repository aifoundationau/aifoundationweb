// LinkedIn & OpenGraph metadata extractor tests (metadata-extractor.js).
// Usage: npm test. Uses fake fetch/DNS implementations so nothing is fetched from the internet.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractMetadata } = require('../metadata-extractor');

function fakeFetch(routes) {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
        calls.push({ url, headers: init.headers || {} });
        const handler = typeof routes === 'function' ? routes(url, init) : routes[url];
        if (!handler) {
            return { ok: false, status: 404, url, headers: new Headers(), text: async () => '' };
        }
        if (handler instanceof Error) throw handler;
        const status = handler.status || 200;
        return {
            ok: status >= 200 && status < 300,
            status,
            url: handler.url || url,
            headers: new Headers(handler.headers || {}),
            text: async () => handler.html || ''
        };
    };
    return { fetchImpl, calls };
}

test('extracts full multi-line LinkedIn feed post with apostrophes, HTML entities, cleaned title, and ld+json articleBody', async () => {
    const postUrl = 'https://www.linkedin.com/feed/update/urn:li:share:7520768453159407616/';
    const html = `
        <html>
        <head>
            <meta property="og:title" content="Streamline Hiring with What HR's Messaging Platform | David R. posted on the topic | LinkedIn">
            <meta property="og:description" content="Connecting top talent with hiring teams just got significantly faster with What HR's built-in messaging platform.&#10;Line 1 -> Line 2 &amp; more...">
            <meta property="og:image" content="https://media.licdn.com/dms/image/v2/sample/feedshare?e=2147483647&amp;v=beta&amp;t=abc123">
            <script type="application/ld+json">
            {
                "@context": "http://schema.org",
                "@type": "SocialMediaPosting",
                "headline": "Connecting top talent with hiring teams",
                "articleBody": "What HR&#39;s built-in messaging &#x2014; full body:\\nLine 1 -&gt; Line 2\\n\\nAustralia&#8217;s fastest &quot;direct&quot; hiring flow with complete end-to-end details and zero truncation.",
                "image": {
                    "@type": "ImageObject",
                    "url": "https://media.licdn.com/dms/image/v2/sample/feedshare?e=2147483647&amp;v=beta&amp;t=abc123"
                }
            }
            </script>
        </head>
        </html>
    `;
    const { fetchImpl } = fakeFetch({ [postUrl]: { status: 200, html } });
    const data = await extractMetadata(postUrl, { fetchImpl });

    assert.equal(data.title, "Streamline Hiring with What HR's Messaging Platform");
    assert.equal(
        data.summary,
        "What HR's built-in messaging \u2014 full body:\nLine 1 -> Line 2\n\nAustralia\u2019s fastest \"direct\" hiring flow with complete end-to-end details and zero truncation."
    );
    assert.equal(data.imageUrl, 'https://media.licdn.com/dms/image/v2/sample/feedshare?e=2147483647&v=beta&t=abc123');
    assert.equal(data.platform, 'linkedin');
    assert.equal(data.link, postUrl);
    assert.equal(data.partial, false);
});

test('LinkedIn Pulse article sends LinkedInBot User-Agent and keeps og:title over Article.headline paragraph', async () => {
    const pulseUrl = 'https://www.linkedin.com/pulse/why-i-build-semantic-rag-over-traditional-databases-across-xgznc/';
    const html = `
        <html>
        <head>
            <meta property="og:title" content="Why I Build with Semantic RAG Over Traditional Databases Across My Applications">
            <meta property="og:description" content="A database searches this:\nA RAG searches this:\nIf you're looking for something specific, it's clear.">
            <meta property="og:image" content="https://media.licdn.com/dms/image/v2/cover/img.jpg?e=1&amp;v=beta&amp;t=xyz">
            <script type="application/ld+json">
            {
                "@context": "http://schema.org",
                "@type": "Article",
                "headline": "A database searches this: A RAG searches this: opening paragraph text instead of title"
            }
            </script>
        </head>
        </html>
    `;
    const { fetchImpl, calls } = fakeFetch((url, init) => {
        assert.match(init.headers['User-Agent'], /^LinkedInBot\/1\.0/);
        return { status: 200, html };
    });

    const data = await extractMetadata(pulseUrl, { fetchImpl });
    assert.equal(calls.length, 1);
    assert.equal(data.title, 'Why I Build with Semantic RAG Over Traditional Databases Across My Applications');
    assert.equal(data.summary, "A database searches this:\nA RAG searches this:\nIf you're looking for something specific, it's clear.");
    assert.equal(data.imageUrl, 'https://media.licdn.com/dms/image/v2/cover/img.jpg?e=1&v=beta&t=xyz');
    assert.equal(data.platform, 'linkedin');
    assert.equal(data.partial, false);
});

test('parses reversed and multi-attribute meta tags including newlines and apostrophes', async () => {
    const pageUrl = 'https://example.com/article';
    const html = `
        <html><head>
            <meta content="Australia's AI &amp; Tech Update" name="title" property="og:title">
            <meta content="First paragraph's detail.
Second line with 'single' and &quot;double&quot; quotes." property="og:description" itemprop="description">
            <meta content="https://cdn.example.com/hero.png?a=1&amp;b=2" name="image" property="og:image">
        </head></html>
    `;
    const { fetchImpl } = fakeFetch({ [pageUrl]: { status: 200, html } });
    const data = await extractMetadata(pageUrl, { fetchImpl });

    assert.equal(data.title, "Australia's AI & Tech Update");
    assert.equal(data.summary, "First paragraph's detail.\nSecond line with 'single' and \"double\" quotes.");
    assert.equal(data.imageUrl, 'https://cdn.example.com/hero.png?a=1&b=2');
    assert.equal(data.platform, 'website');
    assert.equal(data.partial, false);
});

test('falls back to LinkedIn public embed endpoint when primary post URL hits authwall/403, ignoring ghosts and actor avatar', async () => {
    const postUrl = 'https://www.linkedin.com/posts/dcraus_connecting-top-talent-with-hiring-teams-just-activity-7520768454350630912-F0ar';
    const embedUrl = 'https://www.linkedin.com/embed/feed/update/urn:li:activity:7520768454350630912';
    const embedHtml = `
        <html>
        <head><title>Streamline Hiring with What HR's Messaging Platform | David R. posted on the topic | LinkedIn</title></head>
        <body>
            <a href="https://au.linkedin.com/in/dcraus" data-tracking-control-name="public_post_embed_feed-actor-image">
                <img src="https://media.licdn.com/dms/image/v2/profile-displayphoto-shrink_100_100/avatar.jpg">
            </a>
            <p class="attributed-text-segment-list__content" data-test-id="main-feed-activity-embed-card__commentary">First paragraph about What HR's launch.<br><br>Second paragraph with full details!</p>
            <img class="lazy-load" data-delayed-url="https://media.licdn.com/dms/image/v2/feedshare-shrink_800/post-photo.jpg?e=1&amp;t=ok" data-ghost-url="https://static.licdn.com/aero-v1/sc/h/ghost.png">
            <img src="https://static.licdn.com/aero-v1/sc/h/logo-ghost.png">
        </body>
        </html>
    `;

    const { fetchImpl } = fakeFetch({
        [postUrl]: { status: 403, html: '<html><title>Sign Up | LinkedIn</title></html>' },
        [embedUrl]: { status: 200, html: embedHtml }
    });

    const data = await extractMetadata(postUrl, { fetchImpl });
    assert.equal(data.title, "Streamline Hiring with What HR's Messaging Platform");
    assert.equal(data.summary, "First paragraph about What HR's launch.\n\nSecond paragraph with full details!");
    assert.equal(data.imageUrl, 'https://media.licdn.com/dms/image/v2/feedshare-shrink_800/post-photo.jpg?e=1&t=ok');
    assert.equal(data.platform, 'linkedin');
    assert.equal(data.partial, false);
});

test('normalizes iframe embed snippet, bare www URLs, and lnkd.in shortlink redirects', async () => {
    const shareUrn = 'urn:li:share:7520768453159407616';
    const canonicalShareUrl = `https://www.linkedin.com/feed/update/${shareUrn}/`;
    const iframeSnippet = `<iframe src="https://www.linkedin.com/embed/feed/update/${shareUrn}" height="600" width="504" frameborder="0" allowfullscreen="" title="Embedded post"></iframe>`;

    const shareHtml = `
        <html><head>
            <meta property="og:title" content="Iframe Post Title | LinkedIn">
            <meta property="og:description" content="Extracted via canonical feed update">
            <meta property="og:image" content="https://media.licdn.com/dms/image/v2/card.jpg">
        </head></html>
    `;
    const { fetchImpl: iframeFetch } = fakeFetch({
        [canonicalShareUrl]: { status: 200, html: shareHtml }
    });
    const iframeRes = await extractMetadata(iframeSnippet, { fetchImpl: iframeFetch });
    assert.equal(iframeRes.title, 'Iframe Post Title');
    assert.equal(iframeRes.summary, 'Extracted via canonical feed update');
    assert.equal(iframeRes.link, canonicalShareUrl);
    assert.equal(iframeRes.platform, 'linkedin');

    const bareInput = 'www.linkedin.com/pulse/test-article-abc/';
    const bareUrl = 'https://www.linkedin.com/pulse/test-article-abc/';
    const { fetchImpl: bareFetch } = fakeFetch({
        [bareUrl]: { status: 200, html: '<html><head><meta property="og:title" content="Bare Domain Title"></head></html>' }
    });
    const bareRes = await extractMetadata(bareInput, { fetchImpl: bareFetch });
    assert.equal(bareRes.title, 'Bare Domain Title');
    assert.equal(bareRes.link, bareUrl);
    assert.equal(bareRes.platform, 'linkedin');

    const shortUrl = 'https://lnkd.in/g12345';
    const resolvedPost = 'https://www.linkedin.com/posts/aifoundation_update-activity-9999999999999999999-abcd';
    const { fetchImpl: shortFetch } = fakeFetch({
        [shortUrl]: { status: 301, headers: { location: resolvedPost } },
        [resolvedPost]: {
            status: 200,
            html: '<html><head><meta property="og:title" content="Shortlink Post"><meta property="og:url" content="' + resolvedPost + '"></head></html>'
        }
    });
    const shortRes = await extractMetadata(shortUrl, { fetchImpl: shortFetch });
    assert.equal(shortRes.title, 'Shortlink Post');
    assert.equal(shortRes.platform, 'linkedin');
    assert.equal(shortRes.link, resolvedPost);
});

test('SSRF protection rejects loopback, private subnets, metadata IPs, private DNS answers, and redirects to internal hosts', async () => {
    const blockedUrls = [
        'http://127.0.0.1/secret',
        'http://localhost:3002/api/posts',
        'http://169.254.169.254/latest/meta-data/',
        'http://192.168.1.1/admin',
        'http://10.0.0.5/internal',
        'http://172.16.0.1/status',
        'http://[::1]/secret'
    ];

    for (const bad of blockedUrls) {
        await assert.rejects(
            () => extractMetadata(bad, { fetchImpl: async () => { throw new Error('Should not fetch'); } }),
            err => err.statusCode === 400
        );
    }

    // DNS resolving a domain to a private IP
    await assert.rejects(
        () => extractMetadata('https://rebind.example.com/post', {
            fetchImpl: async () => { throw new Error('Should not fetch'); },
            lookupImpl: async () => [{ address: '127.0.0.1', family: 4 }]
        }),
        err => err.statusCode === 400
    );

    // 302 redirect pointing to loopback
    const { fetchImpl: redirectFetch } = fakeFetch({
        'https://public.example.com/start': {
            status: 302,
            headers: { location: 'http://127.0.0.1:3002/internal' }
        }
    });
    await assert.rejects(
        () => extractMetadata('https://public.example.com/start', {
            fetchImpl: redirectFetch,
            lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }]
        }),
        err => err.statusCode === 400
    );
});
