process.on('uncaughtException', (err) => {
    try { require('fs').writeFileSync('crash_error.txt', 'UNCAUGHT EXCEPTION: ' + (err?.stack || err) + '\n'); } catch (e) {}
    console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason) => {
    try { require('fs').writeFileSync('crash_error.txt', 'UNHANDLED REJECTION: ' + (reason?.stack || reason) + '\n'); } catch (e) {}
    console.error('UNHANDLED REJECTION:', reason);
});
console.log('[Server Startup] 1. Initializing environment...');
require('dotenv').config();
console.log('[Server Startup] 2. Loading core dependencies...');
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Initialize Firebase Admin SDK
const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
  })
});
console.log('[Server Startup] 3. Loading firebase service...');
const firebaseService = require('./firebase-service');
// Export admin for other modules if needed
module.exports.admin = admin;
const { attachUser, requireAuth, requireAdmin, requireSuperAdmin } = require('./auth-middleware');
const servicePricing = require('./public/service-pricing');
const { createServicePriceStore } = require('./service-prices');
const { loadMessageBox } = require('./message-box');
console.log('[Server Startup] 4. Dependencies loaded.');

const app = express();

let _stripe = null;
function getStripe() {
    if (!_stripe && process.env.STRIPE_SECRET_KEY) {
        const Stripe = require('stripe');
        _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
    return _stripe;
}
// Log the full error server-side; send the browser a generic message.
// Stripe card/validation errors are written for customers, so those are passed through.
function sendServerError(res, err, publicMessage = 'Something went wrong. Please try again.') {
    const isCustomerFacing = err && (err.type === 'StripeCardError' || err.type === 'StripeInvalidRequestError');
    res.status(500).json({ error: isCustomerFacing ? err.message : publicMessage });
}
// Donation limits (AUD, whole dollars). The maximum can be raised with MAX_DONATION_AUD in .env
const MIN_DONATION_AUD = 50;
const MAX_DONATION_AUD = Number(process.env.MAX_DONATION_AUD) || 100000;

// Returns a whole-dollar amount within limits, or null. Rejects "50abc", "50.5", "1e3", negatives
function parseDonationAmount(value) {
    const text = String(value ?? '').trim();
    if (!/^\d{1,9}$/.test(text)) return null;
    const amount = Number(text);
    return (amount >= MIN_DONATION_AUD && amount <= MAX_DONATION_AUD) ? amount : null;
}
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'posts.json');
const COMM_DATA_FILE = path.join(__dirname, 'data', 'community.json');
const TECH_DATA_FILE = path.join(__dirname, 'data', 'tech.json');
const PROJECTS_DATA_FILE = path.join(__dirname, 'data', 'projects.json');
const servicePrices = createServicePriceStore();

app.disable('x-powered-by');

// Security headers on every response
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Clickjacking: only this site and AI Foundation portals may frame these pages
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.aifoundation.net.au; object-src 'none'; base-uri 'self'");
    // geolocation=(self): the location bar (site-locale.js) can ask for the visitor's position on this site only
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(self "https://js.stripe.com")');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

app.use(express.json({ limit: '10mb' }));
// Every /api request: verify the Firebase ID token (if sent) and expose it as req.user
app.use('/api', attachUser);
// The original Services page (public/services.html) is kept but hidden for now: its addresses open Services 2
// on the home page instead. On Vercel /services.html is served without reaching this app, so services.html
// also redirects itself. To show the original page again, remove this redirect and the one in services.html
app.get(['/services', '/services.html'], (req, res) => {
    res.redirect(302, '/#services2');
});
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Ensure data folder & initial posts exist
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
    const initialPosts = [
        {
            id: 'post_1',
            title: 'Empowering Educational Equity: Flexible, Community-Driven Learning',
            summary: 'Exploring how flexible AI solutions and community initiatives are transforming education access across Australia.',
            link: 'https://www.linkedin.com/pulse/empowering-educational-equity-flexible-community-driven-cyr3c/',
            imageUrl: 'https://i.ibb.co/L8mN8vX/education-ai.jpg',
            platform: 'linkedin',
            author: 'AI Foundation Australia',
            date: new Date().toISOString()
        },
        {
            id: 'post_2',
            title: 'AI Solutions with Real Impact - Community Update',
            summary: 'Latest updates on AI Foundation deployment and industry partnerships delivering real AI impact.',
            link: 'https://share.google/Rs9exGIaP2MQqmjnD',
            imageUrl: 'https://i.ibb.co/q1zR6D4/google-share-update.jpg',
            platform: 'google',
            author: 'AI Foundation Australia',
            date: new Date(Date.now() - 86400000).toISOString()
        }
    ];
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialPosts, null, 2));
}

if (!fs.existsSync(COMM_DATA_FILE)) {
    fs.writeFileSync(COMM_DATA_FILE, JSON.stringify([], null, 2));
}

if (!fs.existsSync(TECH_DATA_FILE)) {
    fs.writeFileSync(TECH_DATA_FILE, JSON.stringify([], null, 2));
}

function getPosts() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

const PUBLIC_DATA_DIR = path.join(__dirname, 'public', 'data');
if (!fs.existsSync(PUBLIC_DATA_DIR)) {
    fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
}

