# Artifacts README

Guide to bring up and use the generated project.

## 1. What was generated

| Path | What it is for |
|---|---|
| `web/` | Web app, used from the browser (no manifest or service worker). |
| `pwa/` | The same app, installable on iPhone and Mac. |
| `web/package.json` · `pwa/package.json` | Dependencies (`amazon-cognito-identity-js`, `qrcode-generator`, `vite`) and scripts (`dev`, `build`, `preview`). |
| `web/vite.config.js` · `pwa/vite.config.js` | Vite multi-page build: `index`, `chat` and `policies`. Ports 5173 (web) and 5174 (pwa). |
| `web/netlify.toml` · `pwa/netlify.toml` | Netlify build (`npm run build`, publish `dist`) and security headers. |
| `index.html` | Login page (Cognito, MFA). |
| `chat.html` | Chat with the knowledge base. |
| `policies.html` | IAM policy generator. |
| `src/` | Code of each app: `config.js`, `auth/`, `shared/`, `pages/`, `styles/`, `main-*.js`, `chat-agent.js`, `policies-agent.js`. |
| `.env.local` | Cognito and API values. Not versioned; created at deployment (`migrate`). |
| `pwa/public/` | Only in `pwa/`: `manifest.webmanifest`, `sw.js` and `icons/`. |
| `pwa/src/styles/pwa.css` | Only in `pwa/`: iOS safe areas and mobile field sizes. |
| `infra/` | Shared backend: `kb_chat/` (chat Lambda), `agent/` (Strands policy agent), `proxy/`, `custom_resource/`. `template.yaml` is created by the `05-aws-deployment` spec. |
| `kiroween-2026-information/` | Sample document for the knowledge base. |

## 2. Requirements

- Node.js 18 or higher · Python 3.14 · AWS CLI v2 with credentials · AWS SAM CLI 1.100+ · Access to the Claude Sonnet 4.5 model in Bedrock (us-east-1)

## 3. Run locally (what gets evaluated)

1. Web app: `cd web` → `npm install` → `npm run dev` → http://localhost:5173
2. PWA app: `cd pwa` → `npm install` → `npm run dev` → http://localhost:5174
3. Sign in with the test user that Kiro shows when deploying (email and temporary password) → new password and nickname → scan the QR with an authenticator app → 6-digit code.

Each app requires its `.env.local` (`web/.env.local` and `pwa/.env.local`). If it does not exist, say "migrate" or "deploy architecture" in Kiro. Without it, the login shows a missing-configuration message.

## 4. Change colors and fonts

Edit the table in `.kiro/specs/01-system-design/design.md` and say "apply design".

## 5. Knowledge base

Say "synchronize knowledge base" (default folder `kiroween-2026-information`). Kiro uploads the documents, starts ingestion and shows progress in the console. Syncing is not automatic.

## 6. Install as an app (PWA)

- iPhone: open the deployed URL in Safari → Share → Add to Home Screen.
- Mac: Safari → File → Add to Dock.

Only the `pwa/` app is installable. It requires HTTPS: use the PWA's Netlify URL, not `localhost`.

## 7. Deploy the site on Netlify

1. Push the repository (just one) to GitHub.
2. In Netlify, create **two sites** with "Import from Git" on the same repository: one with *Base directory* `web` and another with `pwa`. Build command `npm run build` and publish directory `dist` are already defined in each folder's `netlify.toml`.
3. In each site, add the `VITE_*` variables with the values from `.env.local`. The API accepts any origin, so there is no CORS to adjust.

## 8. Deployed resources

Deployed. Everything lives in the `skeleton-crew` stack. To list it: `aws cloudformation describe-stack-resources --stack-name skeleton-crew --region us-east-1`. To see the Outputs: `aws cloudformation describe-stacks --stack-name skeleton-crew --region us-east-1 --query "Stacks[0].Outputs"`. No file with the stack data is generated, to avoid versioning account identifiers.

## 9. Remove everything

Say "destroy architecture" (asks for authorization).

## 10. Common problems

- `sam build` fails with a Python other than 3.14, or on native Windows (use WSL2, see the README).
- Expired session: tokens last 1 hour; sign in again.
- Chat and policies have a 30 s timeout; retry with a shorter request.
- Model without access enabled: enable Claude Sonnet 4.5 in the Bedrock console (us-east-1).
- Chat gives no useful answers until the documents are uploaded and the ingestion finishes (`synchronize knowledge base`).
