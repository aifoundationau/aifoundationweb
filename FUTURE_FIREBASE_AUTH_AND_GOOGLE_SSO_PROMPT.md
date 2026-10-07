# FUTURE ARCHITECTURE SPECIFICATION & PROMPT
## Firebase-Centric Authentication & Unified Google SSO (Classroom, Workspace, Gmail)

> **File:** `FUTURE_FIREBASE_AUTH_AND_GOOGLE_SSO_PROMPT.md`  
> **Target Ecosystem:** AI Foundation Australia, It's A Simple Job, Pro LMS, RTO AI, and Unified Ecosystem Apps  
> **Purpose:** Reusable master prompt and architectural specification for future developers and AI assistants. Ensures all authentication flows through Firebase on the client side, minimizes hosting service backend code, and provides federated Google Single Sign-On (SSO) to Google Classroom, Gmail, Workspace, and other Google services.

---

## 1. THE FUTURE MASTER PROMPT (COPY & PASTE READY)

```text
================================================================================
MASTER PROMPT: FIREBASE AUTH & UNIFIED GOOGLE ECOSYSTEM SSO
================================================================================

Role & Goal:
You are an expert Cloud & Web Security Architect. Implement a centralized,
serverless authentication architecture for our web platform where:

1. Centralized Identity Authority:
   - ALL user authentication MUST go exclusively through Firebase Authentication 
     using the Google Identity Provider (GoogleAuthProvider).
   - No separate login system, custom password database, or third-party auth 
     service should ever be introduced.

2. Unified Google SSO & Ecosystem Access (Classroom, Gmail, Workspace, Drive):
   - When a user logs in with their Google account via Firebase Auth on our website,
     that identical Google credential and identity session must be leveraged to 
     access Google ecosystem services (e.g., Google Classroom, Gmail, Google 
     Workspace, Google Drive, Google Calendar).
   - Request the necessary Google OAuth 2.0 scopes during or incrementally after 
     Firebase sign-in (using `GoogleAuthProvider.addScope(...)`).
   - Capture the Google OAuth access token returned in the Firebase credential 
     (`GoogleAuthProvider.credentialFromResult(result).accessToken`) to interact 
     with Google APIs (Google Classroom API, Gmail API, Drive API) directly from 
     the client application or authorized serverless workers.

3. Zero-Authentication Hosting Service (Stateless / Edge Hosting):
   - MINIMIZE and ELIMINATE authentication coding on the web hosting service 
     (e.g., Firebase Hosting, Vercel, Netlify, Cloudflare Pages, S3/CloudFront).
   - The hosting service MUST only serve static HTML, CSS, JavaScript, and assets.
   - DO NOT build custom session managers, cookie decryptors, JWT session stores, 
     or custom auth middleware on the hosting server.
   - The hosting provider should remain 100% stateless and decoupled from user 
     session tracking.

4. Enforcement Confined to Website Client & Firebase Database Rules:
   - All authentication logic takes place on the client-side website using the 
     official Firebase Web SDK (v9+ / v11 modular).
   - All access control, tenant data segregation, and Role-Based Access Control 
     (RBAC) MUST be enforced directly within Firebase Cloud Firestore Security Rules 
     (using `request.auth.uid`, `request.auth.token.email`, and custom claims / user 
     document roles).
   - If a database request does not satisfy Firestore Security Rules, Firebase 
     rejects it at the database layer, ensuring no unauthenticated or unauthorized 
     reads or writes occur regardless of the hosting platform.

5. Deliverables & Standards:
   - Maintain seamless mobile (Android/iOS) and desktop responsiveness.
   - Ensure clean sign-out mechanisms that invalidate the Firebase session.
   - Store OAuth access tokens securely in browser memory/sessionStorage with 
     proper expiration handling and incremental permission requests.
   - Adhere strictly to the organization's multi-tenant tagging data contracts.
================================================================================
```

---

## 2. SYSTEM ARCHITECTURE & DATA FLOW