function deduplicateItems(items) {
    if (!Array.isArray(items)) return [];
    const seen = new Set();
    const result = [];
    for (const item of items) {
        if (!item) continue;
        const normLink = (item.link || '').trim().toLowerCase().replace(/\/+$/, '');
        const normTitle = (item.title || '').trim().toLowerCase();
        const id = (item.id || '').trim();
        const key = id || normLink || normTitle;
        if (key && seen.has(key)) continue;
        if (normLink && seen.has(normLink)) continue;
        if (normTitle && seen.has(normTitle)) continue;
        if (key) seen.add(key);
        if (normLink) seen.add(normLink);
        if (normTitle) seen.add(normTitle);
        result.push(item);
    }
    return result;
}

function savePosts(posts) {
    const deduped = deduplicateItems(posts);
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(deduped, null, 2));
    } catch (e) {
        console.warn('[Sync] Read-only environment, skipping DATA_FILE write:', e.message);
    }
    try {
        fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'posts.json'), JSON.stringify(deduped, null, 2));
    } catch (e) {
        console.warn('[Sync] Read-only environment, skipping public/data write:', e.message);
    }
}

function getCommunityPosts() {
    try {
        return JSON.parse(fs.readFileSync(COMM_DATA_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveCommunityPosts(posts) {
    const deduped = deduplicateItems(posts);
    try {
        fs.writeFileSync(COMM_DATA_FILE, JSON.stringify(deduped, null, 2));
    } catch (e) {
        console.warn('[Sync] Read-only environment, skipping COMM_DATA_FILE write:', e.message);
    }
    try {
        fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'community.json'), JSON.stringify(deduped, null, 2));
    } catch (e) {
        console.warn('[Sync] Read-only environment, skipping public/data write:', e.message);
    }
}

function getTechPosts() {
    try {
        return JSON.parse(fs.readFileSync(TECH_DATA_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveTechPosts(posts) {
    const deduped = deduplicateItems(posts);
    try {
        fs.writeFileSync(TECH_DATA_FILE, JSON.stringify(deduped, null, 2));
    } catch (e) {
        console.warn('[Sync] Read-only environment, skipping TECH_DATA_FILE write:', e.message);
    }
    try {
        fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'tech.json'), JSON.stringify(deduped, null, 2));
    } catch (e) {
        console.warn('[Sync] Read-only environment, skipping public/data write:', e.message);
    }
}

function getProjects() {
    try {
        return JSON.parse(fs.readFileSync(PROJECTS_DATA_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveProjects(projects) {
    const deduped = deduplicateItems(projects);
    try {
        fs.writeFileSync(PROJECTS_DATA_FILE, JSON.stringify(deduped, null, 2));
    } catch (e) {
        console.warn('[Sync] Read-only environment, skipping PROJECTS_DATA_FILE write:', e.message);
    }
    try {
        fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'projects.json'), JSON.stringify(deduped, null, 2));
    } catch (e) {
        console.warn('[Sync] Read-only environment, skipping public/data write:', e.message);
    }
}

// Helper to upload any image other than posts to ImgBB (using IMGBB_API_KEY)
async function uploadToImgBB(imageInput) {
    if (!imageInput || typeof imageInput !== 'string') return imageInput;
    const trimmed = imageInput.trim();
    if (!trimmed || trimmed === 'assets/logo.png') return trimmed;
    // Already on ImgBB
    if (trimmed.includes('i.ibb.co') || trimmed.includes('ibb.co/')) {
        return trimmed;
    }

    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
        console.warn('IMGBB_API_KEY is not set in .env; skipping external image upload.');
        return imageInput;
    }
    try {
        const formData = new FormData();
        if (trimmed.startsWith('data:image')) {
            const cleanBase64 = trimmed.replace(/^data:image\/\w+;base64,/, '');
            formData.append('image', cleanBase64);
        } else {
            formData.append('image', trimmed);
        }

        const res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: formData
        });
        const result = await res.json();
        if (result.success && result.data && result.data.url) {
            console.log(`[ImgBB] Successfully uploaded image to ${result.data.url}`);
            return result.data.url;
        } else {
            console.warn('[ImgBB] Upload returned non-success:', result.error || result);
            return trimmed;
        }
    } catch (err) {
        console.error('[ImgBB] Upload network failure:', err.message);
        return trimmed;
    }
}

// Keep the original thumbnail as imageUrl (the one displayed) and record an ImgBB copy of it as imageBackupUrl.
// Images already on ImgBB need no copy; an uploaded file (base64) has no original web address, so its ImgBB copy is shown
async function withImgBBBackup(imageUrl, imageBackupUrl) {
    if (!imageUrl || imageUrl === 'assets/logo.png' || imageUrl.includes('i.ibb.co')) {
        return { imageUrl, imageBackupUrl: '' };
    }
    const backupUrl = imageBackupUrl || await uploadToImgBB(imageUrl);
    if (!backupUrl || !backupUrl.includes('i.ibb.co')) {
        return { imageUrl, imageBackupUrl: '' };
    }
    return imageUrl.startsWith('data:') ? { imageUrl: backupUrl, imageBackupUrl: '' } : { imageUrl, imageBackupUrl: backupUrl };
}

function detectPlatform(url) {
    const lower = url.toLowerCase();
    if (lower.includes('linkedin.com')) return 'linkedin';
    if (lower.includes('instagram.com')) return 'instagram';
    if (lower.includes('facebook.com')) return 'facebook';
    if (lower.includes('twitter.com') || lower.includes('x.com')) return 'twitter';
    if (lower.includes('google.com/maps') || lower.includes('g.page')) return 'google_business';
    if (lower.includes('share.google') || lower.includes('google.com')) return 'google';
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
    return 'website';
}

// GET all posts
app.get('/api/posts', (req, res) => {
    const posts = getPosts();
    res.json(posts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)));
});

// CREATE new post
app.post('/api/posts', requireAdmin, async (req, res) => {
    const { title, summary, link, imageUrl, platform, author, id, firestoreSynced } = req.body;
    if (!title || !link) {
        return res.status(400).json({ error: 'Title and link are required' });
    }
    const posts = getPosts();
    const newPost = {
        id: id || ('post_' + Date.now()),
        title: title.trim(),
        summary: (summary || '').trim(),
        link: link.trim(),
        imageUrl: imageUrl || '',
        platform: platform || detectPlatform(link),
        author: author || 'AI Foundation Australia',
        date: req.body.date || new Date().toISOString()
    };
    const idx = posts.findIndex(p => p.id === newPost.id || (p.link && p.link === newPost.link));
    if (idx >= 0) {
        posts[idx] = newPost;
    } else {
        posts.unshift(newPost);
    }
    savePosts(posts);

    // Only write to Firestore if not already synchronized directly by client
    if (!firestoreSynced) {
        try {
            await firebaseService.writeDocument('content', newPost.id, {
                ...newPost,
                category: 'articles',
                tag: 'aifoundation',
                businessId: 'aifoundation'
            }, true);
        } catch (e) {
            console.warn('[Firebase] Warning writing post to firestore:', e.message);
        }
    }

    res.json({ success: true, post: newPost });
});

// DELETE post
app.delete('/api/posts/:id', requireAdmin, async (req, res) => {
    let posts = getPosts();
    posts = posts.filter(p => p.id !== req.params.id);
    savePosts(posts);
    try {
        await firebaseService.deleteDocument('content', req.params.id);
    } catch (e) {}
    res.json({ success: true });
});

// COMMUNITY API
app.get('/api/community', (req, res) => {
    const posts = getCommunityPosts();
    res.json(posts.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/community', requireAdmin, async (req, res) => {
    const { title, summary, link, imageUrl, imageBase64, imageBackupUrl, platform, id, firestoreSynced } = req.body;
    const images = await withImgBBBackup(imageUrl || imageBase64 || '', imageBackupUrl);
    const posts = getCommunityPosts();
    const newPost = {
        id: id || ('comm_' + Date.now()),
        title: title || 'Untitled',
        summary: summary || '',
        platform: platform || 'linkedin',
        link: link || '',
        imageUrl: images.imageUrl,
        imageBackupUrl: images.imageBackupUrl,
        date: req.body.date || new Date().toISOString()
    };
    const idx = posts.findIndex(p => p.id === newPost.id || (p.link && p.link === newPost.link));
    if (idx >= 0) {
        posts[idx] = newPost;
    } else {
        posts.unshift(newPost);
    }
    saveCommunityPosts(posts);

    if (!firestoreSynced) {
        try {
            await firebaseService.writeDocument('content', newPost.id, {
                ...newPost,
                category: 'community',
                tag: 'aifoundation',
                businessId: 'aifoundation'
            }, true);
        } catch (e) {
            console.warn('[Firebase] Warning writing community to firestore:', e.message);
        }
    }

    res.json({ success: true, post: newPost });
});

app.delete('/api/community/:id', requireAdmin, async (req, res) => {
    let posts = getCommunityPosts();
    posts = posts.filter(p => p.id !== req.params.id);
    saveCommunityPosts(posts);
    try {
        await firebaseService.deleteDocument('content', req.params.id);
    } catch (e) {}
    res.json({ success: true });
});

// TECH API (original thumbnails shown, ImgBB backup copies kept)
app.get('/api/tech', (req, res) => {
    const posts = getTechPosts();
    res.json(posts.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/tech', requireAdmin, async (req, res) => {
    const { title, summary, link, imageUrl, imageBase64, imageBackupUrl, platform, id, firestoreSynced } = req.body;
    const images = await withImgBBBackup(imageUrl || imageBase64 || '', imageBackupUrl);
    const posts = getTechPosts();
    const newPost = {
        id: id || ('tech_' + Date.now()),
        title: title || 'Untitled',
        summary: summary || '',
        platform: platform || 'linkedin',
        link: link || '',
        imageUrl: images.imageUrl,
        imageBackupUrl: images.imageBackupUrl,
        date: req.body.date || new Date().toISOString()
    };
    const idx = posts.findIndex(p => p.id === newPost.id || (p.link && p.link === newPost.link));
    if (idx >= 0) {
        posts[idx] = newPost;
    } else {
        posts.unshift(newPost);
    }
    saveTechPosts(posts);

    if (!firestoreSynced) {
        try {
            await firebaseService.writeDocument('content', newPost.id, {
                ...newPost,
                category: 'tech',
                tag: 'aifoundation',
                businessId: 'aifoundation'
            }, true);
        } catch (e) {
            console.warn('[Firebase] Warning writing tech to firestore:', e.message);
        }
    }

    res.json({ success: true, post: newPost });
});

app.delete('/api/tech/:id', requireAdmin, async (req, res) => {
    let posts = getTechPosts();
    posts = posts.filter(p => p.id !== req.params.id);
    saveTechPosts(posts);
    try {
        await firebaseService.deleteDocument('content', req.params.id);
    } catch (e) {}
    res.json({ success: true });
});

// PROJECTS API (original thumbnails shown, ImgBB backup copies kept)
app.get('/api/projects', (req, res) => {
    const projects = getProjects();
    res.json(projects.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)));
});

app.post('/api/projects', requireAdmin, async (req, res) => {
    const { title, summary, link, imageUrl, imageBase64, imageBackupUrl, platform, author, id, firestoreSynced } = req.body;
    if (!title || !link) {
        return res.status(400).json({ error: 'Title and link are required' });
    }
    const images = await withImgBBBackup(imageUrl || imageBase64 || 'assets/logo.png', imageBackupUrl);
    const projects = getProjects();
    const newProject = {
        id: id || ('proj_' + Date.now()),
        title: title.trim(),
        summary: (summary || '').trim(),
        link: link.trim(),
        imageUrl: images.imageUrl,
        imageBackupUrl: images.imageBackupUrl,
        platform: platform || detectPlatform(link),
        author: author || 'AI Foundation Australia',
        date: req.body.date || new Date().toISOString()
    };
    const idx = projects.findIndex(p => p.id === newProject.id || (p.link && p.link === newProject.link));
    if (idx >= 0) {
        projects[idx] = newProject;
    } else {
        projects.unshift(newProject);
    }
    saveProjects(projects);

    // Only write to Firestore if not already synchronized directly by client
    if (!firestoreSynced) {
        try {
            await firebaseService.writeDocument('content', newProject.id, {
                ...newProject,
                category: 'projects',
                tag: 'aifoundation',
                businessId: 'aifoundation'
            }, true);
        } catch (e) {
            console.warn('[Firebase] Warning writing project to firestore:', e.message);
        }
    }

    res.json({ success: true, project: newProject });
});

app.delete('/api/projects/:id', requireAdmin, async (req, res) => {
    let projects = getProjects();
    projects = projects.filter(p => p.id !== req.params.id);
    saveProjects(projects);
    try {
        await firebaseService.deleteDocument('content', req.params.id);
    } catch (e) {}
    res.json({ success: true });
});

// SERVICE PRICES API (Services 2)
// Admins enter prices in USD and AUD; the browser shows AUD to visitors in Australia and USD to everyone else
// (rule in public/service-pricing.js). Visitor's country from Vercel's IP geolocation, '' when unknown (local)
function visitorCountry(req) {
    const code = String(req.headers['x-vercel-ip-country'] || '').trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : '';
}

app.get('/api/services/prices', async (req, res) => {
    try {
        const saved = await servicePrices.read();
        // The answer depends on the visitor's country, so it must never be cached and shared
        res.setHeader('Cache-Control', 'private, no-store');
        res.json({ country: visitorCountry(req), prices: saved.prices, updatedAt: saved.updatedAt });
    } catch (e) {
        console.error('[Service Prices] Read error:', e);
        sendServerError(res, e);
    }
});

// Replaces every price (blank boxes are saved as null)
app.put('/api/services/prices', requireAdmin, async (req, res) => {
    const input = req.body && req.body.prices;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return res.status(400).json({ error: 'prices is required.' });
    }
    const { prices, errors } = servicePricing.cleanPrices(input);
    if (errors.length) {
        return res.status(400).json({ error: errors[0].message, errors });
    }
    try {
        const saved = await servicePrices.save(prices, req.user.email);
        if (!saved.firestore && !saved.file) {
            return res.status(503).json({ error: 'The database could not be reached, so the prices were not saved. Please try again.' });
        }
        res.json({ success: true, prices, updatedAt: saved.updatedAt, savedToDatabase: saved.firestore });
    } catch (e) {
        console.error('[Service Prices] Save error:', e);
        sendServerError(res, e);
    }
});

