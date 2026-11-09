# Triggers
The user only needs to say one of these phrases (or something equivalent). Act without asking them to repeat it.
| Phrase | Action |
|---|---|
| **run** | Follow the orchestrator protocol from the first spec with pending tasks until everything is complete. |
| **migrate** | Activates the full template: runs `05-aws-deployment` and creates **all** resources of the single `skeleton-crew` stack (Cognito, API, knowledge base, Gateway, Harness, policy agent), with explicit authorization. Then creates and shows the test user and syncs the knowledge base with progress in the console. If files from specs 01–04 are missing, it runs them first. When finished it writes the same `.env.local` in `web/` and in `pwa/`. |
| **deploy architecture** | Same as "migrate"; it also works to **redeploy** after changing the template. |
| **destroy architecture** | Ask for authorization and run `sam delete --stack-name skeleton-crew --region us-east-1` from `infra/`; then verify with the commands in "Verification after destroying" (`05-aws-deployment/design.md`) that no buckets, log groups, runtimes, harness, gateways, knowledge bases or memories of the stack remain, and offer to delete `web/.env.local` and `pwa/.env.local`, which no longer reflect live resources. |
| **synchronize knowledge base** | Default folder `kiroween-2026-information` (or the one the user indicates; if missing, generate it from `03-knowledge-base/knowledge-base-artifact.md`). With authorization: `aws s3 sync` to the `KnowledgeDocsBucketName` bucket, then `aws bedrock-agent start-ingestion-job` and an inline script that shows progress in the console until `COMPLETE`. Syncing is NOT automatic (steps in `knowledge-base-artifact.md`). |
| **create user** | Ask for email, nickname and temporary password (without data, propose the test user `test@gmail.com` with nickname `demoKiroween2026`); with authorization, `aws cognito-idp admin-create-user ... --message-action SUPPRESS`. Show the user the email and password for login. Never store the password. |
| **apply design** | Regenerate `pwa/src/styles/tokens.css` and `web/src/styles/tokens.css` from the table in `01-system-design/design.md` and run the inline `apply-palette` block (see that spec). |
| **change palette / colors / fonts** | If the user gives colors or asks for an example palette, update the table in `01-system-design/design.md` and then "apply design". Otherwise, explain that they edit the table and say "apply design". |
| **reset tasks** | Set every task in every `tasks.md` to `[ ]` and show the status. |
| **add module** | Follow `new-module.md` (include it with `#new-module`). |
| **status** | Show progress per spec and the next step. |
If the phrase is ambiguous, offer the two or three most likely options in a single question.
