# Implementation plan: iam-policy-agent

> Prerequisite: `03-knowledge-base` complete. No AWS resources are created in this spec (they are deployed in `05-aws-deployment`).

- [x] 1. Agent code
  - Create `infra/agent/requirements.txt`, `infra/agent/agent.py`, `infra/agent/saved_state.py` and `infra/agent/tools/{__init__,generate,validate,s3_save}.py`.
  - _Requirements: 1, 2_

- [x] 2. Custom resources and proxy
  - Create `infra/custom_resource/{handler.py,requirements.txt}` and `infra/proxy/{proxy_handler.py,requirements.txt}`.
  - Verify the syntax of all `.py` files with `python3 -m py_compile` and delete the `__pycache__` folders.
  - _Requirements: 3, 4_

- [x] 3. Policies page
  - Create `policies.html`, `src/main-policies.js`, `src/policies-agent.js` and `src/styles/policies.css` in `web/` and in `pwa/` (the `web/` variant omits the PWA-specific parts, see `02-web-portal/design.md`).
  - Add `policies: resolve(__dirname, "policies.html")` to `build.rollupOptions.input` in `web/vite.config.js` and in `pwa/vite.config.js`.
  - _Requirements: 5_

- [x] 4. Verification
  - `npm run build` completes without errors in `web/` and in `pwa/`, and `dist/policies.html` is generated in both.
  - `grep -nE "#[0-9a-fA-F]{3,8}\b" web/src/styles/policies.css pwa/src/styles/policies.css` returns no results.
  - With each app's `npm run dev` running in the background, `curl` to `/policies.html` returns 200; stop the processes.
  - `grep -niE "serviceWorker|manifest|apple-" web/policies.html` returns nothing.
  - _Requirements: 5_

- [x] 5. Checkpoint
  - Confirm that `agent.py` and `s3_save.py` share state through `saved_state.py` (not through global variables in `s3_save.py`: Strands reloads the tools as new modules).
  - Confirm that `infra/agent/requirements.txt` pins exact versions and that no `Dockerfile` exists. Confirm with `grep -n secretsmanager infra/agent/tools/generate.py` that it returns no results.
  - Close out: mark the spec in `00-orchestrator/tasks.md` and announce `05-aws-deployment` (and before that, the verification and the README in the orchestrator).
