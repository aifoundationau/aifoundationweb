require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { writeDocument, TRANSACTION_TAG, BUSINESS_ID } = require('./firebase-service');

async function syncAllPosts() {
    console.log('🚀 Syncing all existing local JSON posts into Cloud Firestore...');

    const categories = [
        { file: 'posts.json', category: 'articles' },
        { file: 'projects.json', category: 'projects' },
        { file: 'tech.json', category: 'tech' },
        { file: 'community.json', category: 'community' }
    ];

    let totalSynced = 0;

    for (const { file, category } of categories) {
        const filePath = path.join(__dirname, 'data', file);
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️ File not found: ${file}`);
            continue;
        }

        const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`📂 Processing ${items.length} items from ${file} (${category})...`);

        for (const item of items) {
            const docId = item.id || `${category}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const payload = {
                ...item,
                id: docId,
                category,
                tag: TRANSACTION_TAG || 'aifoundation',
                businessId: BUSINESS_ID || 'aifoundation',
                businessName: 'AI Foundation',
                source: 'aifoundation',
                syncedAt: new Date().toISOString()
            };

            const res = await writeDocument('content', docId, payload, true);
            if (res.success) {
                totalSynced++;
                console.log(`  ✓ Synced [${category}] ${docId}: "${item.title || item.link}"`);
            } else {
                console.error(`  ✗ Error syncing ${docId}:`, res.error);
            }
        }
    }

    console.log(`🎉 Finished syncing ${totalSynced} items to Cloud Firestore!`);
}

syncAllPosts().catch(console.error);
