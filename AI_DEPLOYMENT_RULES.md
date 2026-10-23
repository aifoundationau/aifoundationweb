# AI Deployment Rules: AI Foundation website

Read this before changing any code in this project. Pushing to `main` deploys straight to the live site (www.aifoundation.net.au) on Vercel. A single bad line can take the whole site down. That happened on 23 Oct 2026, and these rules exist to stop it happening again.

## How this site runs

- `server.js` is an Express app. Vercel runs it as one serverless function and starts it up for incoming requests.
- `.env` is never uploaded (it is in `.gitignore`). Vercel only has the environment variables entered in its dashboard, and some may be missing. **Assume any environment variable can be missing on Vercel.**
- Files in `public/` (`.html`, `.css`, `.js`, images) are served by Vercel's CDN and never reach `server.js`. Redirects, headers and auth checks in `server.js` do not apply to them.
- Firestore is accessed through `firebase-service.js`, which signs its own requests and switches Firestore off with a warning when credentials are missing.

## What went wrong on 23 Oct 2026

A change added this to the top of `server.js`:

```js
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert({ ... process.env.FIREBASE_PRIVATE_KEY ... }) });
```

The Firebase credentials were not available on Vercel, so `credential.cert()` threw while `server.js` was loading. Every page returned `500 FUNCTION_INVOCATION_FAILED`. It worked locally only because the local machine has `.env`. Nothing even used `admin`.

## Rules

1. **Nothing at the top level of a module may throw.** Code that runs when `server.js` or anything it `require`s first loads must never fail because of missing config. This covers SDK clients (`initializeApp`, `credential.cert`, `new Stripe(key)`), file reads and JSON parsing.
2. **Set up SDK clients lazily, inside a function, the first time they are needed.** Follow the existing `getStripe()` in `server.js`: return `null` when the key is missing, and have the route reply with a clear error.
3. **Missing config disables one feature, never the whole site.** Log a warning, as `getAccessToken()` in `firebase-service.js` does, and carry on.
4. **Do not add `firebase-admin` or a second Firebase connection.** All Firestore access goes through `firebase-service.js`. If something new seems to need the Admin SDK, stop and ask the owner first.
5. **Do not change who is SuperAdmin unless the owner asks.** The owner's domain is `aifoundation.net.au`. `aifoundation.com.au` is **not** theirs: never add it, or any address on it, to SuperAdmin lists, admin lists or authorized domains. A fake `david@aifoundation.com.au` SuperAdmin was found in the live rules in Oct 2026. The lists are `SUPERADMIN_UIDS` / `SUPERADMIN_EMAILS` in `firebase-service.js`, `public/app.js` and `public/firebase-client.js`. All three must always list the same accounts.
6. **New Firestore collections must be protected.** In `firestore.rules`, any collection not listed in `isProtectedCollection` can be read and written by any signed-in user from their browser. Add new collections to that list and give them their own rule. `firestore.rules` is **not** deployed by Vercel. The owner deploys it with `firebase deploy --only firestore:rules`, and must do so **before** pushing code that uses the new collection.
7. **Tokens are money.** The balance is `users/{uid}.token_balance`, shared by all the owner's apps. Change it only through `token-balances.js`, which records every change in `token_ledger` in the same atomic commit and never lets a spend go below 0. Never change it from a browser, and never write it with a plain `writeDocument`. The rules are in `data-contracts.md`, Domain 11.
8. **New environment variables:** add the name (never the value) to `.env.example`. Tell the owner to add it in Vercel → Project → Settings → Environment Variables, marking keys and secrets as **Sensitive**. Never commit `.env` or paste real keys into code.
9. **Do not commit or push unless the owner asks,** and never with failing checks (below).

## Required checks before saying a change is done

Run both from the project root. Report the actual output, never just "should work".

**1. The server starts with no environment variables, as on Vercel:**

```
node -e "const p=require('path').resolve('server.js');process.chdir(require('os').tmpdir());process.env.PORT='0';try{require(p)}catch(e){console.error('STARTUP FAILED:',e.message);process.exit(1)}setTimeout(()=>{console.log('STARTUP OK');process.exit(0)},3000)"
```

It must print `STARTUP OK`. If it prints `STARTUP FAILED`, the change will take the live site down. Fix it before doing anything else.

**2. The tests pass:**

```
npm test
```

Report any failing tests by name. Do not delete or weaken a test to make it pass.

## If the live site shows 500 FUNCTION_INVOCATION_FAILED

1. Run check 1 above. It reproduces most of these crashes locally.
2. Look at the most recent commit's changes to `server.js` and every file it `require`s.
3. To see Vercel's own logs: Vercel removed CLI email login in Feb 2026. Run `vercel login` without an email and approve the code in the browser, or use a token from vercel.com/account/tokens. The dashboard's **Logs** tab also works.
