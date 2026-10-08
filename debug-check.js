require('dotenv').config();
const fs = require('fs');
const apiKey = process.env.FIREBASE_API_KEY;
const projectId = process.env.FIREBASE_PROJECT_ID;

async function testMerge() {
    // 1. Fetch from Firestore REST
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
    const payload = {
        structuredQuery: {
            from: [{ collectionId: 'content' }],
            where: {
                compositeFilter: {
                    op: 'AND',
                    filters: [
                        { fieldFilter: { field: { fieldPath: 'tag' }, op: 'EQUAL', value: { stringValue: 'aifoundation' } } },
                        { fieldFilter: { field: { fieldPath: 'category' }, op: 'EQUAL', value: { stringValue: 'articles' } } }
                    ]
                }
            }
        }
    };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    
    const fbItems = data.filter(d => d.document).map(d => {
        const fields = d.document.fields;
        const obj = { id: d.document.name.split('/').pop() };
        for (const [k, v] of Object.entries(fields)) {
            obj[k] = v.stringValue || v.timestampValue || v.integerValue;
        }
        return obj;
    });

    console.log(`Firestore returned ${fbItems.length} articles:`);
    fbItems.forEach(item => {
        console.log(` - [${item.id}] ${item.title} (date: ${item.date})`);
    });

    // 2. Fallback
    const fallback = JSON.parse(fs.readFileSync('data/posts.json', 'utf8'));

    // 3. Merge as app.js does
    function mergePosts(primary, fallback) {
        const list = Array.isArray(primary) ? [...primary] : [];
        const existingKeys = new Set(list.map(p => p.id || p.link || p.title));
        if (Array.isArray(fallback)) {
            for (const item of fallback) {
                const key = item.id || item.link || item.title;
                if (!existingKeys.has(key)) {
                    list.push(item);
                    existingKeys.add(key);
                }
            }
        }
        list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        return list;
    }

    const merged = mergePosts(fbItems, fallback);
    console.log(`\nMerged result count: ${merged.length}`);
    console.log('Top 4 merged (Page 1):');
    merged.slice(0, 4).forEach((item, i) => {
        console.log(` ${i + 1}. [${item.id}] ${item.title} (${item.date})`);
    });
}

testMerge().catch(console.error);
