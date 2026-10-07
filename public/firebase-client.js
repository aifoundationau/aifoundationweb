/**
 * AI Foundation - Client Firebase Integration
 * Multi-Tenant Cloud Firestore & Google Authentication Client for 'ai-foundation-firebase'
 * Partitioned with: tag = 'aifoundation', businessId = 'aifoundation'
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy
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
let auth = null;
let googleProvider = null;
let isConnected = false;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  isConnected = true;
  console.log("🔥 [Firebase] Client SDK & Google Auth initialized for AI Foundation (Tenant tag: aifoundation)");
} catch (err) {
  console.warn("⚠️ [Firebase] Client SDK initialization notice:", err.message);
}

/**
 * Synchronize user profile across Firestore and server
 * MANDATORY REQUIREMENT: User profiles MUST have tag: 'aifoundation'
 */
export async function syncUserProfile(user, additionalData = {}) {
  if (!user || !user.uid) return null;

  const payload = {
    uid: user.uid,
    email: (user.email || '').toLowerCase().trim(),
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    tag: TRANSACTION_TAG, // CRITICAL: 'aifoundation'
    businessId: BUSINESS_ID, // 'aifoundation'
    businessName: 'AI Foundation',
    source: 'aifoundation',
    authProvider: 'google',
    lastLoginAt: new Date().toISOString(),
    ...additionalData
  };

  // 1. Dual-layer: Send to Server (authorized with Service Account)
  try {
    await fetch('/api/auth/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn("⚠️ [Server Auth Sync] Notice:", err.message);
  }

  // 2. Direct client Firestore write (if permitted by rules)
  if (db && isConnected) {
    try {
      const userRef = doc(collection(db, 'users'), user.uid);
      await setDoc(userRef, payload, { merge: true });
      console.log(`✅ [Firestore] User profile synchronized: ${user.email} (tag: ${TRANSACTION_TAG})`);
    } catch (e) {
      console.info("ℹ️ [Firestore] Client direct user write synced via server endpoint.");
    }
  }

  return payload;
}

/**
 * Sign in using Firebase Google Auth Popup
 */
export async function signInWithGoogle() {
  if (!auth || !googleProvider) {
    throw new Error("Firebase Auth is not ready. Please check configuration.");
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    console.log("✅ [Firebase Auth] Google Sign-in successful:", user.displayName, user.email);

    // Sync profile immediately with partition tag
    await syncUserProfile(user);

    // Dispatch event
    window.dispatchEvent(new CustomEvent('firebaseAuthChanged', { 
      detail: { user, isAuthenticated: true } 
    }));

    return user;
  } catch (error) {
    console.error("❌ [Firebase Auth] Google Sign-in error:", error.code, error.message);
    if (error.code === 'auth/popup-closed-by-user') {
      console.info("ℹ️ Sign-in popup was closed by user.");
    } else if (error.code === 'auth/configuration-not-found' || error.code === 'auth/operation-not-allowed') {
      console.warn("⚠️ Google Sign-In is not enabled yet in Firebase Console under Authentication > Sign-in method.");
    }
    throw error;
  }
}

/**
 * Sign out of Firebase Auth
 */
export async function signOutGoogle() {
  if (!auth) return;
  try {
    await signOut(auth);
    console.log("👋 [Firebase Auth] Signed out successfully");
    window.dispatchEvent(new CustomEvent('firebaseAuthChanged', { 
      detail: { user: null, isAuthenticated: false } 
    }));
  } catch (error) {
    console.error("❌ [Firebase Auth] Sign out error:", error);
    throw error;
  }
}

/**
 * Get currently authenticated user
 */
export function getCurrentUser() {
  return auth ? auth.currentUser : null;
}

/**
 * Listen for auth state changes
 */
export function onAuthChange(callback) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
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
      console.info("ℹ️ [Firestore] Client-direct write managed via server admin endpoint.");
    }
  }

  return payload;
}

// Global Auth State Observer
if (auth) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("👤 [Firebase Auth] Active session detected:", user.email);
      await syncUserProfile(user);
    } else {
      console.log("👤 [Firebase Auth] No active user session.");
    }
    window.dispatchEvent(new CustomEvent('firebaseAuthChanged', { 
      detail: { user: user || null, isAuthenticated: Boolean(user) } 
    }));
  });
}

// Expose on window for global access
window.firebaseService = {
  app,
  db,
  auth,
  googleProvider,
  isConnected,
  BUSINESS_ID,
  TRANSACTION_TAG,
  signInWithGoogle,
  signOutGoogle,
  getCurrentUser,
  onAuthChange,
  syncUserProfile,
  recordTransaction,
  collection,
  doc,
  setDoc,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy
};

window.dispatchEvent(new CustomEvent('firebaseServiceReady', { 
  detail: { isConnected, tag: TRANSACTION_TAG, authReady: Boolean(auth) } 
}));