```mermaid
flowchart TD
    subgraph ClientBrowser [Client Web Browser / Mobile Device]
        User([User / Admin])
        WebUI[Website Frontend UI]
        FirebaseSDK[Client-side Firebase Auth SDK]
        GoogleOAuth[Google Sign-In Popup / Redirect]
    end

    subgraph HostingProvider [Hosting Service - Zero Auth Code]
        StaticHost[Static Assets / CDN<br/>Firebase Hosting / Vercel / Cloudflare<br/>(No backend session code)]
    end

    subgraph FirebaseCloud [Firebase & Google Cloud Platform]
        FirebaseAuthService[Firebase Authentication Service]
        FirestoreDB[(Cloud Firestore Database<br/>Security Rules Enforced)]
    end

    subgraph GoogleEcosystem [Google Workspace & Developer APIs]
        GoogleClassroom[Google Classroom API]
        GoogleGmail[Gmail API]
        GoogleWorkspace[Google Workspace / Drive]
    end

    %% User Flow
    User -->|1. Visits Website| StaticHost
    StaticHost -->|Serves Static JS/HTML| WebUI
    User -->|2. Clicks Google Sign In| WebUI
    WebUI -->|3. Initiates signInWithPopup with Scopes| FirebaseSDK
    FirebaseSDK -->|4. Authenticates via Google IdP| GoogleOAuth
    GoogleOAuth -->|5. Returns Firebase User & Google OAuth Token| FirebaseSDK
    
    %% Direct Database Access (Zero Host Logic)
    FirebaseSDK -->|6. Direct DB Requests with Auth Token| FirestoreDB
    FirestoreDB -->|7. Verifies request.auth against Rules| FirestoreDB
    
    %% Direct Google Services Access
    FirebaseSDK -->|8. Uses Google OAuth Access Token| GoogleClassroom
    FirebaseSDK -->|8. Uses Google OAuth Access Token| GoogleGmail
    FirebaseSDK -->|8. Uses Google OAuth Access Token| GoogleWorkspace
```

---

## 3. CORE ARCHITECTURAL PRINCIPLES

### Principle 1: Firebase Auth as the Single Identity Authority
- **No Fragmented Logins:** The application never maintains separate username/password databases or external session cookies.
- **Unified Identity:** Every user identity is represented by a single Firebase UID mapped to their Google email (`@aifoundation.net.au`, `@aifoundation.com.au`, or external student/member Google accounts).
- **Persistent State:** Firebase Auth automatically manages local session persistence (`browserLocalPersistence`) across tab reloads and device restarts without needing hosting-level cookie sessions.

### Principle 2: Zero Hosting-Service Auth Overhead
- Traditional web apps often force the hosting server (e.g., Express, Node.js server, Next.js server) to decrypt cookies, verify session signatures, query a session Redis cache, and maintain user state.
- **Our Model:** The hosting service is strictly a **dumb pipe** for static assets. 
- It requires **zero lines of authentication code**. You can host the site on Firebase Hosting, GitHub Pages, Vercel, Netlify, or an S3 bucket with zero backend modifications.
- Security does NOT depend on whether the hosting server is compromised or reconfigured.

### Principle 3: Database-Level Security Enforcement
- Because the hosting server has no auth logic, all security is enforced by **Cloud Firestore Security Rules**.
- Firestore evaluates every single read, write, update, and delete against:
  - `request.auth != null` (is the user signed in?)
  - `request.auth.token.email.matches('.*@aifoundation\\.(net|com)\\.au$')` (is the user an authorized organization admin?)
  - `request.auth.token.role == 'admin'` (RBAC claim)
  - `resource.data.tag == 'aifoundation'` (multi-tenant boundary)

### Principle 4: Unified Google SSO (Classroom, Workspace, Gmail)
- Firebase Auth under the hood is an identity wrapper around Google OAuth 2.0.
- When calling `new GoogleAuthProvider()`, you can attach additional Google OAuth scopes:
  - Google Classroom: `https://www.googleapis.com/auth/classroom.courses.readonly`, `https://www.googleapis.com/auth/classroom.rosters.readonly`
  - Gmail API: `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/gmail.readonly`
  - Google Drive: `https://www.googleapis.com/auth/drive.file`
- Upon authentication, Firebase returns both:
  1. The **Firebase ID Token** (used for Firestore Database operations).
  2. The **Google OAuth Access Token** (used to call Google Classroom, Gmail, and Workspace APIs directly).
- The user signs in **once**, and gets access to both the web application database and Google Workspace / Classroom tools.

---

## 4. CODE IMPLEMENTATION BLUEPRINT

### 4.1 Client-Side Firebase Google Sign-In with Google Scopes

```javascript
// public/firebase-auth-sso.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    signOut,
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';

// 1. Initialize Firebase
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.firebasestorage.app",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// 2. Configure Google Provider with Workspace & Classroom Scopes
const googleProvider = new GoogleAuthProvider();

// Add Google Workspace & Classroom Scopes
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.profile');
// Optional: Google Classroom
googleProvider.addScope('https://www.googleapis.com/auth/classroom.courses.readonly');
// Optional: Gmail
googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');

// Optional: Prompt user to select their organization Workspace account
googleProvider.setCustomParameters({
    prompt: 'select_account',
    hd: 'aifoundation.net.au' // Forces or suggests organization Workspace domain
});

// 3. Authenticate User & Capture Tokens
export async function loginWithGoogleSSO() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        
        // Firebase User Object (used for Firestore Database)
        const user = result.user;
        console.log('[Auth] Logged in user:', user.email);

        // Google OAuth Access Credential (used for Classroom, Gmail, Workspace APIs)
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const googleAccessToken = credential?.accessToken;

        if (googleAccessToken) {
            // Store token in session memory for calling Google Classroom / Gmail APIs
            sessionStorage.setItem('google_oauth_access_token', googleAccessToken);
            console.log('[Auth] Google OAuth Access Token captured for Workspace/Classroom');
        }

        return { user, googleAccessToken };
    } catch (error) {
        console.error('[Auth] Login error:', error.code, error.message);
        throw error;
    }
}

// 4. Sign Out & Clear All Tokens
export async function logoutUser() {
    sessionStorage.removeItem('google_oauth_access_token');
    await signOut(auth);
    console.log('[Auth] Signed out and session tokens cleared');
}
```

