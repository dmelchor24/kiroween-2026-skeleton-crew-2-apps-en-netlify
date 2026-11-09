# Requirements: knowledge-base

## Introduction

Creation of the knowledge base and the portal's chat module, migrated from the `knowledge-base-creation` project. The user's documents are stored in S3 and an **Amazon Bedrock managed knowledge base** (managed embedding, no vector store to provision) indexes them. An AgentCore **MCP Gateway** exposes the base, a **Harness** (managed agent, Claude Sonnet 4.6) queries it as a tool and a **Lambda** invokes it for the chat.

Resources it contributes to the single stack (template in `05-aws-deployment`): `KnowledgeDocsBucket`, `KnowledgeDocsBucketCleaner`, `KnowledgeBaseRole`, `KnowledgeBase`, `KnowledgeDataSource`, `GatewayRole`, `Gateway`, `GatewayTarget`, `HarnessRole`, `Harness`, `KbChatLogGroup`, `KbChatRole`, `KbChatFunction` (route `POST /knowledge-base/chat` in `PortalApi`).

## Requirements

### Requirement 1: Reproducible knowledge base
1. THE documents SHALL be uploaded to the `KnowledgeDocsBucket` bucket, which is private, encrypted and has public access blocked.
2. THE base SHALL be of type `MANAGED` (managed embedding) and its data source a managed S3 connector with `DataDeletionPolicy: DELETE` (everything stays inside the stack). Ingestion is NOT automatic: it is started with `start-ingestion-job`.
3. THE Gateway SHALL use `AWS_IAM` as inbound authentication, the MCP protocol and the `bedrock-knowledge-bases` connector with `AgenticRetrieveStream`.
4. THE Harness SHALL use the Gateway as a tool and a system prompt that limits answers to the knowledge base.
5. WHEN the stack is deleted, THE documents bucket SHALL be emptied automatically.

### Requirement 2: Artifact and guided synchronization
1. THE spec SHALL include `knowledge-base-artifact.md`, which contains the exact content of the sample document (`kiroween-2026-information/categories-and-prizes.md`) and the synchronization procedure. WHEN the spec is run, THE SYSTEM SHALL generate that document in the repository (does not require AWS).
2. WHEN the user says "synchronize knowledge base" (or at the end of "migrate"), THE SYSTEM SHALL read the stack Outputs, use the `kiroween-2026-information` folder by default (or the one the user indicates) and, with authorization, run `aws s3 sync` to `KnowledgeDocsBucketName`.
3. AFTER the upload, THE SYSTEM SHALL start ingestion with `aws bedrock-agent start-ingestion-job` (synchronization is NOT automatic).
4. THE SYSTEM SHALL show the ingestion progress in the console (status and statistics every 10 s) until `COMPLETE`, and warn if it ends in `FAILED`.
5. No `.sh` script is created: the monitoring is an inline `python3` block.

### Requirement 3: Chat API
1. `POST /knowledge-base/chat` (public) SHALL accept `{ "prompt": string, "sessionId"?: string | null }` (`query` is also accepted as an alias of `prompt`) and respond `{ "response": string, "sessionId": string, "timestamp": ISO-8601 }`.
2. Empty `prompt` → 400; throttling → 429; other errors → the service's HTTP code. THE error body SHALL be `{ "error": user-facing text, "errorType": string, "timestamp" }` without internal details.
3. THE Lambda SHALL generate a `sessionId` of at least 33 characters when none is received, and reuse it to keep the conversation context in the Harness.
4. THE Lambda SHALL retry (up to `MAX_RETRIES`) transient errors with increasing backoff.
5. `boto3` SHALL be pinned in `infra/kb_chat/requirements.txt` to a version that includes `invoke_harness`.
6. THE Lambda SHALL have minimal permissions: `bedrock-agentcore:InvokeHarness` / `InvokeAgentRuntime` on the Harness and write access only to its log group.

### Requirement 4: Chat module in the portal
1. `chat.html` (in `web/` and in `pwa/`) SHALL show the chat with an empty state, user/agent bubbles, a typing indicator, Enter to send and Shift+Enter for a new line.
2. THE `sessionId` SHALL start as `null` and reuse the one returned by the server.
3. THE responses SHALL be rendered with `textContent` (never `innerHTML`).
4. ERRORS SHALL be shown in the conversation with the API's message.
