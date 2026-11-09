# Design: orchestrator
## Repository map
```
.gitignore
.kiro/
  steering/    product · conventions · orchestrator · triggers · aws-security   (always active)
               new-module                                                       (manual: #new-module in the chat)
  hooks/       reset-tasks · next-spec-guide · block-sh · authorize-aws · sam-validate · apply-design
  settings/    mcp.json            ← AWS documentation (optional)
  specs/
    00-orchestrator/       this spec
    01-system-design/      palette, fonts, PWA icons
    02-web-portal/         web/ + pwa/: login, shell, PWA, Cognito + API
    03-knowledge-base/     Knowledge Base + chat
    04-iam-policy-agent/   Strands agent + policies page
    05-aws-deployment/     single template + deployment (last task)
```
After running the specs, the following appear in the root: `web/` (web app), `pwa/` (PWA app), `infra/`, `kiroween-2026-information/`, and `ARTIFACTS-README.md`. Each app brings its own `package.json`, `vite.config.js`, `netlify.toml`, `*.html`, `src/` and `.env.local`; only `pwa/` brings `public/`.
## Flow
```
new session ─▶ reset-tasks hook (only if .kiro/.initialized-state does not exist)
             ─▶ prints status and next spec
user: "run"
   ─▶ 01 ─▶ 02 ─▶ 03 ─▶ 04 ─▶ verification ─▶ ARTIFACTS-README ─▶ 05 (asks for authorization;
        deploys, creates the test user, and syncs the knowledge base)
        (next-spec-guide hook marks and announces each completion)
```
## About tasks in Kiro
Each spec has its own `tasks.md`. To run a spec, the agent opens its `tasks.md`, performs each task in order and marks `[x]` when finished. The orchestrator's tasks do not repeat the work: they only delegate to each spec and verify.
## `ARTIFACTS-README.md` template
Kiro must generate this file in the root (in English), replacing what is between `<...>` with real data from the already generated repository:
````markdown
# Artifacts README
Guide to bring up and use the generated project.
## 1. What was generated
<Table: folder/file → what it is for (web/, pwa/, and inside each package.json, vite.config.js, netlify.toml, index.html, chat.html, policies.html, src/, .env.local; only in pwa/: public/ with manifest, sw.js and icons/; and infra/)>
## 2. Requirements
- Node.js 18 or higher · Python 3.14 · AWS CLI v2 with credentials · AWS SAM CLI 1.100+ · Access to the Claude Sonnet 4.5 model in Bedrock (us-east-1)
## 3. Run locally (what gets evaluated)
1. Web app: `cd web` → `npm install` → `npm run dev` → http://localhost:5173
2. PWA app: `cd pwa` → `npm install` → `npm run dev` → http://localhost:5174
3. Sign in with the test user that Kiro shows when deploying (email and temporary password) → new password and nickname → scan the QR with an authenticator app → 6-digit code.
(Each app requires its `.env.local` (`web/.env.local` and `pwa/.env.local`); if it does not exist, say "migrate" or "deploy architecture" in Kiro.)
## 4. Change colors and fonts
Edit the table in `.kiro/specs/01-system-design/design.md` and say "apply design".
## 5. Knowledge base
Say "synchronize knowledge base" (default folder `kiroween-2026-information`). Kiro uploads the documents, starts ingestion and shows progress in the console; syncing is not automatic.
## 6. Install as an app (PWA)
- iPhone: open the deployed URL in Safari → Share → Add to Home Screen.
- Mac: Safari → File → Add to Dock.
(Only the `pwa/` app is installable. It requires HTTPS: use the PWA's Netlify URL, not `localhost`.)
## 7. Deploy the site on Netlify
<Steps: push the repository (just one) to GitHub → create **two sites** in Netlify with "Import from Git" on the same repository: one with *Base directory* `web` and another with `pwa` (build `npm run build`, publish `dist`, already defined in each folder's `netlify.toml`) → in each site, VITE_* variables with the values from `.env.local` (the API accepts any origin, there is no CORS to adjust)>
## 8. Deployed resources
Everything lives in the `skeleton-crew` stack. To list it: `aws cloudformation describe-stack-resources --stack-name skeleton-crew --region us-east-1`; the Outputs, with `aws cloudformation describe-stacks --stack-name skeleton-crew --region us-east-1 --query "Stacks[0].Outputs"`. Before deployment state "Not deployed yet". No file with the stack data is generated, to avoid versioning account identifiers.
## 9. Remove everything
Say "destroy architecture" (asks for authorization).
## 10. Common problems
<Python other than 3.14 in sam build · expired session (tokens last 1 hour) · 30 s timeout in policies and chat · model without access enabled · chat without answers until documents are loaded and ingestion completes>
````
## Hooks (defined in `.kiro/hooks/`)
| Hook | Trigger | What it does |
|---|---|---|
| `reset-tasks` | SessionStart | Resets all tasks to `[ ]` if it is a fresh clone and shows the status |
| `next-spec-guide` | PostTaskExec | If a spec finished, marks it in the orchestrator and announces the next one |
| `block-sh` | PreToolUse (write) | Rejects creating `.sh` files |
| `authorize-aws` | PreToolUse (bash) | Asks for confirmation before commands that create/delete AWS resources |
| `sam-validate` | PostFileSave `infra/**/template.yaml` | Runs `sam validate --lint` |
| `apply-design` | PostFileSave of `01-system-design/design.md` | Reminds to regenerate `tokens.css` and the PWA |
