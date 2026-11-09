# Implementation plan: knowledge-base

> Prerequisite: `02-web-portal` complete. No AWS resources are created in this spec (they are deployed in `05-aws-deployment`).

- [x] 1. Chat Lambda
  - Create `infra/kb_chat/lambda_function.py` and `infra/kb_chat/requirements.txt`.
  - Verify syntax: `python3 -m py_compile infra/kb_chat/lambda_function.py` and delete `__pycache__`.
  - _Requirements: 3_

- [x] 2. Chat page
  - Create `chat.html`, `src/main-chat.js` and `src/chat-agent.js` in `web/` and in `pwa/` (the `web/` variant omits what is specific to the PWA, see `02-web-portal/design.md`).
  - Add `chat: resolve(__dirname, "chat.html")` to `build.rollupOptions.input` in `web/vite.config.js` and in `pwa/vite.config.js`.
  - _Requirements: 4_

- [x] 3. Verification
  - `npm run build` without errors in `web/` and in `pwa/`, and `dist/chat.html` generated in both.
  - With each app's `npm run dev` in the background (web 5173, pwa 5174), `curl` to `/chat.html` and `/src/main-chat.js` returns 200; stop the processes.
  - `grep -niE "serviceWorker|manifest|apple-" web/chat.html` returns nothing.
  - _Requirements: 4_

- [x] 4. Generate the knowledge base artifact
  - Open `knowledge-base-artifact.md` (in this folder) and create `kiroween-2026-information/categories-and-prizes.md` with the exact content of section 1. Does not require AWS.
  - Confirm that the file exists and is not empty. Do NOT synchronize here: synchronization (sections 2.x) is run by `05-aws-deployment` when the stack exists.
  - _Requirements: 2.1_

- [x] 5. Document the synchronization
  - Confirm that the `triggers` steering describes "synchronize knowledge base" as: `aws s3 sync` + `start-ingestion-job` + progress in the console until `COMPLETE` (synchronization is NOT automatic).
  - _Requirements: 2_

- [x] 6. Checkpoint
  - `chat-agent.js` (in both apps) does not use `innerHTML` with API text and the URL comes from `CONFIG.CHAT_API_URL`.
  - Close: mark the spec in `00-orchestrator/tasks.md` and announce `04-iam-policy-agent`.
