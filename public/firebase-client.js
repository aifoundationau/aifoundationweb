/**
 * AI Foundation - Client Firebase Integration
 * Multi-Tenant Cloud Firestore Client for 'ai-foundation-firebase'
 * Partitioned with: tag = 'aifoundation', businessId = 'aifoundation'
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc 
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: "AIzaSyCPeAOWQj8456TeIWDIPsyxyWT7QLrC8J8",
  authDomain: "ai-foundation-firebase.firebaseapp.com",
  projectId: "ai-foundation-firebase",
  storageBucket: "ai-foundation-firebase.firebasestorage.app",
  messagingSenderId: "614773274800",
  appId: "1:614773274800:web:a7c2a66e4e8c4409afb221"
};

export const BUSINESS_ID = "aifoundation";
export const TRANSACTION_TAG = "aifoundation";

let app = null;
let db = null;
let isConnected = false;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  isConnected = true;
  console.log("🔥 [Firebase] Client SDK initialized for AI Foundation (Tenant tag: aifoundation)");
} catch (err) {
  console.warn("⚠️ [Firebase] Client SDK initialization notice:", err.message);
}

/**
 * Record or sync transaction in Firestore and server
 * MANDATORY REQUIREMENT: Every transaction MUST have tag: 'aifoundation'
 */
export async function recordTransaction(txRecord) {
  const payload = {
    ...txRecord,
    tag: TRANSACTION_TAG, // CRITICAL: 'aifoundation'
    businessId: BUSINESS_ID, // 'aifoundation'
    businessName: 'AI Foundation',
    source: 'aifoundation',
    recordedAt: txRecord.recordedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  console.log(`🔥 [Firestore] Recording transaction ${payload.transactionId} with tag: ${payload.tag}`);

  // 1. Dual-layer: Send to Server (authorized with Service Account)
  try {
    await fetch('/api/transactions/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn("⚠️ [Server Sync] Could not sync transaction to server:", err.message);
  }

  // 2. Direct client Firestore write (if permitted by rules)
  if (db && isConnected && payload.transactionId) {
    try {
      const docRef = doc(collection(db, 'transactions'), payload.transactionId);
      await setDoc(docRef, payload, { merge: true });
      console.log(`✅ [Firestore] Client wrote transaction ${payload.transactionId} with tag 'aifoundation'`);
    } catch (e) {
      // Security rules may require admin SDK on server; server handles it gracefully
      console.info("ℹ️ [Firestore] Client-direct write managed via server admin endpoint.");
    }
  }

  return payload;
}

// Expose on window for global access
window.firebaseService = {
  app,
  db,
  isConnected,
  BUSINESS_ID,
  TRANSACTION_TAG,
  recordTransaction
};

window.dispatchEvent(new CustomEvent('firebaseServiceReady', { detail: { isConnected, tag: TRANSACTION_TAG } }));
