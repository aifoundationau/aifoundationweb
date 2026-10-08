require('dotenv').config();
const fs = require('fs');
const path = require('path');
const apiKey = process.env.FIREBASE_API_KEY;
const projectId = process.env.FIREBASE_PROJECT_ID;

async function syncFirestoreToLocal() {
    console.log('🔄 Fetching all content documents from Firestore...');
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/content?key=${apiKey}&pageSize=100`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.documents) {
        console.error('No documents returned from Firestore:', data);
        return;
    }

    const byCategory = {
        articles: [],
        projects: [],
        tech: [],
        community: []
    };

    for (const doc of data.documents) {
        const id = doc.name.split('/').pop();
        const f = doc.fields;
        if (!f) continue;
        const tag = f.tag?.stringValue;
        if (tag && tag !== 'aifoundation') continue; // only our tenant

        const category = f.category?.stringValue || 'articles';
        const item = {
            id: f.id?.stringValue || id,
            title: f.title?.stringValue || 'Untitled',
            summary: f.summary?.stringValue || '',
            link: f.link?.stringValue || '',
            imageUrl: f.imageUrl?.stringValue || 'assets/logo.png',
            platform: f.platform?.stringValue || 'website',
            author: f.author?.stringValue || 'AI Foundation Australia',
            date: f.date?.stringValue || f.date?.timestampValue || new Date().toISOString()
        };

        if (byCategory[category]) {
            byCategory[category].push(item);
        } else {
            byCategory.articles.push(item);
        }
    }

    const files = [
        { category: 'articles', filename: 'posts.json' },
        { category: 'projects', filename: 'projects.json' },
        { category: 'tech', filename: 'tech.json' },
        { category: 'community', filename: 'community.json' }
    ];

    for (const { category, filename } of files) {
        const remoteItems = byCategory[category];
        const dataPath = path.join(__dirname, 'data', filename);
        const publicDataPath = path.join(__dirname, 'public', 'data', filename);

        let localItems = [];
        try {
            if (fs.existsSync(dataPath)) localItems = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        } catch (e) {}

        // Merge without duplicates (by link or title or id)
        const merged = [...remoteItems];
        const keys = new Set(merged.map(m => m.link || m.title || m.id));

        for (const item of localItems) {
            const k = item.link || item.title || item.id;
            if (!keys.has(k)) {
                merged.push(item);
                keys.add(k);
            }
        }

        merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        fs.writeFileSync(dataPath, JSON.stringify(merged, null, 2), 'utf8');
        fs.writeFileSync(publicDataPath, JSON.stringify(merged, null, 2), 'utf8');
        console.log(`✅ Synced ${merged.length} items for ${category} -> ${filename} (both data/ and public/data/)`);
    }
}

syncFirestoreToLocal().catch(console.error);