// PROJECTS PAGE ROUTE
app.get('/projects', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'projects.html'));
});

// SERVICES PAGE ROUTE (not reached while the redirect above express.static hides the original page)
app.get('/services', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'services.html'));
});

// RAW DATA CONTRACTS MARKDOWN ROUTE
app.get('/data-contracts.md', (req, res) => {
    res.sendFile(path.join(__dirname, 'data-contracts.md'));
});

app.post('/api/extract-metadata', requireAdmin, async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    
    let fetchUrl = url;
    if (fetchUrl.includes('x.com/') || fetchUrl.includes('twitter.com/')) {
        fetchUrl = fetchUrl.replace('x.com', 'fxtwitter.com').replace('twitter.com', 'fxtwitter.com');
    }

    try {
        const fetchRes = await fetch(fetchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            redirect: 'follow'
        });
        
        const html = await fetchRes.text();
        
        let title = '';
        const ogTitle = html.match(/<meta\s+(?:property|name)=["']og:title["']\s+content=["'](.*?)["']/i);
        if (ogTitle) title = ogTitle[1];
        else {
            const tMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            title = tMatch ? tMatch[1] : '';
        }
        
        let imageUrl = '';
        const ogImg = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["'](.*?)["']/i) ||
            html.match(/<meta\s+(?:property|name)=["']twitter:image["']\s+content=["'](.*?)["']/i);
        if (ogImg) imageUrl = ogImg[1];
        
        let summary = '';
        const ogDesc = html.match(/<meta\s+(?:property|name)=["']og:description["']\s+content=["'](.*?)["']/i) ||
                       html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
        if (ogDesc) summary = ogDesc[1];

        // Remove HTML entities
        summary = summary.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
        title = title.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
        // og:image URLs carry "&amp;" as well; LinkedIn's CDN returns 403 unless they are plain "&"
        imageUrl = imageUrl.replace(/&(?:amp|#0*38|#x0*26);/gi, '&');
        
        res.json({
            title: title || 'Update from link',
            summary: summary || '',
            imageUrl: imageUrl,
            platform: detectPlatform(url),
            link: url
        });
    } catch (e) {
        res.json({
            title: 'Update from link',
            summary: '',
            imageUrl: '',
            platform: detectPlatform(url),
            link: url
        });
    }
});

// PROXY Upload to ImgBB (https://api.imgbb.com/1/upload)
app.post('/api/upload-imgbb', requireAdmin, async (req, res) => {
    const { imageBase64, imageUrl, apiKey, name } = req.body;
    const finalKey = apiKey || process.env.IMGBB_API_KEY;
    if (!finalKey) {
        return res.status(500).json({ error: 'IMGBB_API_KEY is not configured in .env' });
    }
    try {
        const imagePayload = imageBase64 || imageUrl;
        if (!imagePayload) {
            return res.status(400).json({ error: 'No image provided (imageBase64 or imageUrl required)' });
        }
        const formData = new FormData();
        const clean = imagePayload.replace(/^data:image\/\w+;base64,/, '');
        formData.append('image', clean);
        if (name) {
            formData.append('name', name);
        }

        const fetchRes = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(finalKey)}`, {
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: formData
        });
        const data = await fetchRes.json();
        if (data.success && data.data) {
            res.json({ success: true, url: data.data.url, display_url: data.data.display_url, data: data.data });
        } else {
            res.status(400).json({ error: data.error?.message || 'ImgBB upload failed', details: data });
        }
    } catch (e) {
        console.error('Upload ImgBB Error:', e);
        sendServerError(res, e);
    }
});

// Stripe Checkout Session Creation
app.post('/api/stripe/create-checkout-session', async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) {
            return res.status(500).json({ error: 'Stripe is not configured on the server.' });
        }
        let { amount, returnPath } = req.body;
        amount = parseDonationAmount(amount);
        if (!amount) {
            return res.status(400).json({ error: `Invalid donation amount. Please enter a whole number from AUD $${MIN_DONATION_AUD} to AUD $${MAX_DONATION_AUD.toLocaleString('en-AU')}.` });
        }

        const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
        const basePath = (returnPath && returnPath.startsWith('/')) ? returnPath : '/';
        const session = await stripe.checkout.sessions.create({
            line_items: [{
                price_data: {
                    currency: 'aud',
                    product_data: {
                        name: 'Support AI Foundation Australia',
                        description: `Contribution of AUD $${amount}`
                    },
                    unit_amount: amount * 100
                },
                quantity: 1
            }],
            mode: 'payment',
            metadata: {
                tag: 'aifoundation',
                businessId: 'aifoundation',
                businessName: 'AI Foundation',
                source: 'aifoundation',
                amount: String(amount)
            },
            payment_intent_data: {
                metadata: {
                    tag: 'aifoundation',
                    businessId: 'aifoundation',
                    businessName: 'AI Foundation',
                    source: 'aifoundation',
                    amount: String(amount)
                }
            },
            success_url: `${origin}${basePath}?donation=stripe_success&amt=${amount}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}${basePath}?donation=cancelled`
        });

        // Record initiated transaction in Firestore with tag 'aifoundation'
        try {
            await firebaseService.recordTransaction({
                transactionId: session.id,
                amount: amount,
                currency: 'aud',
                paymentMethod: 'stripe',
                paymentType: 'donation',
                status: 'initiated',
                description: `Support AI Foundation Australia (AUD $${amount})`,
                originUrl: `${origin}${basePath}`,
                metadata: {
                    checkoutUrl: session.url
                }
            });
        } catch (fbErr) {
            console.warn('[Firebase] Warning recording checkout session:', fbErr.message);
        }

        res.json({ url: session.url, sessionId: session.id });
    } catch (e) {
        console.error('Stripe Checkout Error:', e);
        sendServerError(res, e, 'Error creating Stripe session');
    }
});

// Helper for PayPal OAuth Token
async function getPayPalAccessToken() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    const mode = process.env.PAYPAL_MODE || 'sandbox';
    const baseUrl = mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    const data = await res.json();
    return { token: data.access_token, baseUrl };
}

// PayPal Order Creation
app.post('/api/paypal/create-order', async (req, res) => {
    try {
        let { amount } = req.body;
        amount = parseDonationAmount(amount);
        if (!amount) {
            return res.status(400).json({ error: `Invalid donation amount. Please enter a whole number from AUD $${MIN_DONATION_AUD} to AUD $${MAX_DONATION_AUD.toLocaleString('en-AU')}.` });
        }

        const pp = await getPayPalAccessToken();
        if (!pp || !pp.token) {
            return res.status(500).json({ error: 'PayPal credentials are not configured.' });
        }

        const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
        const orderRes = await fetch(`${pp.baseUrl}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pp.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                intent: 'CAPTURE',
                purchase_units: [{
                    custom_id: 'aifoundation',
                    invoice_id: `AIF-${Date.now()}`,
                    amount: {
                        currency_code: 'AUD',
                        value: amount.toFixed(2)
                    },
                    description: `Support AI Foundation Australia (AUD $${amount}) [tag: aifoundation]`
                }],
                application_context: {
                    brand_name: 'AI Foundation Australia',
                    return_url: `${origin}/?donation=paypal_success&amt=${amount}`,
                    cancel_url: `${origin}/?donation=cancelled`
                }
            })
        });

        const orderData = await orderRes.json();
        const approveLink = orderData.links && orderData.links.find(l => l.rel === 'approve');
        if (approveLink) {
            // Record initiated transaction in Firestore with tag 'aifoundation'
            try {
                await firebaseService.recordTransaction({
                    transactionId: orderData.id,
                    amount: amount,
                    currency: 'aud',
                    paymentMethod: 'paypal',
                    paymentType: 'donation',
                    status: 'initiated',
                    description: `Support AI Foundation Australia (AUD $${amount})`
                });
            } catch (fbErr) {
                console.warn('[Firebase] Warning recording paypal order:', fbErr.message);
            }
            res.json({ url: approveLink.href, orderId: orderData.id });
        } else {
            res.status(400).json({ error: 'Could not create PayPal checkout order.', details: orderData });
        }
    } catch (e) {
        console.error('PayPal Order Error:', e);
        sendServerError(res, e, 'Error creating PayPal order');
    }
});

// Capture PayPal Order
app.post('/api/paypal/capture-order/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const pp = await getPayPalAccessToken();
        if (!pp || !pp.token) {
            return res.status(500).json({ error: 'PayPal credentials not configured.' });
        }

        const captureRes = await fetch(`${pp.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pp.token}`,
                'Content-Type': 'application/json'
            }
        });
        const captureData = await captureRes.json();

        // Update transaction in Firestore with tag 'aifoundation'
        try {
            const isCompleted = captureData.status === 'COMPLETED';
            await firebaseService.updateTransactionStatus(orderId, isCompleted ? 'succeeded' : 'failed', {
                paymentMethod: 'paypal',
                tag: 'aifoundation',
                captureId: captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id || ''
            });
        } catch (fbErr) {
            console.warn('[Firebase] Warning updating paypal capture:', fbErr.message);
        }

        res.json(captureData);
    } catch (e) {
        console.error('PayPal Capture Error:', e);
        sendServerError(res, e);
    }
});

