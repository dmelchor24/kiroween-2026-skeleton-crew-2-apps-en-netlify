# AWS security and authorization
## Mandatory authorization
Before any of these commands, show the user the **account, region and what will be created/modified/deleted** and wait for an explicit yes in the chat:
- `sam deploy`, `sam delete`, `sam sync`
- `aws cloudformation create-stack | update-stack | deploy | delete-stack`
- `aws s3 sync | cp | mv | rm` and `aws s3api put-object | delete-object`
- `aws bedrock-agent create-* | delete-* | start-ingestion-job`
- `aws cognito-idp admin-*`
- `aws logs delete-*`
A hook (`authorize-aws`) adds a second confirmation on the command itself. If the user rejects it, do not retry or look for an alternate route.
Read-only commands (`sam validate`, `sam build`, `aws sts get-caller-identity`, `aws cloudformation describe-*`) do not require authorization.
## Secrets
- Do not write passwords, tokens or keys in repository files, specs or logs.
- Do not read `~/.aws/credentials` or print environment variables that contain credentials.
- `web/.env.local` and `pwa/.env.local` only contain IDs and public URLs of the stack (nothing secret), and are in `.gitignore`.
## Stack principles
- `PortalApi` is **public** by project decision (no authorizer, CORS `*`). Anyone with the URL can invoke the chat and the policy generator and generate Bedrock costs; keep the rate limit (`ThrottlingRateLimit`) and communicate this risk before deploying.
- Access to the pages is controlled by the Cognito login (MFA required).
- Least privilege on every role. Do not use `Resource: "*"` unless the AWS action does not support resources.
- IAM roles remain least-privilege even though the API is public.
- No self-registration in Cognito: only administrators create users.
