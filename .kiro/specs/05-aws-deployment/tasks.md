# Implementation plan: aws-deployment

> Last spec. Prerequisite: `01` to `04` complete. Activated with the triggers **"migrate"** or **"deploy architecture"**. Golden rule: **nothing is created in AWS without explicit confirmation from the user** (task 5).

- [x] 1. Unified template
  - Create `infra/template.yaml` and `infra/samconfig.toml`.
  - Confirm that the template does not contain `RETAIN`/`Retain` (everything is deleted with the stack; `KnowledgeDataSource` uses `DataDeletionPolicy: DELETE`).
  - _Requirements: 1_

- [x] 2. Static validation
  - `sam validate --lint` (cwd: `infra`) must pass.
  - Confirm that every resource listed in the design map exists in the template and that `PortalApi` has no `Auth`.
  - _Requirements: 2, 4.1_

- [x] 3. Prior checks (read-only)
  - `python3 --version` (must be 3.14.x), `sam --version`, `aws --version`.
  - `aws sts get-caller-identity` → show account and ARN; `aws configure get region` → report if it differs from `us-east-1`.
  - `aws cloudformation describe-stacks --stack-name skeleton-crew --region us-east-1` → does it already exist?
  - Check whether the stacks of the original projects exist (`cognito-ai-system`, `iam-policy-creator-agent`, `knowledge-base-agent-agentcore-demo`); report that they are not touched.
  - _Requirements: 4_

- [x] 4. Build
  - `sam build` (cwd: `infra`). Must finish with "Build Succeeded".
  - _Requirements: 4.5_

- [x] 5. User authorization (blocking)
  - Show: account, region, stack `skeleton-crew`, the resource table from the design, and that there will be usage cost (Bedrock, AgentCore, S3, Lambda).
  - Also show, as part of the same authorization: (a) the test user that will be created (`test@gmail.com`, nickname `demoKiroween2026`) and (b) the upload of `kiroween-2026-information/` to the bucket and the start of the knowledge base ingestion.
  - Ask for the test user's temporary password (if the user does not provide one, one will be generated and shown to them). Do not store it.
  - Warn that the API is public and accepts any origin, and that the SAM artifacts bucket stays outside the stack.
  - Ask: "Do you authorize creating these resources?".
  - If the answer is not an explicit yes: stop, leave the task pending and explain how to resume ("migrate" or "deploy architecture").
  - _Requirements: 2.3, 3_

- [x] 6. Deployment
  - `sam deploy` (cwd: `infra`).
  - If it fails: read `describe-stack-events` filtering `CREATE_FAILED`, explain the cause, do NOT retry blindly (two-attempt rule).
  - _Requirements: 1, 3_

- [x] 7. Configure the frontend
  - Read the Outputs and write the same `.env.local` in `web/` and in `pwa/` as described in the design.
  - Check that `.gitignore` contains `.env.local`.
  - Remind the user that each app is a different Netlify site (*base directory* `web` and `pwa`) and that the four `VITE_*` variables are loaded in both.
  - _Requirements: 5_

- [x] 8. Test user
  - With `UserPool` and `UserPoolClient` already created, run `aws cognito-idp admin-create-user` with the data from the design (email `test@gmail.com`, nickname `demoKiroween2026`, temporary password) and `--message-action SUPPRESS`.
  - **Show the user** the email and temporary password so they can type them into the login, and explain the first sign-in (new password, MFA QR, 6-digit code).
  - Do not write the password in any file.
  - _Requirements: 6_

- [x] 9. Synchronize the knowledge base
  - Follow `03-knowledge-base/knowledge-base-artifact.md`, sections 2.2 to 2.6: `aws s3 sync` of `kiroween-2026-information/` → `aws bedrock-agent start-ingestion-job` → inline script that shows progress in the console until `COMPLETE`.
  - If ingestion ends in `FAILED`, report the reason and stop.
  - _Requirements: 9_

- [x] 10. Final verification
  - `curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' <ChatApiUrl>` and the same with `<GeneratePolicyUrl>` → must return `400`.
  - `curl -s -i -X OPTIONS -H "Origin: https://example.com" -H "Access-Control-Request-Method: POST" <ChatApiUrl>` → must include `access-control-allow-origin: *`.
  - Ask the user to run `npm run dev` in `web/` and in `pwa/`, sign in with the test user (password change → MFA QR → code) and confirm that they reach `chat.html`.
  - Summarize what was verified and what was not (Requirement 7.3).
  - _Requirements: 7_

- [x] 11. Closing
  - Update `ARTIFACTS-README.md` (section "Deployed resources") with the commands to list the stack (without writing the account, URLs or physical IDs).
  - Mark the spec in `00-orchestrator/tasks.md` and announce that the project is complete (`web/` and `pwa/`).