// Stripe PaymentIntent for in-page popup modal
app.post('/api/stripe/create-payment-intent', async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) {
            return res.status(500).json({ error: 'Stripe is not configured on the server.' });
        }
        let { amount } = req.body;
        amount = parseDonationAmount(amount);
        if (!amount) {
            return res.status(400).json({ error: `Invalid donation amount. Please enter a whole number from AUD $${MIN_DONATION_AUD} to AUD $${MAX_DONATION_AUD.toLocaleString('en-AU')}.` });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100,
            currency: 'aud',
            automatic_payment_methods: { enabled: true },
            description: `Donation to AI Foundation Australia (AUD $${amount})`,
            metadata: {
                tag: 'aifoundation',
                businessId: 'aifoundation',
                businessName: 'AI Foundation',
                source: 'aifoundation',
                amount: String(amount)
            }
        });

        // Record initiated transaction in Firestore with tag 'aifoundation'
        try {
            await firebaseService.recordTransaction({
                transactionId: paymentIntent.id,
                amount: amount,
                currency: 'aud',
                paymentMethod: 'stripe',
                paymentType: 'donation',
                status: 'initiated',
                description: `Donation to AI Foundation Australia (AUD $${amount})`
            });
        } catch (fbErr) {
            console.warn('[Firebase] Warning recording payment intent:', fbErr.message);
        }

        res.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
        });
    } catch (e) {
        console.error('Stripe PaymentIntent Error:', e);
        sendServerError(res, e, 'Error creating payment intent');
    }
});

