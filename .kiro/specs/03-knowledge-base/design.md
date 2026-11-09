# Design: knowledge-base

## Flow

```
Documents ──aws s3 sync──▶ KnowledgeDocsBucket ──start-ingestion-job (manual)──▶ KnowledgeBase (MANAGED)
                                                                                      ▲
chat.html (web/ and pwa/) ─POST /knowledge-base/chat─▶ PortalApi (public) ─▶ KbChatFunction          │
                                          └─ invoke_harness ─▶ Harness (Claude Sonnet 4.6)
                                                                  └─ MCP Gateway (AWS_IAM) ─▶ AgenticRetrieveStream
```

## Decisions

- **Managed base (`MANAGED`)**: no OpenSearch or S3 Vectors to provision; the S3 connector indexes when an ingestion is started (`start-ingestion-job`); there is no automatic synchronization. This is the architecture of the original `knowledge-base-creation` project, which was already tested; here it is integrated into the single stack.
- **Names**: the fixed names (`bucket-...-2026`, `role-...-demo`) were removed and are derived from `${AWS::StackName}` so they do not clash with the original stack if it is still deployed in the same account. The Harness is named `skeletonKbHarness` (parameter `HarnessName`; letters, numbers and underscore only).
- **Model**: `global.anthropic.claude-sonnet-4-6` (parameter `HarnessModelId`). Requires model access in the account; the Harness role already includes the Marketplace permissions.
- **`DataDeletionPolicy: DELETE`** on the data source: everything lives inside the stack and `sam delete` also purges the managed index. No resource is left outside the stack.
- **Lambda**: starts from the project's `lambda_function.py` (`knowledge-base` folder), with three minimal adjustments: (1) it accepts `sessionId: null`, which is what the portal sends on the first message (the original failed with `len(None)`); (2) errors return a user-facing text in `error` and leave the technical detail only in CloudWatch (the original returned the exception's JSON); (3) it does not add CORS headers: API Gateway sets them. The `query` alias, the padding of `sessionId` to 33+ characters, the backoff on throttling and the stream parsing are kept. 60 s timeout on the Lambda, but the HTTP API cuts off at **30 s**.
- **`boto3` pinned to 1.43.119** in `requirements.txt`: `invoke_harness` is very recent and the boto3 included in the Lambda runtime may not have it. SAM packages it with the function.
- **Roles**: the project's JSON policies (`harness-agent-execution-role`, `-gateway`, `-lambda`) are already inside `infra/template.yaml` as inline policies of `HarnessRole`, `GatewayRole` and `KbChatRole`. The template adds what the JSONs did not include and the resource needs: `bedrock:AgenticRetrieveStream` and `GetKnowledgeBase` (Gateway), `InvokeGateway` and Memory access (Harness) and write access to the log group (Lambda).
- **Public API**: the route does not require a token; see `05-aws-deployment` for abuse control (rate limiting).

## Document upload (run by Kiro, always asking for authorization)

The full procedure is in [`knowledge-base-artifact.md`](./knowledge-base-artifact.md): it generates the sample document (`kiroween-2026-information/categories-and-prizes.md`) and synchronizes it, showing progress in the console.

1. `aws cloudformation describe-stacks --stack-name skeleton-crew --region us-east-1 --query "Stacks[0].Outputs"` → `KnowledgeDocsBucketName`, `KnowledgeBaseId` and `KnowledgeDataSourceId` (format `<KnowledgeBaseId>|<DataSourceId>`).
2. `aws s3 sync "<folder>" "s3://<KnowledgeDocsBucketName>/"` uploads the documents.
3. `aws bedrock-agent start-ingestion-job` **starts** ingestion: synchronization is NOT automatic.
4. An inline script polls `get-ingestion-job` every 10 s and prints progress until `COMPLETE`. Only then does the chat respond with the new content.

## Files produced by this spec

Exact content. Create as is. The frontend paths (`chat.html, src/main-chat.js, src/chat-agent.js`) are created in **`web/` and in `pwa/`** following the rules in `02-web-portal/design.md` › "Rules for creating the block files" (the HTML and the `main-*.js` of `web/` omit what is specific to the PWA). The `infra/**` paths are created only once.