---

### 4.2 Using the Same Token for Google Classroom / Gmail

Because the Google OAuth token is captured directly at sign-in, the client web app can call Google APIs without needing a backend server:

```javascript
// Example: Fetch User's Google Classroom Courses using the Same Login
export async function fetchGoogleClassroomCourses() {
    const accessToken = sessionStorage.getItem('google_oauth_access_token');
    if (!accessToken) {
        throw new Error('No Google OAuth token found. Please sign in with Google first.');
    }

    const response = await fetch('https://classroom.googleapis.com/v1/courses', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Google Classroom API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.courses || [];
}
```

---

### 4.3 Pure Database Security Rules (Zero Hosting Middleware Needed)

Save this directly to your Firestore Database rules. No backend hosting code is required:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: Is the user logged in via Firebase?
    function isAuthenticated() {
      return request.auth != null;
    }

    // Helper: Is the user an AI Foundation domain administrator?
    function isAdmin() {
      return isAuthenticated() && (
        request.auth.token.email.matches('.*@aifoundation\\.net\\.au$') ||
        request.auth.token.email.matches('.*@aifoundation\\.com\\.au$') ||
        request.auth.token.role == 'admin'
      );
    }

    // Helper: Enforce tenant tagging contract
    function isTenant(targetTag) {
      return resource == null || resource.data.tag == targetTag;
    }

    // 1. Content Collection (Articles, Projects, Courses)
    match /content/{docId} {
      // Anyone can read public content
      allow read: if true;
      // Only authenticated admins can upload, edit, or delete posts
      allow create, update, delete: if isAdmin();
    }

    // 2. User Profiles Collection
    match /users/{userId} {
      // Users can read/write their own profile; admins can manage all
      allow read, write: if isAuthenticated() && (request.auth.uid == userId || isAdmin());
    }

    // 3. Classroom & Course Registrations
    match /classroom_sync/{docId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    // 4. Default Rule: Deny everything else unless explicitly permitted
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 5. GOOGLE CLOUD CONSOLE CONFIGURATION CHECKLIST

To allow Firebase Auth to issue tokens valid for Classroom, Gmail, or Workspace APIs:

1. **Open Google Cloud Console:**
   - Navigate to [https://console.cloud.google.com/](https://console.cloud.google.com/) for the project linked to your Firebase app.

2. **Enable Required Google APIs:**
   - Go to **APIs & Services > Library**.
   - Search for and enable:
     - **Google Classroom API**
     - **Gmail API**
     - **Google Drive API** (if file attachments are needed)
     - **Google Calendar API** (if scheduling is needed)

3. **Configure OAuth Consent Screen:**
   - Go to **APIs & Services > OAuth consent screen**.
   - **User Type:** Select **Internal** (if only `@aifoundation.net.au` Workspace users) or **External** (if public users/students will log in).
   - **Scopes:** Add:
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
     - `.../auth/classroom.courses.readonly`
     - `.../auth/gmail.send`

4. **Whitelist Authorized Domains in Firebase Console:**
   - Go to [Firebase Console > Authentication > Settings > Authorized domains](https://console.firebase.google.com/).
   - Add your domains:
     - `aifoundation.net.au`
     - `aifoundation.com.au`
     - Your Vercel / Firebase Hosting / Custom production domains.
     - `localhost` (for testing).

---

## 6. VERIFICATION CRITERIA FOR FUTURE IMPLEMENTATIONS

When an agent or developer implements features using this prompt, verify:

| Criteria | Expected Standard | Verification Method |
| :--- | :--- | :--- |
| **Auth Provider** | 100% Firebase Authentication | No non-Firebase login routes or local password tables exist. |
| **Hosting Independence** | Zero auth code on hosting server | Hosting config contains only static file serving; no JWT middleware. |
| **Database Guardrails** | All security enforced in Firestore rules | Direct client writes are blocked by Firestore if unauthenticated. |
| **Google SSO Reuse** | Google OAuth token captured & accessible | `sessionStorage` has `google_oauth_access_token` after Google login. |
| **Google Ecosystem Access** | Can call Classroom / Gmail APIs | Token works against Google Classroom or Gmail endpoints. |
| **Mobile UX** | Full responsive support on Android/iOS | Dropdown menus, 16px font sizes on inputs, no horizontal scroll bugs. |