// Look up a payment with the provider so status/amount never come from the browser
async function fetchVerifiedPayment(transactionId) {
    if (/^(pi|cs)_[A-Za-z0-9_]+$/.test(transactionId)) {
        const stripe = getStripe();
        if (!stripe) throw new Error('Stripe is not configured on the server.');
        if (transactionId.startsWith('cs_')) {
            const session = await stripe.checkout.sessions.retrieve(transactionId);
            return {
                paymentMethod: 'stripe',
                status: session.payment_status === 'paid' ? 'succeeded' : (session.status === 'expired' ? 'failed' : 'pending'),
                amount: (session.amount_total || 0) / 100,
                providerEmail: session.customer_details?.email || '',
                providerName: session.customer_details?.name || ''
            };
        }
        const intent = await stripe.paymentIntents.retrieve(transactionId);
        return {
            paymentMethod: 'stripe',
            status: intent.status === 'succeeded' ? 'succeeded' : (intent.status === 'canceled' ? 'failed' : 'pending'),
            amount: (intent.amount_received || intent.amount || 0) / 100,
            providerEmail: intent.receipt_email || '',
            providerName: ''
        };
    }
    if (/^[A-Z0-9]{10,30}$/.test(transactionId)) {
        const pp = await getPayPalAccessToken();
        if (!pp || !pp.token) throw new Error('PayPal credentials not configured.');
        const orderRes = await fetch(`${pp.baseUrl}/v2/checkout/orders/${transactionId}`, {
            headers: { 'Authorization': `Bearer ${pp.token}` }
        });
        if (!orderRes.ok) return null;
        const order = await orderRes.json();
        return {
            paymentMethod: 'paypal',
            status: order.status === 'COMPLETED' ? 'succeeded' : (order.status === 'VOIDED' ? 'failed' : 'pending'),
            amount: Number(order.purchase_units?.[0]?.amount?.value || 0),
            providerEmail: order.payer?.email_address || '',
            providerName: [order.payer?.name?.given_name, order.payer?.name?.surname].filter(Boolean).join(' ')
        };
    }
    return null;
}

