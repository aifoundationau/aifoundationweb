// token-kit: the server for a NEW app (copy it as server.js). It is not used by the AI Foundation website.
// Minimal Express server with the token system. On Vercel this file runs as one serverless function.
// Rule: nothing at the top level may throw when an environment variable is missing (see TOKEN SETUP GUIDE, Rules).
require('dotenv').config();
const express = require('express');
const path = require('path');
const { mountTokenRoutes } = require('./lib/token-routes');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Token API (lib/token-routes.js): mount right after express.json()
mountTokenRoutes(app, { appTag: process.env.APP_TAG, appName: process.env.APP_NAME });

// Public Firebase web config for the browser (these values are public by design; the service account key is not)
app.get('/api/firebase/config', (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY || '',
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'ai-foundation-firebase.firebaseapp.com',
        projectId: process.env.FIREBASE_PROJECT_ID || 'ai-foundation-firebase',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'ai-foundation-firebase.firebasestorage.app',
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
        appId: process.env.FIREBASE_APP_ID || ''
    });
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`App running on http://localhost:${PORT}`);
});
