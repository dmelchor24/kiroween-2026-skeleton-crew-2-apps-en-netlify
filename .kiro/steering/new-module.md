---
inclusion: manual
---
# Add a new module to the portal
A module is one more protected page. Example: `reports`. All frontend steps are done **in `web/` and in `pwa/`** (except step 6, `pwa/` only).
1. **HTML:** copy `chat.html` as `reports.html`. Move `nav-item--active` and `aria-current` to the new module's link, add its `<li>` to the menu of **all** pages (`chat.html`, `policies.html`, `reports.html`), and replace `<section id="section-chat">` with `<section id="section-reports" class="content-section">`. Remove `content-area--chat` if the module scrolls normally.
2. **Entry point:** `src/main-reports.js` modeled on `main-policies.js` (style imports + `initDashboardPage()` + `initReportsAgent()`).
3. **Logic:** `src/reports-agent.js` exports `initReportsAgent()`, injects its HTML into `#section-reports`, reads its URL from `CONFIG` and calls with `postJson` from `src/shared/api.js`.
4. **Styles:** `src/styles/reports.css` with its own prefix (`rep-`) and only `var(--token)`.
5. **Vite:** add `reports: resolve(__dirname, "reports.html")` to `build.rollupOptions.input` in `vite.config.js`.
6. **Service worker (`pwa/` only):** add `/reports.html` to `PRECACHE_URLS` in `pwa/public/sw.js` and bump `CACHE_VERSION`.
7. **Configuration:** new variable `VITE_REPORTS_API_URL` in `src/config.js`, in `web/.env.local`, `pwa/.env.local` and in both Netlify sites.
8. **Backend (if applicable):** Lambda in `infra/<module>/`, route in `PortalApi` (public, inherits CORS and rate limiting) and output in `Outputs`; validate with `sam validate --lint` and deploy with "deploy architecture".
9. Verify with `npm run build` in `web/` and in `pwa/`.
Do not import code from other modules: shared code goes in `src/shared/`.