// Confirm or sync a transaction with tag 'aifoundation'
// Status and amount are verified with Stripe / PayPal; donor identity comes from the ID token or the provider
app.post('/api/transactions/confirm', async (req, res) => {
    try {
        const transactionId = String(req.body.transactionId || '').trim();
        if (!transactionId) {
            return res.status(400).json({ error: 'transactionId is required' });
        }

        let verified;
        try {
            verified = await fetchVerifiedPayment(transactionId);
        } catch (lookupErr) {
            console.warn('[Transactions] Provider lookup failed:', lookupErr.message);
            return res.status(404).json({ error: 'Transaction not found.' });
        }
        if (!verified) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        const result = await firebaseService.updateTransactionStatus(transactionId, verified.status, {
            paymentMethod: verified.paymentMethod,
            tag: 'aifoundation',
            amount: verified.amount,
            customerEmail: req.user?.email || verified.providerEmail,
            customerName: req.user?.name || verified.providerName,
            userId: req.user?.uid || ''
        });
        res.json({ success: true, status: verified.status, amount: verified.amount, recorded: Boolean(result.success) });
    } catch (e) {
        console.error('[Transactions] Confirm error:', e);
        res.status(500).json({ error: 'Could not confirm transaction.' });
    }
});

// Record a transaction directly into Firestore with tag 'aifoundation'
app.post('/api/transactions/record', requireAdmin, async (req, res) => {
    try {
        const txData = req.body;
        txData.tag = 'aifoundation';
        txData.businessId = 'aifoundation';
        const result = await firebaseService.recordTransaction(txData);
        res.json({ success: true, result });
    } catch (e) {
        console.error('[Transactions] Record error:', e);
        sendServerError(res, e);
    }
});

