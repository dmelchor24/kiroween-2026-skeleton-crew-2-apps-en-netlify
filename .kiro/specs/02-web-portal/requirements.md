# Requirements: web-portal
## Introduction
Two frontend applications in separate, self-contained folders (HTML + CSS + JavaScript ES modules, bundled with Vite), with login against Amazon Cognito and a base module structure: `web/` (web app, browser only) and `pwa/` (the same app installable as a PWA on iOS (iPhone) and macOS from Safari). Each one runs locally with `npm run dev` from its folder and is deployed as an independent Netlify site. The concrete modules (knowledge chat, IAM policy generator) are added by specs `03` and `04`.
This spec also contributes the access resources to the single AWS stack: `UserPool`, `UserPoolClient` and `PortalApi` (public HTTP API with open CORS). Its template lives in `05-aws-deployment`.
## Requirements
### Requirement 1: Secure login
**User story:** As an authorized user, I want to sign in with email, password and a TOTP code, so that I can access securely.
1. THE login SHALL use SRP with `amazon-cognito-identity-js` (the password never travels in clear).
2. ON first sign-in it SHALL force a temporary password change and ask for a nickname if Cognito requires it (3–20 characters: letters, numbers, `-`, `_`).
3. ON first sign-in it SHALL set up TOTP MFA by showing a QR (inline SVG) and an alternate secret, and verify the first 6-digit code.
4. ON later sign-ins it SHALL ask for the 6-digit TOTP code.
5. COGNITO errors SHALL be displayed in English, including "No internet connection".
6. WHEN reloading with a valid session it SHALL redirect to `chat.html`.
### Requirement 2: Configuration without values in the code
1. `UserPoolId`, `ClientId`, chat URL and policies URL SHALL be read from `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_CHAT_API_URL`, `VITE_POLICY_API_URL` through `src/config.js` (in each app).
2. IF a required variable is missing, THE login SHALL show a message telling the user to say "deploy architecture" or "migrate" in Kiro.
3. `web/.env.local` and `pwa/.env.local` SHALL be in `.gitignore`; on Netlify the variables are defined in the site's panel.
### Requirement 3: Module shell
1. EACH protected page SHALL validate the session on load and redirect to `index.html` if it is not valid.
2. THE shell SHALL include a top bar with nickname/email and connection status, a collapsible side menu (hamburger on mobile) and a sign-out button.
3. THE light/dark theme SHALL persist in `localStorage` (`color-theme`) and be applied before the first paint.
4. A connectivity monitor SHALL show a blocking modal when offline, revalidate the session on reconnect and redirect to login if it expired.
5. TO add a module, a new HTML, a `main-<module>.js` and an entry in `vite.config.js` are enough (see the `new-module` steering).
### Requirement 4: PWA installable on iOS and macOS (`pwa/` only)
0. THE `pwa/` folder SHALL contain everything needed for installation; `web/` SHALL NOT contain `public/`, `manifest.webmanifest`, `sw.js`, icons, `pwa.css` or references to `serviceWorker`, `manifest` or `apple-mobile-web-app`.
1. EACH HTML in `pwa/` SHALL include `viewport-fit=cover`, `manifest`, `apple-touch-icon` and the metas `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-title` and `apple-mobile-web-app-status-bar-style=black`.
2. THE service worker (`pwa/public/sw.js`) SHALL use network first with a cache fallback, and NEVER intercept requests to `amazonaws.com`, Cognito, `1.1.1.1` or Google Fonts.
3. THE CSS (`pwa/src/styles/pwa.css`) SHALL respect safe areas (`env(safe-area-inset-*)`) and use 16 px on mobile fields to avoid iOS zoom.
4. `pwa/netlify.toml` SHALL serve `sw.js` and `manifest.webmanifest` without CDN caching.
### Requirement 5: Two self-contained folders, one local command per app
1. IN `web/` and in `pwa/`, `npm install` and `npm run dev` SHALL bring the site up at `http://localhost:5173` (web) and `http://localhost:5174` (pwa).
2. `npm run build` in each folder SHALL generate its `dist/` without errors; the one in `web/` without `sw.js` or `manifest.webmanifest` and the one in `pwa/` with both.
3. EACH folder SHALL be self-contained: none imports files outside itself or requires workspaces, and each is deployed as a Netlify site with its folder as *base directory*.
4. THE shared logic and styles SHALL be identical in both (same blocks from the spec).
5. NO `.sh` file SHALL exist.
### Requirement 6: Contributed AWS resources
1. `UserPool`: login by email, mandatory MFA TOTP only, no self-registration, `email` and `nickname` attributes required, password of 8+ characters with uppercase, lowercase, number and symbol.
2. `UserPoolClient`: no secret, `ALLOW_USER_SRP_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH` flows, 1-hour tokens.
3. `PortalApi`: **public** (no authorizer), CORS with `AllowOrigins: "*"`, only `Content-Type` as header, and rate limiting of 5 req/s (burst 10). Access to the pages is controlled by the Cognito login.
