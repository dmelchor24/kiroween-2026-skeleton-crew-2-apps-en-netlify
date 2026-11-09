# Code conventions
## JavaScript (frontend)
- Native ES modules (`import` / `export`). No CommonJS.
- Each app (`web/`, `pwa/`) has its own `src/` with the same content (except what is specific to the PWA); nothing is imported from outside the app folder. One `main-<page>.js` per HTML; page logic in `src/<module>-agent.js`; reusable pieces in `src/shared/`.
- Variables `camelCase`; constants `UPPER_SNAKE_CASE`; files and folders `kebab-case`.
- Configuration only from `src/config.js` (`VITE_*` variables). Writing IDs, URLs or keys in the code is forbidden.
- Text that comes from an API or from the user is inserted with `textContent`; if `innerHTML` must be used, escape first.
- Calls to the stack APIs go through `src/shared/api.js` (POST JSON to the public API).
- `amazon-cognito-identity-js` is only used in `src/auth/` and `src/shared/api.js`.
## CSS
- Colors and fonts **only** with `var(--token)`; tokens are defined only in `src/styles/tokens.css` (identical in `web/` and `pwa/`), which is generated from `.kiro/specs/01-system-design/design.md`.
- Transparencies with `color-mix(in srgb, var(--token) N%, transparent)`.
- `kebab-case` classes with a component prefix (`.chat-bubble`, `.pol-panel`). Styles of a new module carry their own prefix so they do not clash with `dashboard.css`.
- Respect iOS safe areas (`env(safe-area-inset-*)`) and 16 px on mobile fields (`pwa.css`, only in `pwa/`).
## Python (backend)
- Python 3.14, arm64. Dependencies with an exact version in `requirements.txt`.
- Lambdas do not have `logs:CreateLogGroup`: their log groups are declared in the template with retention.
- CORS is handled by API Gateway, not by the Lambdas. Errors to the client without internal details.
## SAM / CloudFormation
- A single template: `infra/template.yaml`. Least-privilege permissions.
- Every change is validated with `sam validate --lint` (a hook does it on save).
- New resources with names that include `${AWS::StackName}` if the name must be unique; watch the 64-character limit on IAM roles.
## Two apps, one codebase
- Every change to a shared file (`src/**`, HTML) is applied **in `web/` and in `pwa/`**. What is specific to the PWA (`public/`, `pwa.css`, iOS metas, service worker registration) lives only in `pwa/`; `web/` must not contain any reference to it.
## Dependency direction
`pages (main-*.js) → modules (*-agent.js) → shared → config`. A module does not import another module.