// Fetch recent transactions tagged with 'aifoundation'
app.get('/api/transactions', requireAdmin, async (req, res) => {
    try {
        const list = await firebaseService.listAIFoundationTransactions(50);
        res.json({ count: list.length, tag: 'aifoundation', transactions: list });
    } catch (e) {
        console.error('[Transactions] Query error:', e);
        sendServerError(res, e);
    }
});

// Expose safe public Firebase config for frontend clients
app.get('/api/firebase/config', (req, res) => {
    res.json(firebaseService.getFirebasePublicConfig());
});

// Synchronize Firebase Google Auth user profile with tag 'aifoundation'
app.post('/api/auth/sync', requireAuth, async (req, res) => {
    try {
        // Identity comes from the verified ID token; role/status in the body are ignored
        const { displayName, photoURL, phoneNumber, address, detailsRegistered, registeredAt } = req.body;
        const normalizedEmail = req.user.email;
        const normUid = req.user.uid;

        // Verify superadmin status strictly: ONLY ZK79FRQoVlYhsgvMibhi81dRUWj2 and L5euSJAfNKdDOX6mT0qmrCGjUA53
        const isSuperAdmin = firebaseService.isSuperAdminUser(normUid, req.user.emailVerified ? normalizedEmail : '');
        const isAdmin = isSuperAdmin || req.user.isAdmin;

        // These two are the ONLY superadmin allowed; everyone else is admin or supporter
        const assignedRole = isSuperAdmin ? 'superadmin' : (isAdmin ? 'admin' : 'supporter');
        const assignedStatus = isSuperAdmin ? 'superadmin' : (isAdmin ? 'admin' : 'supporter');

        const result = await firebaseService.syncUser({
            uid: normUid,
            email: normalizedEmail,
            displayName,
            photoURL,
            phoneNumber,
            address,
            role: assignedRole,
            status: assignedStatus,
            detailsRegistered,
            registeredAt
        });
        res.json({ success: true, user: result.user, isAdmin, isSuperAdmin });
    } catch (e) {
        console.error('[Auth Sync] Error:', e);
        sendServerError(res, e);
    }
});

