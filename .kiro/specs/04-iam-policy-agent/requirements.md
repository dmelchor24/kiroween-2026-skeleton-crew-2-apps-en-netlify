# Requirements: iam-policy-agent

## Introduction

AI agent that generates AWS IAM policies from natural language, built with **Strands Agents**, deployed on **Amazon Bedrock AgentCore Runtime** with *direct code deployment* (zip in S3, no Docker) and exposed to the portal through a proxy Lambda behind `PortalApi`. It includes the portal's `policies.html` page.

Resources it contributes to the single stack (template in `05-aws-deployment`): `PoliciesBucket`, `AgentCodeBucket`, `AgentPackageLayer`, `CustomResourceFunction` (+ role and log group), `PoliciesBucketCleaner`, `AgentCodeBucketCleaner`, `AgentPackage`, `AgentCoreExecutionRole`, `AgentCoreRuntime`, `RuntimeLogGroup`, `ProxyFunction` (+ role and log group; route `POST /generate-policy`).

## Requirements

### Requirement 1: Agent contract
1. THE agent SHALL expose `POST /invocations` (payload `{ "input": { "prompt": string } }`) and `GET /ping` on port 8080 with FastAPI + uvicorn.
2. Empty `prompt` → 400; internal error → 500 with no details.
3. THE response SHALL be `{ "output": { message, policy, s3_key, s3_url, timestamp } }`.

### Requirement 2: Tools
1. `generate_iam_policy`: builds the policy for 19 services with predefined actions per level (`least-privilege`, `standard`, `broad`).
2. `validate_iam_policy`: validates the schema and applies per-level rules (errors and warnings; critical services `iam`, `sts`, `organizations`, `kms`).
3. `save_to_s3`: saves only validated policies to `policies/<service>/<YYYY-MM-DD>/<YYYYMMDDTHHMMSSZ>.json`, with keys in canonical IAM order, and returns a presigned URL.
4. THE agent flow SHALL be generate → validate → (if valid) save → respond. NEVER generate `Action: *` with `Resource: *`.
5. EVERY valid policy SHALL be saved in S3 and the response SHALL include `s3_key` and `s3_url`, even if the model does not call `save_to_s3` or the user asks for "just the JSON": `agent.py` validates and saves as a fallback. An invalid policy is NEVER saved.

### Requirement 3: Deployment without Docker
1. `sam build` SHALL build the layer with Linux arm64 wheels (`BuildMethod: python3.14`, `BuildArchitecture: arm64`).
2. THE `PackageAgent` custom resource SHALL repackage the layer (without the `python/` prefix, `agent.py` at the root) and upload it to `AgentCodeBucket` with a hash-derived key.
3. `EmptyBucket` and `RuntimeLogGroup` SHALL ensure that `sam delete` leaves no orphaned buckets or log groups.

### Requirement 4: Security
1. THE `PortalApi` routes are public by project decision (CORS `*`); consumption is limited by the API's rate limiting.
2. NO Lambda SHALL have `logs:CreateLogGroup` except the custom resources Lambda, for the runtime's log group.
3. THE proxy Lambda SHALL have only `bedrock-agentcore:InvokeAgentRuntime` on the runtime.
4. THE runtime name SHALL be the `AgentRuntimeName` parameter (default `skeleton_iam_policy_agent`) and match the `workload-identity/` prefix in `WorkloadAccessTokenPolicy`.

### Requirement 5: Policies page in the portal
1. `policies.html` (in `web/` and in `pwa/`) SHALL offer a form (service, actions, optional context, permission level) and a result panel.
2. THE policy SHALL be displayed with light syntax coloring and a typing effect (honoring `prefers-reduced-motion`), with the text escaped before inserting HTML.
3. IT SHALL allow copying to the clipboard, downloading as `.json`, and clearing; if there is an `s3_key`, IT SHALL display it with a link to the presigned URL.
4. ALL CSS classes carry the `pol-` prefix so they do not collide with `dashboard.css`.
