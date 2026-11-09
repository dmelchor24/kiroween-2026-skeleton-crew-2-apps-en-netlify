# Product and stack
*Lean* template: two frontend apps in separate, self-contained folders, `web/` (browser only) and `pwa/` (installable on iPhone and Mac), that share one backend (`infra/`). Both offer Cognito login (TOTP MFA), a chat over a knowledge base and an IAM policy generator with an AI agent. The repository **does not store code**: it is recreated by running the specs in `.kiro/specs/` in order (see `orchestrator.md`).
## Stack
- **Frontend:** HTML, CSS and JavaScript with ES modules, bundled with **Vite**. No TypeScript, no frameworks (React, Vue, Svelte), no CSS preprocessors. Exact dependencies: `amazon-cognito-identity-js`, `qrcode-generator`, `vite`.
- **Backend:** AWS SAM, a single stack (`skeleton-crew`, region `us-east-1`). Lambdas in Python 3.14 arm64. Agent with Strands Agents on Bedrock AgentCore Runtime. No web frameworks in the backend.
- **Structure:** `web/` and `pwa/` are independent Vite projects (each with its own `package.json`, `node_modules`, `.env.local` and `netlify.toml`); `infra/` is single. Shared code is generated identically in both from the same blocks of the `02-web-portal` spec; only `pwa/` has `public/` (manifest, `sw.js`, icons) and `pwa.css`.
- **Hosting:** two Netlify sites (*base directory* `web` and `pwa`). Evaluation and development: `npm run dev` inside `web/` (`http://localhost:5173`) or `pwa/` (`http://localhost:5174`).
## Spec map
| Spec | Content |
|---|---|
| `00-orchestrator` | Execution order and guidance |
| `01-system-design` | Palette, fonts, PWA icons (single source of design; tokens in both apps, icons only in `pwa/`) |
| `02-web-portal` | `web/` + `pwa/` structure, login, shell, PWA, Cognito + API |
| `03-knowledge-base` | Knowledge Base + chat |
| `04-iam-policy-agent` | Strands agent + policies page |
| `05-aws-deployment` | Single SAM template and deployment (always last) |
Each `design.md` contains the exact content of the files it must produce: they are created as-is, without reinterpreting.
## General rules
- Respond and document in English.
- Never create `.sh` files (a hook blocks them). Commands are run directly from Kiro.
- No secrets in the repository: passwords, tokens and keys are requested in the chat and not stored. `web/.env.local` and `pwa/.env.local` are ignored by Git.
- If something seems to be missing, turn it into a spec, hook, steering or MCP; do not leave loose code in the repository.