#### `chat.html`

````html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Kiroween 2026</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>">
  <!-- PWA / iOS: installable from Safari (Share → Add to Home Screen) -->
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Kiroween 2026">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <!-- Design system: colors and fonts (generated from .kiro/specs/01-system-design) -->
  <link rel="stylesheet" href="/src/styles/tokens.css">
  <style>html, body { background: var(--bg); } a { color: inherit; }</style>
  <!-- Apply theme before first paint to avoid a flash -->
  <script>(function(){var t=localStorage.getItem('color-theme');if(!t)t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';if(t==='light')document.documentElement.classList.add('theme-light');document.documentElement.style.opacity='0';})();</script>
</head>
<body class="dashboard-body">

  <header class="topbar" role="banner">
    <span class="topbar-brand">Kiroween 2026</span>
    <span class="topbar-user" id="topbarUser"></span>
  </header>

  <div class="dashboard-layout">

    <nav class="sidebar" id="sidebar" aria-label="Main navigation">
      <div class="sidebar-top">
        <ul class="nav-list" role="list">
          <li>
            <a href="chat.html" class="nav-item nav-item--active" aria-current="page" data-tooltip="Chat">
              <svg class="nav-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span class="nav-label">Chat</span>
            </a>
          </li>
          <li>
            <a href="policies.html" class="nav-item" data-tooltip="IAM Policies">
              <svg class="nav-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span class="nav-label">IAM Policies</span>
            </a>
          </li>
        </ul>
      </div>
      <div class="sidebar-bottom">
        <hr class="sidebar-divider">
        <button id="signOutBtn" class="nav-signout">
          <svg class="signout-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span class="nav-label">Sign out</span>
        </button>
      </div>
    </nav>

    <!-- Ear outside the nav so it is not clipped by the sidebar's overflow:clip -->
    <button class="sidebar-ear" id="sidebarEar"
            aria-controls="sidebar"
            aria-expanded="true"
            aria-label="Collapse menu">
      <svg class="sidebar-ear__icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>

    <button class="sidebar-toggle" id="sidebarToggle"
            aria-controls="sidebar"
            aria-expanded="false"
            aria-label="Open menu">☰</button>

    <main class="content-area content-area--chat" id="contentArea">
      <section id="section-chat" class="content-section" aria-label="Chat with the agent">
        <!-- initChatAgent() injects the full panel here -->
      </section>
    </main>

  </div>

  <script type="module" src="/src/main-chat.js"></script>
  <script>
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  </script>

  <!-- Modal: offline -->
  <div id="offlineModal" class="offline-modal" role="alertdialog" aria-modal="true" aria-labelledby="offlineModalTitle" aria-describedby="offlineModalBody">
    <div class="offline-modal__card">
      <span class="offline-modal__icon" aria-hidden="true">🌐</span>
      <h2 class="offline-modal__title" id="offlineModalTitle">No internet connection</h2>
      <p class="offline-modal__body" id="offlineModalBody">
        The application cannot communicate with the server.<br>
        Waiting for the connection to be restored…
      </p>
      <div class="offline-modal__status">
        <span class="offline-modal__spinner" aria-hidden="true"></span>
        <span>Reconnecting…</span>
      </div>
      <hr class="offline-modal__divider">
      <button type="button" id="offlineSignOutBtn" class="offline-modal__btn">
        Sign out now
      </button>
    </div>
  </div>
</body>
</html>
````

#### `src/main-chat.js`

````javascript
/**
 * main-chat.js — Entry point of chat.html.
 */

import "./styles/login.css";
import "./styles/dashboard.css";
import "./styles/pwa.css";
import { initDashboardPage } from "./pages/dashboard.js";
import { initChatAgent } from "./chat-agent.js";

function bootstrap() {
  initDashboardPage();
  initChatAgent();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
````

#### `src/chat-agent.js`

````javascript
/**
 * chat-agent.js
 * Full logic of the chat with the knowledge base (AWS API).
 * Mounted inside the content-area of chat.html.
 */

import { CONFIG, requireConfig } from "./config.js";
import { postJson } from "./shared/api.js";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

const CHAT_CONFIG = Object.freeze({
  // Name of the field the Lambda expects
  MESSAGE_FIELD: "prompt",

  // Text shown in the avatars
  AVATAR_USER:  "You",
  AVATAR_AGENT: "AI",
});

// ─────────────────────────────────────────────
// Chat panel HTML (injected into #section-chat)
// ─────────────────────────────────────────────

const CHAT_HTML = `
<div class="chat-shell">

  <!-- Agent sub-header -->
  <div class="chat-agent-header">
    <div class="chat-agent-logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="4 12 10 18 20 6"/>
      </svg>
    </div>
    <div class="chat-agent-info">
      <span class="chat-agent-name">Knowledge base</span>
    </div>
  </div>

  <!-- Messages -->
  <div class="chat-messages" id="chatMessages" role="log" aria-live="polite" aria-label="Conversation">
    <div class="chat-empty" id="chatEmptyState">
      <div class="chat-empty-icon" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <h2 class="chat-empty-title">How can I help you?</h2>
      <p class="chat-empty-body">Type your message to start a conversation with the agent.</p>
    </div>
  </div>

  <!-- Input -->
  <div class="chat-footer">
    <div class="chat-input-row">
      <textarea
        id="chatInput"
        class="chat-textarea"
        placeholder="Type your message…"
        rows="1"
        aria-label="Message"
        aria-multiline="true"
      ></textarea>
      <button class="chat-send-btn" id="chatSendBtn" disabled
              aria-label="Send message" title="Send">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
    <p class="chat-footer-hint">
      <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> new line
    </p>
  </div>

</div>
`;

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

/**
 * Returns the current time in HH:MM format (24 h).
 */
function chatFormatTime(date = new Date()) {
  return date.toLocaleTimeString("en-US", {
    hour:   "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ─────────────────────────────────────────────
// API
// ─────────────────────────────────────────────

/**
 * Calls the Lambda and returns the response text and the current sessionId.
 * The sessionId is issued by Bedrock in the first response; it is sent back in later ones
 * to keep the conversation context.
 */
async function chatApiInvoke(message, sessionId) {
  requireConfig("CHAT_API_URL");

  const data = await postJson(CONFIG.CHAT_API_URL, {
    [CHAT_CONFIG.MESSAGE_FIELD]: message,
    sessionId,
  });

  // The Lambda returns { response: "...", sessionId: "...", timestamp: "..." }
  const text = data?.response;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("The API did not return a valid 'response' field.");
  }

  return { text: text.trim(), sessionId: data.sessionId ?? sessionId };
}

// ─────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────

function chatRemoveEmptyState() {
  document.getElementById("chatEmptyState")?.remove();
}

function chatScrollToBottom(messagesEl) {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * Creates a bubble with avatar, content and timestamp.
 * Returns the content element so the text can be written into it.
 */
function chatCreateBubble(messagesEl, role, time) {
  chatRemoveEmptyState();

  const wrap = document.createElement("div");
  wrap.className = `chat-bubble chat-bubble--${role}`;

  const avatar = document.createElement("div");
  avatar.className = "chat-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user"
    ? CHAT_CONFIG.AVATAR_USER
    : CHAT_CONFIG.AVATAR_AGENT;

  const content = document.createElement("div");
  content.className = "chat-content";

  const timestamp = document.createElement("span");
  timestamp.className = "chat-timestamp";
  timestamp.setAttribute("aria-label", `Sent at ${time}`);
  timestamp.textContent = time;

  // Inner container: avatar + bubble stacked, timestamp always bottom-right
  const inner = document.createElement("div");
  inner.className = "chat-bubble-inner";
  inner.appendChild(avatar);
  inner.appendChild(content);

  wrap.appendChild(inner);
  wrap.appendChild(timestamp);
  messagesEl.appendChild(wrap);
  chatScrollToBottom(messagesEl);

  return content;
}

function chatAppendUserMessage(messagesEl, text, time) {
  const content = chatCreateBubble(messagesEl, "user", time);
  content.textContent = text;
}

function chatShowTyping(messagesEl) {
  chatRemoveEmptyState();

  const wrap = document.createElement("div");
  wrap.className = "chat-bubble chat-bubble--agent";
  wrap.id = "chatTypingIndicator";

  const avatar = document.createElement("div");
  avatar.className = "chat-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = CHAT_CONFIG.AVATAR_AGENT;

  const content = document.createElement("div");
  content.className = "chat-content chat-typing";
  content.setAttribute("aria-label", "The agent is typing");
  content.innerHTML = "<span></span><span></span><span></span>";

  const inner = document.createElement("div");
  inner.className = "chat-bubble-inner";
  inner.appendChild(avatar);
  inner.appendChild(content);

  wrap.appendChild(inner);
  messagesEl.appendChild(wrap);
  chatScrollToBottom(messagesEl);
}

function chatRemoveTyping() {
  document.getElementById("chatTypingIndicator")?.remove();
}

function chatAppendAgentMessage(messagesEl, text, time) {
  const content = chatCreateBubble(messagesEl, "agent", time);
  content.textContent = text;
}

function chatShowError(messagesEl, message) {
  chatRemoveTyping();
  const err = document.createElement("div");
  err.className = "chat-error";
  err.setAttribute("role", "alert");
  err.textContent = "⚠ " + message;
  messagesEl.appendChild(err);
  chatScrollToBottom(messagesEl);
}

// ─────────────────────────────────────────────
// App (orchestrator)
// ─────────────────────────────────────────────

export function initChatAgent() {
  const section = document.getElementById("section-chat");
  if (!section) return;

  // Inject the panel HTML
  section.innerHTML = CHAT_HTML;

  const messagesEl = document.getElementById("chatMessages");
  const inputEl    = document.getElementById("chatInput");
  const sendBtn    = document.getElementById("chatSendBtn");

  let sessionId   = null; // assigned by the server in the first response
  let isStreaming = false;

  function getInputValue() {
    return inputEl.value.trim();
  }

  function clearInput() {
    inputEl.value = "";
    inputEl.style.height = "auto";
  }

  function resizeInput() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
  }

  function setSendEnabled(enabled) {
    sendBtn.disabled = !enabled;
  }

  async function send() {
    const message = getInputValue();
    if (!message || isStreaming) return;

    isStreaming = true;
    clearInput();
    setSendEnabled(false);

    const sentTime = chatFormatTime();
    chatAppendUserMessage(messagesEl, message, sentTime);
    chatShowTyping(messagesEl);

    try {
      const reply = await chatApiInvoke(message, sessionId);
      sessionId = reply.sessionId;
      const responseText = reply.text;

      chatRemoveTyping();
      const receivedTime = chatFormatTime();
      chatAppendAgentMessage(messagesEl, responseText, receivedTime);

    } catch (err) {
      console.error("[ChatAgent] Error invoking the agent:", err);
      chatShowError(messagesEl, err.message || "Could not connect to the agent. Please try again.");
    } finally {
      isStreaming = false;
      setSendEnabled(!!getInputValue());
      inputEl.focus();
    }
  }

  // Auto-resize + enable button
  inputEl.addEventListener("input", () => {
    resizeInput();
    setSendEnabled(!!getInputValue() && !isStreaming);
  });

  // Enter sends, Shift+Enter inserts a new line
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  sendBtn.addEventListener("click", send);
  inputEl.focus();

  console.info("[ChatAgent] Initialized.");
}
````

#### `infra/kb_chat/lambda_function.py`

````python
import json
import boto3
import uuid
import os
from datetime import datetime, timezone
from time import sleep
from botocore.exceptions import ClientError

# Configuration
BEDROCK_REGION = os.environ.get('REGION')
HARNESS_ARN = os.environ.get('HARNESS_ARN')  # Harness ARN (stable), not that of the executable version
MAX_RETRIES = int(os.environ.get('MAX_RETRIES', '3'))
MIN_SESSION_ID_LENGTH = 33  # required by runtimeSessionId

agentcore_client = boto3.client('bedrock-agentcore', region_name=BEDROCK_REGION)

# User-facing messages: the technical detail only goes to the Lambda log
FRIENDLY_ERRORS = {
    'ThrottlingException': 'Too many requests. Try again in a few seconds.',
}
DEFAULT_ERROR = 'Could not query the knowledge base. Please try again.'


def _ensure_valid_session_id(session_id):
    """AgentCore Runtime requires a runtimeSessionId of at least 33 characters."""
    if len(session_id) < MIN_SESSION_ID_LENGTH:
        session_id = (session_id + str(uuid.uuid4())).replace('-', '')[:64]
    return session_id


def _extract_completion(response):
    """Accumulates the text of the contentBlockDelta events returned by invoke_harness."""
    completion = ''
    for event in response.get('stream', []):
        if 'contentBlockDelta' in event:
            delta = event['contentBlockDelta'].get('delta', {})
            if 'text' in delta:
                completion += delta['text']
        elif 'runtimeClientError' in event:
            raise Exception(json.dumps({
                'errorType': 'RuntimeClientError',
                'errorMessage': event['runtimeClientError'].get('message', 'Unknown harness error'),
                'statusCode': 502
            }))
    return completion


def _json_response(status_code, body):
    # CORS is added by API Gateway (CorsConfiguration of the HttpApi)
    return {
        'statusCode': status_code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False)
    }


def lambda_handler(event, context):
    try:
        # Parse body
        body = json.loads(event['body']) if isinstance(event.get('body'), str) else event.get('body') or {}

        # Get basic parameters
        user_input = body.get('prompt') or body.get('query', '')
        if not user_input or not user_input.strip():
            return _json_response(400, {
                'error': 'The message is empty or contains only spaces.',
                'errorType': 'EmptyInputError',
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
        user_input = user_input.strip()

        # The portal sends a null sessionId on the first message
        session_id = _ensure_valid_session_id(body.get('sessionId') or str(uuid.uuid4()))

        # Invoke the Harness with automatic retries
        completion = ''
        for attempt in range(MAX_RETRIES):
            try:
                response = agentcore_client.invoke_harness(
                    harnessArn=HARNESS_ARN,
                    runtimeSessionId=session_id,
                    messages=[{
                        'role': 'user',
                        'content': [{'text': user_input}]
                    }]
                )
                completion = _extract_completion(response)
                break  # Exit on success
            except ClientError as e:
                error_code = e.response['Error']['Code']

                # Retry only on throttling and while attempts remain
                if error_code == 'ThrottlingException' and attempt < MAX_RETRIES - 1:
                    sleep(2 ** attempt * 2)  # Backoff: 2s, 4s, 8s
                    continue

                status_code = e.response.get('ResponseMetadata', {}).get('HTTPStatusCode', 500)
                raise Exception(json.dumps({
                    'errorType': error_code,
                    'errorMessage': str(e),
                    'statusCode': status_code
                }))

        # Successful response
        return _json_response(200, {
            'response': completion.strip(),
            'sessionId': session_id,
            'timestamp': datetime.now(timezone.utc).isoformat()
        })

    except Exception as e:
        # Try to parse a structured error
        try:
            error_data = json.loads(str(e))
            status_code = error_data.get('statusCode', 500)
            error_type = error_data.get('errorType', 'UnknownError')
        except Exception:
            status_code = 500
            error_type = type(e).__name__

        print(f'ERROR {error_type}: {e}', flush=True)  # technical detail only in CloudWatch
        return _json_response(status_code, {
            'error': FRIENDLY_ERRORS.get(error_type, DEFAULT_ERROR),
            'errorType': error_type,
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
````

#### `infra/kb_chat/requirements.txt`

````text
boto3==1.43.119
````
