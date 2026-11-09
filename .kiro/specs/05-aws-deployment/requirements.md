# Requirements: aws-deployment

## Introduction

Last spec of the project. It brings together, in **a single SAM template and a single stack** (`skeleton-crew`), all the resources from specs 02, 03 and 04, validates them, asks for explicit authorization and creates them. The source templates (`cognito-sam-cli`, `knowledge-base-creation` and `iam-policy-generator`) were already tested separately; this spec confirms that, once unified, they are created correctly.

The triggers **"migrate"** and **"deploy architecture"** activate this spec: they run the complete template and create all resources (if files from earlier specs are missing, those specs are run first).

## Requirements

### Requirement 1: A single stack
1. `infra/template.yaml` SHALL declare: Cognito (`UserPool`, `UserPoolClient`), `PortalApi`, knowledge base (bucket, managed Knowledge Base, S3 data source, Gateway, GatewayTarget, Harness and chat Lambda) and policy agent (buckets, layer, custom resources, runtime, proxy).
2. `infra/samconfig.toml` SHALL set `stack_name = "skeleton-crew"`, `region = "us-east-1"`, `resolve_s3 = true` and the capabilities `CAPABILITY_IAM` and `CAPABILITY_NAMED_IAM`.
3. There SHALL NOT be any `.sh` files; everything is run with `sam` and `aws` commands from Kiro.
4. ALL project resources SHALL be created inside the stack and deleted along with it: no `RETAIN`/`Retain` deletion policy (in particular `DataDeletionPolicy: DELETE` on `KnowledgeDataSource`). The only exception is the SAM artifacts bucket (`aws-sam-cli-managed-default`), which SAM creates before the stack and which is mentioned when the stack is destroyed.

### Requirement 2: Public API
1. `PortalApi` SHALL be public: no authorizer, no JWT and with `AllowOrigins: "*"`.
2. `PortalApi` SHALL keep rate limiting (5 req/s, burst 10) to cap Bedrock consumption.
3. THE SYSTEM SHALL inform the user, before deploying, that anyone with the URL can invoke the chat and the policy generator (and incur cost).

### Requirement 3: Authorization before creating resources
1. BEFORE any `sam deploy`, `sam delete`, `aws s3 sync/cp/rm`, `aws bedrock-agent start-ingestion-job` or `aws cognito-idp admin-*`, THE SYSTEM SHALL show the account, region, stack name and list of resources, and wait for an explicit affirmative confirmation.
2. THE `authorize-aws` hook SHALL also force confirmation on the command itself ("ask" permission).
3. IF the user does not confirm, THE SYSTEM SHALL stop without creating anything.

### Requirement 4: Prior checks (read-only)
1. `sam validate --lint` SHALL pass.
2. `python3 --version` SHALL be 3.14.x (a requirement of `sam build` for the agent layer).
3. `aws sts get-caller-identity` SHALL show the account; `aws cloudformation describe-stacks --stack-name skeleton-crew` indicates whether the stack already exists.
4. IF the stacks of the original projects exist (`cognito-ai-system`, `iam-policy-creator-agent`, `knowledge-base-agent-agentcore-demo`), THE SYSTEM SHALL report that they are independent and are not touched (the new stack derives its names from `${AWS::StackName}`).
5. `sam build` SHALL finish without errors.

### Requirement 5: Frontend configuration from the Outputs
1. AFTER the deployment, THE SYSTEM SHALL write the same `.env.local` in `web/` and in `pwa/` with `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_CHAT_API_URL` and `VITE_POLICY_API_URL` read from the Outputs (`UserPoolId`, `UserPoolClientId`, `ChatApiUrl`, `GeneratePolicyUrl`).
2. `web/.env.local` and `pwa/.env.local` SHALL be ignored by Git.
3. THE SYSTEM SHALL remind the user that there are **two Netlify sites** (*base directory* `web` and `pwa`) and that on each of them those four variables are created in *Site configuration → Environment variables*. There is no need to touch CORS: the API accepts any origin.

### Requirement 6: Test user
1. ONCE `UserPool` and `UserPoolClient` have been created (after the deployment), THE SYSTEM SHALL create a test user with `aws cognito-idp admin-create-user --message-action SUPPRESS`: email `test@gmail.com`, nickname `demoKiroween2026` and a temporary password. The authorization SHALL be requested together with the deployment authorization (authorization task).
2. THE temporary password SHALL be the one the user provides in the chat; if they provide none, THE SYSTEM SHALL generate one that meets the User Pool policy.
3. AFTER creating the user, THE SYSTEM SHALL **show the user** the email and temporary password so they can type them into the login, and describe the first sign-in flow (new password, MFA QR, 6-digit code).
4. THE password SHALL NEVER be stored in repository files, specs or any other file in the repository (`aws-security` rule).

### Requirement 7: Final verification
1. A `POST` request with `{}` to `ChatApiUrl` and to `GeneratePolicyUrl` SHALL respond `400` (it reaches the Lambda and rejects the empty body), and an `OPTIONS` with any `Origin` SHALL return `access-control-allow-origin: *`.
2. THE user SHALL be able to sign in with `npm run dev` in `web/` and in `pwa/`, complete the first sign-in (password change, MFA QR) and reach `chat.html`.
3. THE SYSTEM SHALL list what it verified and what it could not verify (the chat responds with content only after documents are uploaded and ingestion completes; policy generation depends on the 30 s limit of the HTTP API).

### Requirement 8: Controlled deletion
1. WHEN the user says "destroy architecture", THE SYSTEM SHALL ask for authorization and run `sam delete --stack-name skeleton-crew --region us-east-1`, and then confirm, with the read-only commands of "Verification after destroying" (design), that no buckets, log groups, runtimes, harnesses, gateways, knowledge bases or memories from the stack remain.
2. AFTER destroying, THE SYSTEM SHALL warn that `web/.env.local` and `pwa/.env.local` describe resources that no longer exist and offer to delete them.

### Requirement 9: Knowledge base synchronization
1. AFTER creating the test user, THE SYSTEM SHALL run the procedure in `03-knowledge-base/knowledge-base-artifact.md`: upload `kiroween-2026-information/` to the bucket, start ingestion with `start-ingestion-job` and show its progress in the console until `COMPLETE`.
2. THE synchronization is NOT automatic; IF ingestion ends in `FAILED`, THE SYSTEM SHALL report the reason and stop.
