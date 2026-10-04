require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const Stripe = require('stripe');

const app = express();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'posts.json');
const COMM_DATA_FILE = path.join(__dirname, 'data', 'community.json');
const TECH_DATA_FILE = path.join(__dirname, 'data', 'tech.json');
const PROJECTS_DATA_FILE = path.join(__dirname, 'data', 'projects.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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

function savePosts(posts) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
}

function getCommunityPosts() {
    try {
        return JSON.parse(fs.readFileSync(COMM_DATA_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveCommunityPosts(posts) {
    fs.writeFileSync(COMM_DATA_FILE, JSON.stringify(posts, null, 2));
}

function getTechPosts() {
    try {
        return JSON.parse(fs.readFileSync(TECH_DATA_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveTechPosts(posts) {
    fs.writeFileSync(TECH_DATA_FILE, JSON.stringify(posts, null, 2));
}

function getProjects() {
    try {
        return JSON.parse(fs.readFileSync(PROJECTS_DATA_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveProjects(projects) {
    fs.writeFileSync(PROJECTS_DATA_FILE, JSON.stringify(projects, null, 2));
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

    const apiKey = process.env.IMGBB_API_KEY || '6d7007353630f7eaf44016384dd9761e';
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
    res.json(getPosts());
});

// CREATE new post
app.post('/api/posts', (req, res) => {
    const { title, summary, link, imageUrl, platform, author } = req.body;
    if (!title || !link) {
        return res.status(400).json({ error: 'Title and link are required' });
    }
    const posts = getPosts();
    const newPost = {
        id: 'post_' + Date.now(),
        title: title.trim(),
        summary: (summary || '').trim(),
        link: link.trim(),
        imageUrl: imageUrl || '',
        platform: platform || detectPlatform(link),
        author: author || 'AI Foundation Australia',
        date: new Date().toISOString()
    };
    posts.unshift(newPost);
    savePosts(posts);
    res.json({ success: true, post: newPost });
});

// DELETE post
app.delete('/api/posts/:id', (req, res) => {
    let posts = getPosts();
    posts = posts.filter(p => p.id !== req.params.id);
    savePosts(posts);
    res.json({ success: true });
});

// COMMUNITY API
app.get('/api/community', (req, res) => {
    const posts = getCommunityPosts();
    res.json(posts.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/community', async (req, res) => {
    let imgUrl = req.body.imageUrl || req.body.imageBase64 || '';
    if (imgUrl) {
        imgUrl = await uploadToImgBB(imgUrl);
    }
    const posts = getCommunityPosts();
    const newPost = {
        id: 'comm_' + Date.now(),
        title: req.body.title || 'Untitled',
        summary: req.body.summary || '',
        platform: req.body.platform || 'linkedin',
        link: req.body.link || '',
        imageUrl: imgUrl,
        date: new Date().toISOString()
    };
    posts.unshift(newPost);
    saveCommunityPosts(posts);
    res.json({ success: true, post: newPost });
});

app.delete('/api/community/:id', (req, res) => {
    let posts = getCommunityPosts();
    posts = posts.filter(p => p.id !== req.params.id);
    saveCommunityPosts(posts);
    res.json({ success: true });
});

// TECH API (Images uploaded to ImgBB)
app.get('/api/tech', (req, res) => {
    const posts = getTechPosts();
    res.json(posts.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/tech', async (req, res) => {
    let imgUrl = req.body.imageUrl || req.body.imageBase64 || '';
    if (imgUrl) {
        imgUrl = await uploadToImgBB(imgUrl);
    }
    const posts = getTechPosts();
    const newPost = {
        id: 'tech_' + Date.now(),
        title: req.body.title || 'Untitled',
        summary: req.body.summary || '',
        platform: req.body.platform || 'linkedin',
        link: req.body.link || '',
        imageUrl: imgUrl,
        date: new Date().toISOString()
    };
    posts.unshift(newPost);
    saveTechPosts(posts);
    res.json({ success: true, post: newPost });
});

app.delete('/api/tech/:id', (req, res) => {
    let posts = getTechPosts();
    posts = posts.filter(p => p.id !== req.params.id);
    saveTechPosts(posts);
    res.json({ success: true });
});

// PROJECTS API (Images uploaded to ImgBB)
app.get('/api/projects', (req, res) => {
    const projects = getProjects();
    res.json(projects.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/projects', async (req, res) => {
    const { title, summary, link, imageUrl, imageBase64, platform, author } = req.body;
    if (!title || !link) {
        return res.status(400).json({ error: 'Title and link are required' });
    }
    let imgUrl = imageUrl || imageBase64 || 'assets/logo.png';
    if (imgUrl && imgUrl !== 'assets/logo.png') {
        imgUrl = await uploadToImgBB(imgUrl);
    }
    const projects = getProjects();
    const newProject = {
        id: 'proj_' + Date.now(),
        title: title.trim(),
        summary: (summary || '').trim(),
        link: link.trim(),
        imageUrl: imgUrl,
        platform: platform || detectPlatform(link),
        author: author || 'AI Foundation Australia',
        date: new Date().toISOString()
    };
    projects.unshift(newProject);
    saveProjects(projects);
    res.json({ success: true, project: newProject });
});

app.delete('/api/projects/:id', (req, res) => {
    let projects = getProjects();
    projects = projects.filter(p => p.id !== req.params.id);
    saveProjects(projects);
    res.json({ success: true });
});

// PROJECTS PAGE ROUTE
app.get('/projects', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'projects.html'));
});

app.post('/api/extract-metadata', async (req, res) => {
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
app.post('/api/upload-imgbb', async (req, res) => {
    const { imageBase64, imageUrl, apiKey } = req.body;
    const finalKey = apiKey || process.env.IMGBB_API_KEY || '6d7007353630f7eaf44016384dd9761e';
    try {
        const imagePayload = imageBase64 || imageUrl;
        if (!imagePayload) {
            return res.status(400).json({ error: 'No image provided (imageBase64 or imageUrl required)' });
        }
        const formData = new FormData();
        const clean = imagePayload.replace(/^data:image\/\w+;base64,/, '');
        formData.append('image', clean);

        const fetchRes = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(finalKey)}`, {
            method: 'POST',
            body: formData
        });
        const data = await fetchRes.json();
        if (data.success && data.data) {
            res.json({ success: true, url: data.data.url, data: data.data });
        } else {
            res.status(400).json({ error: data.error?.message || 'ImgBB upload failed', details: data });
        }
    } catch (e) {
        console.error('Upload ImgBB Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Stripe Checkout Session Creation
app.post('/api/stripe/create-checkout-session', async (req, res) => {
    try {
        if (!stripe) {
            return res.status(500).json({ error: 'Stripe is not configured on the server.' });
        }
        let { amount, returnPath } = req.body;
        amount = parseInt(amount, 10);
        if (!amount || isNaN(amount) || amount < 1) {
            return res.status(400).json({ error: 'Invalid donation amount. Please enter a whole number of at least AUD $1.' });
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
            success_url: `${origin}${basePath}?donation=stripe_success&amt=${amount}`,
            cancel_url: `${origin}${basePath}?donation=cancelled`
        });

        res.json({ url: session.url });
    } catch (e) {
        console.error('Stripe Checkout Error:', e);
        res.status(500).json({ error: e.message || 'Error creating Stripe session' });
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
        amount = parseInt(amount, 10);
        if (!amount || isNaN(amount) || amount < 1) {
            return res.status(400).json({ error: 'Invalid donation amount. Please enter a whole number of at least AUD $1.' });
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
                    amount: {
                        currency_code: 'AUD',
                        value: amount.toFixed(2)
                    },
                    description: `Support AI Foundation Australia (AUD $${amount})`
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
            res.json({ url: approveLink.href, orderId: orderData.id });
        } else {
            res.status(400).json({ error: 'Could not create PayPal checkout order.', details: orderData });
        }
    } catch (e) {
        console.error('PayPal Order Error:', e);
        res.status(500).json({ error: e.message || 'Error creating PayPal order' });
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
        res.json(captureData);
    } catch (e) {
        console.error('PayPal Capture Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Stripe PaymentIntent for in-page popup modal
app.post('/api/stripe/create-payment-intent', async (req, res) => {
    try {
        if (!stripe) {
            return res.status(500).json({ error: 'Stripe is not configured on the server.' });
        }
        let { amount } = req.body;
        amount = parseInt(amount, 10);
        if (!amount || isNaN(amount) || amount < 1) {
            return res.status(400).json({ error: 'Invalid donation amount. Please enter a whole number of at least AUD $1.' });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100,
            currency: 'aud',
            automatic_payment_methods: { enabled: true },
            description: `Donation to AI Foundation Australia (AUD $${amount})`
        });

        res.json({
            clientSecret: paymentIntent.client_secret,
            publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
        });
    } catch (e) {
        console.error('Stripe PaymentIntent Error:', e);
        res.status(500).json({ error: e.message || 'Error creating payment intent' });
    }
});

app.listen(PORT, () => {
    console.log(`AI Foundation website running on http://localhost:${PORT}`);
});