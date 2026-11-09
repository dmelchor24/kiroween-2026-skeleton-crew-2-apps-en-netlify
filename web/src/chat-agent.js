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
