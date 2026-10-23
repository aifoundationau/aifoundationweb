// server.js over HTTP: starts it on a free port and checks Services 2 (pages, redirect, prices API) and that the
// Message Box and chat routes refuse callers without a valid sign-in.
// Usage: npm test. The server runs with the Firebase service account turned off, so Firestore is never touched,
// and nothing is saved (saving needs a real admin sign-in).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { SERVICES } = require('../public/service-pricing');

const root = path.join(__dirname, '..');
let server;
let baseUrl;
let serverLog = '';

function freePort() {
    return new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });
}

before(async () => {
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['server.js'], {
        cwd: root,
        // Empty credentials turn Firestore off: dotenv never overrides variables that are already set
        env: { ...process.env, PORT: String(port), FIREBASE_CLIENT_EMAIL: '', FIREBASE_PRIVATE_KEY: '' },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stderr.on('data', chunk => { serverLog += chunk; });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Server did not start:\n${serverLog}`)), 20000);
        server.stdout.on('data', chunk => {
            serverLog += chunk;
            if (String(chunk).includes('running on')) {
                clearTimeout(timer);
                resolve();
            }
        });
        server.once('exit', code => {
            clearTimeout(timer);
            reject(new Error(`Server exited with code ${code}:\n${serverLog}`));
        });
    });
});

after(() => {
    if (server) server.kill();
});

const get = (urlPath, options) => fetch(`${baseUrl}${urlPath}`, options);

test('GET /api/services/prices lists every service and is never cached', async () => {
    const res = await get('/api/services/prices');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /no-store/);
    const body = await res.json();
    assert.equal(body.country, '');
    assert.deepEqual(Object.keys(body.prices), SERVICES.map(s => s.id));
    assert.deepEqual(Object.keys(body.prices['ai-agent-hosting']), ['setup', 'monthly']);
    assert.ok(!('updatedBy' in body), 'the admin email is never public');
});

test('the visitor country comes from the x-vercel-ip-country header', async () => {
    for (const [header, expected] of [['AU', 'AU'], ['us', 'US'], [' nz ', 'NZ'], ['A1B', ''], ['', '']]) {
        const res = await get('/api/services/prices', { headers: { 'x-vercel-ip-country': header } });
        assert.equal((await res.json()).country, expected, `header ${JSON.stringify(header)}`);
    }
});

test('saving prices needs an admin sign-in', async () => {
    const put = headers => get('/api/services/prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ prices: { '30-day-roadmap': { price: { usd: 1 } } } })
    });
    assert.equal((await put({})).status, 401);
    assert.equal((await put({ Authorization: 'Bearer not-a-real-token' })).status, 401);
});

test('Message Box and chat routes refuse callers without a valid sign-in', async () => {
    const forged = { Authorization: 'Bearer not-a-real-token' };
    for (const [method, urlPath] of [['GET', '/api/message-box'], ['GET', '/api/chat/conversations'], ['GET', '/api/chat/messages'], ['POST', '/api/chat/send']]) {
        const body = method === 'POST' ? JSON.stringify({ userMessage: 'hello' }) : undefined;
        const headers = method === 'POST' ? { 'Content-Type': 'application/json' } : {};
        assert.equal((await get(urlPath, { method, headers, body })).status, 401, `${method} ${urlPath} without sign-in`);
        assert.equal((await get(urlPath, { method, headers: { ...headers, ...forged }, body })).status, 401, `${method} ${urlPath} with a forged token`);
    }
});

test('the original Services page addresses open Services 2', async () => {
    for (const urlPath of ['/services', '/services.html', '/Services', '/services/']) {
        const res = await get(urlPath, { redirect: 'manual' });
        assert.equal(res.status, 302, urlPath);
        assert.equal(res.headers.get('location'), '/#services2', urlPath);
    }
});

test('services.html redirects itself too (Vercel serves it without reaching server.js)', () => {
    const html = fs.readFileSync(path.join(root, 'public', 'services.html'), 'utf8');
    assert.match(html, /<script>location\.replace\('\/#services2'\);<\/script>/);
    assert.match(html, /<meta http-equiv="refresh" content="0; url=\/#services2">/);
    assert.match(html, /<div id="section-services" class="content-section"/, 'original content kept');
});

test('home page: Services opens Services 2, the original section is kept, and the admin tab exists', async () => {
    const res = await get('/');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<li class="sidebar-item" data-target="section-services2">\s*<i class="fa-solid fa-briefcase"><\/i>\s*<span>Services<\/span>/);
    assert.doesNotMatch(html, /data-target="section-services"/, 'nothing opens the original section');
    assert.match(html, /<div id="section-services" class="content-section" style="display: none;/, 'original section kept, hidden');
    assert.match(html, /<div id="section-services2" class="content-section"/);
    for (const service of SERVICES) {
        assert.match(html, new RegExp(`data-service-price="${service.id}"`), service.id);
    }
    for (const title of ['Google AI Strategy &amp; First-Month Plan', 'Regional Education &amp; AI Literacy',
        'AI Tool Selection &amp; Governance Advisory', 'Managed AI Agent Hosting &amp; Maintenance']) {
        assert.ok(html.includes(`<h3 class="service-title">${title}</h3>`), title);
    }
    assert.match(html, /<div id="admin-services-pricing" class="admin-tab-content"/);
    assert.match(html, /<script src="service-pricing\.js\?v=\d+"><\/script>\s*<script src="app\.js/);
});

test('projects page: Services goes to Services 2 and the admin tab exists', async () => {
    const html = await (await get('/projects.html')).text();
    assert.match(html, /onclick="window\.location\.href='index\.html#services2'"/);
    assert.doesNotMatch(html, /services\.html'/);
    assert.match(html, /<div id="admin-services-pricing" class="admin-tab-content"/);
    assert.match(html, /<script src="service-pricing\.js\?v=\d+"><\/script>/);
});

test('service-pricing.js is served to the browser', async () => {
    const res = await get('/service-pricing.js');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
    assert.match(await res.text(), /root\.ServicePricing = api/);
});
