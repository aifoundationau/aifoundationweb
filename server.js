require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'posts.json');
const COMM_DATA_FILE = path.join(__dirname, 'data', 'community.json');

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

app.post('/api/community', (req, res) => {
    const posts = getCommunityPosts();
    const newPost = {
        id: 'comm_' + Date.now(),
        title: req.body.title || 'Untitled',
        summary: req.body.summary || '',
        platform: req.body.platform || 'linkedin',
        link: req.body.link || '',
        imageUrl: req.body.imageUrl || '',
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
    const finalKey = apiKey || process.env.IMGBB_API_KEY;
    try {
        const formData = new URLSearchParams();
        formData.append('key', finalKey);
        if (imageBase64) {
            formData.append('image', imageBase64.replace(/^data:image\/\w+;base64,/, ''));
        } else if (imageUrl) {
            formData.append('image', imageUrl);
        }
        const fetchRes = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData
        });
        const data = await fetchRes.json();
        if (data.success) {
            res.json({ success: true, url: data.data.url });
        } else {
            res.status(400).json({ error: data.error?.message || 'Upload failed' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`AI Foundation website running on http://localhost:${PORT}`);
});