// Retrieve user profile by UID
app.get('/api/users/:uid', requireAuth, async (req, res) => {
    try {
        if (req.params.uid !== req.user.uid && !req.user.isAdmin) {
            return res.status(403).json({ error: 'You can only view your own profile.' });
        }
        const user = await firebaseService.getUser(req.params.uid);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (e) {
        console.error('[User Fetch] Error:', e);
        sendServerError(res, e);
    }
});

// Verify if a Google Auth user is authorized as a SuperAdmin in Firebase
app.post('/api/auth/admin-verify', requireAuth, async (req, res) => {
    try {
        const normalizedEmail = req.user.email;
        // SuperAdmin authorization strictly verified from the ID token
        const isAuthorized = req.user.isAdmin;

        res.json({
            authorized: isAuthorized,
            email: normalizedEmail,
            role: isAuthorized ? 'superadmin' : 'supporter',
            status: isAuthorized ? 'superadmin' : 'supporter',
            isSuperAdmin: isAuthorized
        });
    } catch (e) {
        console.error('[Admin Verify] Error:', e);
        sendServerError(res, e);
    }
});

// Fast check if a user is listed as a SuperAdmin in Firebase
app.get('/api/auth/admin-check', requireAuth, async (req, res) => {
    try {
        const email = req.user.email;
        const isAdmin = req.user.isAdmin;
        res.json({ email, isAdmin, isSuperAdmin: isAdmin });
    } catch (e) {
        console.error('[Admin Check] Error:', e);
        sendServerError(res, e);
    }
});

// Retrieve recent inputs from the whole multi-tenant database (Admin only)
app.get('/api/admin/database-inputs', requireAdmin, async (req, res) => {
    try {
        const { tenant = 'all', collection = 'all', limit = 50 } = req.query;
        const result = await firebaseService.getDatabaseRecentInputs({
            tenant,
            collection,
            limit: Number(limit) || 50
        });
        res.json(result);
    } catch (e) {
        console.error('[Admin DB Inputs] Error:', e);
        sendServerError(res, e);
    }
});

// ==========================================
// SUPPORTER CHAT (Behind Login Panel)
// Compliance: 7-Year Retention, No Uploads, Links Supported
// ==========================================

// Send a chat message (Supporter to SuperAdmin, or SuperAdmin reply)
app.post('/api/chat/send', requireAuth, async (req, res) => {
    try {
        let {
            recipientUid,
            recipientEmail,
            recipientName,
            conversationId,
            userMessage,
            message,
            hasUploads
        } = req.body;

        // Strict rejection: uploads are not allowed
        if (hasUploads || req.body.file || req.body.attachment || req.body.files) {
            return res.status(400).json({ error: 'File uploads are not permitted. Only text and web links are allowed.' });
        }

        const msgText = (userMessage || message || '').trim();
        if (!msgText) {
            return res.status(400).json({ error: 'Message cannot be empty.' });
        }

        // Sender identity always comes from the verified ID token
        const senderUid = req.user.uid;
        const senderEmail = req.user.email;
        const senderName = req.user.name || req.body.senderName || '';
        const senderPhoto = req.user.picture || '';
        const senderRole = req.user.isSuperAdmin ? 'superadmin' : 'supporter';

        // Anyone signed in (supporters and site admins alike) messages the SuperAdmin in their own conversation.
        // Only the two SuperAdmins reply into other people's conversations, and only this site's ones
        // (other apps' threads are read in the Message Box and answered in their own app)
        if (!req.user.isSuperAdmin) {
            recipientUid = 'superadmin';
            recipientEmail = 'support@aifoundation.net.au';
            recipientName = 'SuperAdmin';
            conversationId = `conv_${senderUid}`;
        } else if (!/^conv_[A-Za-z0-9_-]+$/.test(String(conversationId || ''))) {
            return res.status(400).json({ error: 'Replies can only be sent to AI Foundation conversations.' });
        }

        const result = await firebaseService.sendChatMessage({
            senderUid,
            senderEmail,
            senderName,
            senderPhoto,
            senderRole,
            recipientUid: recipientUid || 'superadmin',
            recipientEmail: recipientEmail || 'support@aifoundation.net.au',
            recipientName: recipientName || 'SuperAdmin',
            conversationId: conversationId || `conv_${senderUid}`,
            userMessage: msgText,
            // Messages written by this site always carry its own tenant tag (data-contracts.md, Invariant Rule 1),
            // whatever the request says, so the Message Box shows where each message really came from
            tag: 'aifoundation',
            businessId: 'aifoundation',
            businessName: 'AI Foundation',
            source: 'aifoundation'
        });

        if (!result.success) {
            return res.status(500).json({ error: result.error || 'Failed to record chat message in Firebase.' });
        }

        res.json({
            success: true,
            message: result.message,
            retentionYears: 7,
            retainedUntil: result.message.retainedUntil
        });
    } catch (e) {
        console.error('[Chat Send] Error:', e);
        sendServerError(res, e);
    }
});

// Retrieve message history for a conversation
app.get('/api/chat/messages', requireAuth, async (req, res) => {
    try {
        const { conversationId, limit = 100 } = req.query;
        const uid = req.user.uid;
        const email = req.user.email;
        // Only the two SuperAdmins read other people's conversations and see tenant tags (Invariant 9.2)
        const isSuperAdmin = req.user.isSuperAdmin;

        // Supporters may only read their own conversation
        const convId = isSuperAdmin ? (conversationId || `conv_${uid}`) : `conv_${uid}`;

        const messages = await firebaseService.getChatMessages(convId, { 
            limit: Number(limit) || 100,
            isSuperAdmin: isSuperAdmin,
            requesterUid: uid,
            requesterEmail: email
        });

        res.json({
            success: true,
            conversationId: convId,
            count: messages.length,
            isSuperAdmin: isSuperAdmin,
            messages: messages,
            retentionPolicy: '7-Year Statutory Record Retention (Corporations Act 2001 & APP 11)'
        });
    } catch (e) {
        console.error('[Chat Messages Fetch] Error:', e);
        sendServerError(res, e);
    }
});

// MESSAGE BOX: every conversation with the SuperAdmin from all tenant apps, each tagged with its tenant
// (message-box.js). SuperAdmin only, because it spans every app's users (data-contracts.md, Invariants 9.1-9.2)
app.get('/api/message-box', requireSuperAdmin, async (req, res) => {
    try {
        const box = await loadMessageBox();
        res.setHeader('Cache-Control', 'private, no-store');
        if (!box) {
            return res.status(503).json({ error: 'The message database could not be reached. Please try again.' });
        }
        res.json(box);
    } catch (e) {
        console.error('[Message Box] Error:', e);
        sendServerError(res, e);
    }
});

// Retrieve list of supporter conversations (Admin / SuperAdmin inbox across all tenants)
app.get('/api/chat/conversations', requireSuperAdmin, async (req, res) => {
    try {
        const conversations = await firebaseService.getChatConversations();
        res.json({
            success: true,
            count: conversations.length,
            conversations: conversations
        });
    } catch (e) {
        console.error('[Chat Conversations Fetch] Error:', e);
        sendServerError(res, e);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Foundation website running on http://localhost:${PORT}`);
});