# Design: iam-policy-agent

## Flow

```
policies.html (web/ and pwa/) ─POST /generate-policy {prompt, sessionId}─▶ PortalApi (public)
   ─▶ ProxyFunction ─invoke_agent_runtime─▶ AgentCoreRuntime (agent.py: FastAPI + Strands)
        ├─ generate_iam_policy → validate_iam_policy → save_to_s3 ─▶ PoliciesBucket
        └─ Bedrock Claude Sonnet 4.5 (BEDROCK_MODEL_ID)
```

## How the code reaches the runtime

1. `sam build` builds `AgentPackageLayer` from `infra/agent/` (installs `requirements.txt` as Linux arm64 wheels and copies `agent.py` + `tools/` under `python/`).
2. `sam deploy` publishes the layer; `PackageAgent` repackages it and uploads it to `AgentCodeBucket`.
3. `AgentCoreRuntime` uses `!GetAtt AgentPackage.Bucket/Key`: new code → new key → the runtime is updated.

## Changes from the original `iam-policy-generator` project

- The API is no longer its own: it uses `PortalApi`, public and with CORS `*` like the original, plus rate limiting.
- The proxy Lambda no longer adds CORS headers (API Gateway sets them) and no longer returns the exception text to the client.
- `AgentRuntimeName` is a parameter and the policies bucket no longer has a fixed name (avoids collisions with the earlier `iam-policy-creator-agent` stack in the same account).
- The frontend (`index.html`, `app.js`, `styles.css`) became the portal's `policies.html` module (in `web/` and `pwa/`). `invoke_agent.py` (CLI) and the `buildspec*.yaml` files were discarded: no project flow uses them.

## Guaranteed saving to S3

Saving **cannot depend on the LLM calling `save_to_s3`**. A prompt like "return ONLY the JSON" made it skip the step and the bucket stayed empty (only the browser download worked). Therefore:

- `agent.py` validates (`check_policy`) and saves (`save_policy`) the policy extracted from the response when the model did not return an `s3_key`. If validation fails or S3 errors out, it is logged to CloudWatch and the response is delivered anyway, without `s3_key`.
- `validate.py` and `s3_save.py` expose plain functions (`check_policy`, `save_policy`) that the `@tool` tools wrap; this way the server and the model share the same logic.
- **Shared state in `saved_state.py`** (package root, outside `tools/`): Strands reloads each tool's file as a new module (`s3_save` in addition to `tools.s3_save`), so the global variables in `s3_save.py` are NOT visible from `agent.py`. `s3_save.py` records the last save there, `agent.py` resets it on each invocation (`saved_state.reset()`) and reuses it; if the model already saved, a second file is not created. In addition, `save_policy` is idempotent: the model often calls the tool twice with the same policy and the second call returns the previous result without writing.
- **ASCII-only S3 metadata**: `_ascii()` strips accents from the validation summary (a summary containing accented characters made `put_object` fail with `ParamValidationError`, both in the tool and in the fallback). The key uses a safe slug of the service.
- The prompt in `policies-agent.js` asks to respond only with the ```json block: a short response avoids exceeding the 30 s cutoff of HTTP API (with prompts that also asked for a summary and URL it returned 503 even though the file was saved).
- The privilege level is inferred from the prompt text and the service from the prefix of the first action.

## Known limitations

- **30 s timeout**: HTTP API cuts integrations at 30 s even though the proxy Lambda allows 300 s. If the agent takes longer, the portal will show a 503/504 error; the policy may still end up saved in `PoliciesBucket`. For real use, consider a Lambda Function URL with streaming.
- **Python 3.14** must be installed on the machine that runs `sam build` (macOS/Linux). On Windows it fails because of `pywin32`.
- The deploying role needs `s3:GetObject` on `AgentCodeBucket` (AgentCore reads the zip with those credentials).

## Files produced by this spec

Exact content. Create as is. The frontend paths (`policies.html, src/main-policies.js, src/policies-agent.js, src/styles/policies.css`) are created in **`web/` and in `pwa/`** following the rules in `02-web-portal/design.md` › "Rules for creating the block files" (the HTML and `main-*.js` in `web/` omit the PWA-specific parts). The `infra/**` paths are created only once.

#### `policies.html`

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
            <a href="chat.html" class="nav-item" data-tooltip="Chat">
              <svg class="nav-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span class="nav-label">Chat</span>
            </a>
          </li>
          <li>
            <a href="policies.html" class="nav-item nav-item--active" aria-current="page" data-tooltip="IAM Policies">
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

    <main class="content-area" id="contentArea">
      <section id="section-policies" class="content-section" aria-label="IAM policy generator">
        <!-- initPoliciesAgent() injects the full panel here -->
      </section>
    </main>

  </div>

  <script type="module" src="/src/main-policies.js"></script>
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

#### `src/main-policies.js`

````javascript
/**
 * main-policies.js — Entry point of policies.html.
 */
import "./styles/login.css";
import "./styles/dashboard.css";
import "./styles/policies.css";
import "./styles/pwa.css";
import { initDashboardPage } from "./pages/dashboard.js";
import { initPoliciesAgent } from "./policies-agent.js";

function bootstrap() {
  initDashboardPage();
  initPoliciesAgent();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
````

#### `src/policies-agent.js`

````javascript
/**
 * policies-agent.js
 * IAM policy generator: form → API (proxy Lambda → AgentCore Runtime) → JSON.
 * Mounted inside the content-area of policies.html (#section-policies).
 *
 * API contract (POST VITE_POLICY_API_URL, public API):
 *   request:  { prompt, sessionId }
 *   response: { message, policy, s3_key, s3_url, timestamp }
 */

import { CONFIG, requireConfig } from "./config.js";
import { postJson } from "./shared/api.js";

// ─────────────────────────────────────────────
// Panel HTML (injected into #section-policies)
// ─────────────────────────────────────────────

const POLICY_HTML = `
<h1>IAM policy generator</h1>
<div class="pol-workspace">

  <section class="pol-panel pol-panel-input" aria-label="Configure policy">
    <div class="pol-panel-header"><h2 class="pol-panel-title">Configure policy</h2></div>

    <div class="pol-form-group">
      <label class="pol-label" for="polService">AWS service</label>
      <input id="polService" class="pol-input" type="text" placeholder="e.g. S3, Lambda, DynamoDB…" autocomplete="off" spellcheck="false">
    </div>

    <div class="pol-form-group">
      <label class="pol-label" for="polActions">Required actions</label>
      <input id="polActions" class="pol-input" type="text" placeholder="e.g. read, write, delete" autocomplete="off" spellcheck="false">
    </div>

    <div class="pol-form-group">
      <label class="pol-label" for="polContext">Additional context <span class="pol-label-optional">(optional)</span></label>
      <textarea id="polContext" class="pol-textarea" rows="4" placeholder="e.g. only for objects with the /uploads prefix, restrict to region us-east-1…"></textarea>
    </div>

    <fieldset class="pol-form-group pol-fieldset">
      <legend class="pol-label">Permission level</legend>
      <div class="pol-radio-group">
        <label class="pol-radio-option">
          <input type="radio" name="polLevel" value="least-privilege" checked>
          <span class="pol-radio-custom"></span><span class="pol-radio-label">Least privilege</span>
        </label>
        <label class="pol-radio-option">
          <input type="radio" name="polLevel" value="standard">
          <span class="pol-radio-custom"></span><span class="pol-radio-label">Standard</span>
        </label>
        <label class="pol-radio-option">
          <input type="radio" name="polLevel" value="broad">
          <span class="pol-radio-custom"></span><span class="pol-radio-label">Broad</span>
        </label>
      </div>
    </fieldset>

    <div class="pol-btn-row">
      <button id="polGenerateBtn" type="button" class="pol-btn-generate" disabled>
        <span class="pol-btn-text">Generate policy</span>
        <span class="pol-btn-spinner" aria-hidden="true"></span>
      </button>
      <button id="polClearBtn" type="button" class="pol-btn-clear" aria-label="Clear form" title="Clear for a new request">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
          <path d="M2 2L13 13M13 2L2 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <div id="polStatus" class="pol-status-msg" role="status" aria-live="polite"></div>
  </section>

  <section class="pol-panel pol-panel-output" id="polOutputPanel" aria-label="Generated policy">
    <div class="pol-panel-header">
      <h2 class="pol-panel-title">Generated policy</h2>
      <div class="pol-output-actions" id="polOutputActions" hidden>
        <button type="button" class="pol-btn-action" id="polCopyBtn" title="Copy to clipboard"><span>Copy</span></button>
        <button type="button" class="pol-btn-action" id="polDownloadBtn" title="Download JSON"><span>Download</span></button>
      </div>
    </div>

    <div class="pol-output-empty" id="polEmpty">
      <p class="pol-empty-text">The policy will appear here</p>
      <p class="pol-empty-subtext">Describe the service and the actions you need</p>
    </div>

    <div class="pol-output-code-wrap" id="polCodeWrap" hidden>
      <pre class="pol-output-code"><code id="polCode"></code></pre>
    </div>

    <div class="pol-s3-confirm" id="polS3" hidden>
      <span id="polS3Text"></span>
      <a id="polS3Link" href="#" target="_blank" rel="noopener noreferrer" hidden>Open in S3</a>
    </div>
  </section>

</div>
`;

// ─────────────────────────────────────────────
// Pure utilities
// ─────────────────────────────────────────────

const LEVEL_TEXT = {
  "least-privilege": "least privilege (only the strictly necessary actions, specific resources)",
  "standard":        "standard permissions for the given service",
  "broad":           "broad permissions on the service (use with caution)",
};

function buildPrompt({ service, actions, context, level }) {
  return [
    `Generate an AWS IAM permissions policy for the ${service} service.`,
    `Required actions: ${actions}.`,
    `Privilege level: ${LEVEL_TEXT[level]}.`,
    context ? `Additional context: ${context}.` : "",
    "Respond ONLY with the IAM policy JSON (AWS format) in a ```json block, with no explanation.",
  ].filter(Boolean).join(" ");
}

/**
 * Serializes a policy with the canonical AWS order:
 *   root: Version → Statement · statement: Sid → Effect → Principal → Action → Resource → Condition
 */
function sortedStringify(data, indent = 2) {
  const ROOT_ORDER = ["Version", "Statement"];
  const STATEMENT_ORDER = ["Sid", "Effect", "Principal", "Action", "Resource", "Condition"];

  function orderObject(obj, keyOrder) {
    const ordered = {};
    keyOrder.forEach((k) => { if (k in obj) ordered[k] = obj[k]; });
    Object.keys(obj).sort().forEach((k) => { if (!(k in ordered)) ordered[k] = obj[k]; });
    return ordered;
  }

  function replacer(_key, value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if ("Version" in value || "Statement" in value) return orderObject(value, ROOT_ORDER);
      if ("Effect" in value || "Action" in value || "Resource" in value) return orderObject(value, STATEMENT_ORDER);
    }
    return value;
  }
  return JSON.stringify(data, replacer, indent);
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Light JSON coloring (the text is escaped before inserting spans). */
function colorizeJSON(raw) {
  return escapeHtml(raw)
    .replace(/&quot;/g, '"')
    .replace(/([{}[\]])/g, '<span class="pol-punct">$1</span>')
    .replace(/"([^"]+)"(\s*:)/g, '<span class="pol-key">"$1"</span>$2')
    .replace(/:\s*"([^"]*)"/g, (m, val) => m.replace(`"${val}"`, `<span class="pol-str">"${val}"</span>`))
    .replace(/\b(true|false|null)\b/g, '<span class="pol-bool">$1</span>');
}

function sessionId() {
  return "sess_" + crypto.randomUUID().replace(/-/g, "");
}

// ─────────────────────────────────────────────
// API
// ─────────────────────────────────────────────

async function callAgent(params) {
  requireConfig("POLICY_API_URL");

  const data = await postJson(CONFIG.POLICY_API_URL, {
    prompt: buildPrompt(params),
    sessionId: sessionId(),
  });

  if (data.policy) return data;

  // Fallback: the agent sometimes responds with the JSON inside a ```json block
  if (typeof data.message === "string") {
    const match = data.message.match(/```json\s*([\s\S]*?)```/);
    if (match) {
      try { return { ...data, policy: JSON.parse(match[1].trim()) }; } catch { /* no policy */ }
    }
  }
  throw new Error(data.error || "Unexpected response from the agent.");
}

// ─────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────

export function initPoliciesAgent() {
  const section = document.getElementById("section-policies");
  if (!section) return;
  section.innerHTML = POLICY_HTML;

  const $ = (id) => document.getElementById(id);
  const serviceInput = $("polService");
  const actionsInput = $("polActions");
  const contextInput = $("polContext");
  const generateBtn  = $("polGenerateBtn");
  const clearBtn     = $("polClearBtn");
  const statusEl     = $("polStatus");
  const emptyEl      = $("polEmpty");
  const codeWrap     = $("polCodeWrap");
  const codeEl       = $("polCode");
  const actionsEl    = $("polOutputActions");
  const copyBtn      = $("polCopyBtn");
  const downloadBtn  = $("polDownloadBtn");
  const outputPanel  = $("polOutputPanel");
  const s3El         = $("polS3");
  const s3Text       = $("polS3Text");
  const s3Link       = $("polS3Link");

  let generatedPolicy = null;
  let typewriterTimer = null;

  const levelValue = () => document.querySelector('input[name="polLevel"]:checked').value;
  const updateGenerateState = () => {
    generateBtn.disabled = !(serviceInput.value.trim() && actionsInput.value.trim());
  };

  function setStatus(message, type = "error") {
    statusEl.textContent = message;
    statusEl.classList.toggle("pol-success", type === "success");
  }

  function setFormDisabled(disabled) {
    [serviceInput, actionsInput, contextInput, clearBtn].forEach((el) => { el.disabled = disabled; });
    document.querySelectorAll('input[name="polLevel"]').forEach((r) => { r.disabled = disabled; });
  }

  function setLoading(on) {
    generateBtn.classList.toggle("pol-loading", on);
    generateBtn.disabled = on;
  }

  /** Typewriter effect over the already-colored JSON (never cuts a tag). */
  function renderPolicy(policy) {
    const colored = colorizeJSON(sortedStringify(policy));
    emptyEl.hidden = true;
    codeWrap.hidden = false;
    codeEl.innerHTML = "";
    if (typewriterTimer) clearInterval(typewriterTimer);

    const tokens = colored.match(/<[^>]+>|&[a-z]+;|[\s\S]/g) ?? [];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) { codeEl.innerHTML = colored; return; }

    let idx = 0;
    let html = "";
    typewriterTimer = setInterval(() => {
      // Advance until one visible character is consumed (tags count as 0)
      while (idx < tokens.length) {
        const tk = tokens[idx++];
        html += tk;
        if (!tk.startsWith("<")) break;
      }
      if (idx >= tokens.length) {
        clearInterval(typewriterTimer);
        codeEl.innerHTML = html;
        return;
      }
      codeEl.innerHTML = html + '<span class="pol-cursor"></span>';
      codeWrap.scrollTop = codeWrap.scrollHeight;
    }, 6);
  }

  function showS3(data) {
    if (!data.s3_key) { s3El.hidden = true; return; }
    s3Text.textContent = `Saved to S3: ${data.s3_key}`;
    if (data.s3_url) {
      s3Link.href = data.s3_url;
      s3Link.hidden = false;
    } else {
      s3Link.hidden = true;
    }
    s3El.hidden = false;
  }

  [serviceInput, actionsInput].forEach((el) => el.addEventListener("input", updateGenerateState));

  generateBtn.addEventListener("click", async () => {
    const service = serviceInput.value.trim();
    const actions = actionsInput.value.trim();
    if (!service || !actions) return;

    setLoading(true);
    setFormDisabled(true);
    setStatus("");
    s3El.hidden = true;

    try {
      const data = await callAgent({ service, actions, context: contextInput.value.trim(), level: levelValue() });
      generatedPolicy = data.policy;
      renderPolicy(generatedPolicy);
      actionsEl.hidden = false;
      outputPanel.classList.add("pol-has-content");
      showS3(data);
    } catch (err) {
      console.error("[Policies] Error invoking the agent:", err);
      setStatus(err.message || "Error generating the policy. Please try again.");
    } finally {
      setLoading(false);
      setFormDisabled(false);
      updateGenerateState();
    }
  });

  copyBtn.addEventListener("click", async () => {
    if (!generatedPolicy) return;
    try {
      await navigator.clipboard.writeText(sortedStringify(generatedPolicy));
      copyBtn.querySelector("span").textContent = "Copied";
      setTimeout(() => { copyBtn.querySelector("span").textContent = "Copy"; }, 2000);
    } catch {
      setStatus("Could not copy to the clipboard.");
    }
  });

  downloadBtn.addEventListener("click", () => {
    if (!generatedPolicy) return;
    const slug = serviceInput.value.trim().toLowerCase().replace(/\s+/g, "-") || "policy";
    const blob = new Blob([sortedStringify(generatedPolicy)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `iam-policy-${slug}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  clearBtn.addEventListener("click", () => {
    serviceInput.value = "";
    actionsInput.value = "";
    contextInput.value = "";
    document.querySelector('input[name="polLevel"][value="least-privilege"]').checked = true;
    generatedPolicy = null;
    if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }
    codeEl.innerHTML = "";
    codeWrap.hidden = true;
    emptyEl.hidden = false;
    actionsEl.hidden = true;
    s3El.hidden = true;
    setStatus("");
    outputPanel.classList.remove("pol-has-content");
    generateBtn.disabled = true;
  });

  console.info("[Policies] Initialized.");
}
````

#### `src/styles/policies.css`

````css
/* policies.css — styles for the IAM policy generator.
 * All classes carry the pol- prefix so they do not collide with dashboard.css.
 * Only uses variables from tokens.css (never hard-coded colors or fonts). */

#section-policies [hidden] { display: none !important; }

/* ─── Workspace layout ──────────────────────────────────── */
.pol-workspace {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 24px;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  padding: 0;
  align-items: stretch;
}

/* ─── Panels ────────────────────────────────────────────── */
.pol-panel {
  background: var(--card);
  border: 1px solid var(--card-border);
  border-radius: var(--radius);
  overflow: hidden;
}

.pol-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-bottom: 1px solid var(--card-border);
}

.pol-panel-title {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Input panel body */
.pol-panel-input .pol-form-group {
  padding: 18px 22px 0;
}

.pol-panel-input .pol-btn-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin: 18px 22px 0;
}

.pol-panel-input .pol-btn-generate {
  flex: 1;
}

.pol-panel-input .pol-status-msg {
  margin: 8px 22px 18px;
}

/* ─── Form elements ─────────────────────────────────────── */
.pol-label {
  display: block;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 7px;
  letter-spacing: 0.02em;
}

.pol-label-optional {
  font-weight: 400;
  opacity: 0.6;
}

.pol-input,
.pol-textarea {
  width: 100%;
  background: var(--input-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: var(--font-body);
  font-size: 13.5px;
  padding: 10px 13px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  resize: none;
}

.pol-input::placeholder,
.pol-textarea::placeholder {
  color: var(--input-placeholder);
}

.pol-input:focus,
.pol-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

/* ─── Radio group ───────────────────────────────────────── */
.pol-radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pol-radio-option {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.pol-radio-option input[type="radio"] {
  display: none;
}

.pol-radio-custom {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--card-border);
  background: var(--input-bg);
  flex-shrink: 0;
  transition: border-color 0.15s;
  position: relative;
}

.pol-radio-option input[type="radio"]:checked + .pol-radio-custom {
  border-color: var(--accent);
  background: var(--accent-dim);
}

.pol-radio-option input[type="radio"]:checked + .pol-radio-custom::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
}

.pol-radio-label {
  font-size: 13px;
  color: var(--text);
}

/* ─── Generate button ───────────────────────────────────── */
.pol-btn-generate {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-body);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.2s, transform 0.1s;
  position: relative;
}

.pol-btn-generate:hover:not(:disabled) {
  background: var(--accent-hover);
}

.pol-btn-generate:active:not(:disabled) {
  transform: scale(0.99);
}

.pol-btn-generate:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.pol-btn-generate.pol-loading .pol-btn-text {
  opacity: 0;
}

.pol-btn-spinner {
  display: none;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(128, 128, 128, 0.3);
  border-top-color: var(--on-accent);
  border-radius: 50%;
  animation: pol-spin 0.7s linear infinite;
  position: absolute;
  top: 50%;
  left: 50%;
  margin-top: -8px;
  margin-left: -8px;
}

.pol-btn-generate.pol-loading .pol-btn-spinner {
  display: block;
}

/* ─── Clear button ──────────────────────────────────────── */
.pol-btn-clear {
  flex-shrink: 0;
  width: 40px;
  padding: 0;
  border: 1px solid var(--card-border);
  border-radius: var(--radius-sm);
  background: var(--input-bg);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.pol-btn-clear:hover:not(:disabled) {
  color: var(--error);
  border-color: var(--error);
  background: color-mix(in srgb, var(--error) 10%, transparent);
}

.pol-btn-clear:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

@keyframes pol-spin {
  to { transform: rotate(360deg); }
}

/* ─── Status message ────────────────────────────────────── */
.pol-status-msg {
  font-size: 12px;
  min-height: 16px;
  color: var(--error);
}

/* ─── Output panel ──────────────────────────────────────── */
.pol-panel-output {
  display: flex;
  flex-direction: column;
  transition: border-color 0.4s, box-shadow 0.4s;
}

.pol-panel-output.pol-has-content {
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent), 0 0 32px color-mix(in srgb, var(--accent) 6%, transparent);
}

.pol-output-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pol-btn-action {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  background: var(--input-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.pol-btn-action:hover {
  color: var(--text);
  border-color: var(--accent);
  background: var(--accent-dim);
}

/* ─── Empty state ───────────────────────────────────────── */
.pol-output-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
  text-align: center;
}

.pol-empty-text {
  font-size: 14px;
  color: var(--text-muted);
}

.pol-empty-subtext {
  font-size: 12px;
  color: var(--text-muted);
  opacity: 0.55;
  max-width: 240px;
}

/* ─── Code output ───────────────────────────────────────── */
.pol-output-code-wrap {
  flex: 1;
  overflow: auto;
  padding: 22px;
}

.pol-output-code {
  margin: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--text);
  white-space: pre;
  overflow-x: auto;
}

/* Syntax-style coloring via spans (added by JS) */
.pol-output-code .pol-key   { color: var(--syntax-key); }
.pol-output-code .pol-str   { color: var(--syntax-str); }
.pol-output-code .pol-bool  { color: var(--syntax-bool); }
.pol-output-code .pol-punct { color: var(--text-muted); }

/* Typewriter cursor */
.pol-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--accent);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: pol-blink 1s step-end infinite;
}

@keyframes pol-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

/* ─── S3 confirmation ───────────────────────────────────── */
.pol-s3-confirm {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 22px;
  background: color-mix(in srgb, var(--success) 8%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
  font-size: 12px;
  color: var(--success);
  font-family: var(--font-mono);
}

/* ─── Responsive ────────────────────────────────────────── */
@media (max-width: 768px) {
  .pol-workspace {
    grid-template-columns: 1fr;
    padding: 20px 16px;
  }

  .pol-panel-output {
    min-height: 360px;
  }

  }

/* ─── Reduced motion ────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .pol-btn-spinner,
  .pol-cursor {
    animation: none;
  }
}

.pol-fieldset { border: 0; margin: 0; min-width: 0; }
.pol-fieldset legend { padding: 0; }
.pol-status-msg.pol-success { color: var(--success); }
.pol-s3-confirm { flex-wrap: wrap; }
.pol-s3-confirm a { color: var(--accent); text-decoration: underline; }
````

#### `infra/agent/saved_state.py`

````python
"""
Shared state for the S3 save during an invocation.

Strands reloads each tool's file as a NEW module (it appears as
`s3_save` in addition to `tools.s3_save`), and each copy has its own
global variables. That is why the state lives in this module, which both copies
import by its real name (`saved_state`) and share.
"""

last_saved: dict | None = None   # result of the last successful save
last_body: str | None = None     # saved content (to avoid duplicating the same file)


def reset() -> None:
    """Called by agent.py at the start of each invocation."""
    global last_saved, last_body
    last_saved, last_body = None, None
````

#### `infra/agent/agent.py`

````python
"""
IAM Policy Agent — FastAPI server for Amazon Bedrock AgentCore Runtime.

The runtime expects:
  POST /invocations  → agent invocation
  GET  /ping         → health check

Port: 8080, architecture: linux/arm64
"""

import json
import re
import os
from datetime import datetime, timezone

from fastapi          import FastAPI, HTTPException
from pydantic         import BaseModel
from typing           import Dict, Any

from strands          import Agent
from strands.models   import BedrockModel
from tools            import generate_iam_policy, validate_iam_policy, save_to_s3
from tools.validate   import check_policy
from tools.s3_save    import save_policy
import saved_state


# ─── System prompt ───────────────────────────────────────────────────────────
SYSTEM_PROMPT = """
You are an AWS security expert specialized in IAM policies.
Your job is to generate correct, secure, production-ready IAM policies.

When the user describes a service and the actions they need, you must:

1. Call generate_iam_policy with the correct parameters extracted from the message.
   - Infer the AWS service name (e.g. "bucket" → "s3").
   - Convert natural-language actions into IAM terms whenever possible.
   - If the user does not specify a privilege level, use "least-privilege".
   - If the user does not specify a resource ARN, use "*" and warn about it in your response.

2. Call validate_iam_policy with the generated policy and the privilege level.
   - If validation fails (valid: false), fix the errors and generate again.
   - If there are warnings, mention them to the user in your final response.

3. Only after validation succeeds (valid: true), call save_to_s3.
   - It is MANDATORY to save every valid policy, even if the user asks for "just the JSON".
   - Never save to S3 a policy that has not passed validation.

4. Respond to the user with:
   - The IAM policy in JSON format, inside a ```json block.
   - If the user asks for only the JSON or a brief response, respond ONLY with that block:
     the server already returns the S3 path and the download URL on its own.
   - A summary of the included actions and why.
   - The validation warnings, if any.
   - The presigned URL to download the file.
   - The S3 key where it was saved.

Be concise. Do not explain basic IAM concepts unless the user asks.
If the request is ambiguous (e.g. "give me access to everything"), ask for more context before generating.
Never generate policies with "Action": "*" and "Resource": "*" at the same time.
""".strip()


# ─── Strands agent (lazy init — built on the first invocation) ────────────────
_agent_instance: Agent | None = None


def _get_agent() -> Agent:
    global _agent_instance
    if _agent_instance is None:
        model = BedrockModel(
            model_id    = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-sonnet-4-5"),
            region_name = os.environ.get("AWS_REGION", "us-east-1"),
        )
        _agent_instance = Agent(
            model         = model,
            system_prompt = SYSTEM_PROMPT,
            tools         = [generate_iam_policy, validate_iam_policy, save_to_s3],
        )
    return _agent_instance


# ─── FastAPI app ──────────────────────────────────────────────────────────────
app = FastAPI(title="IAM Policy Agent", version="1.0.0")


class InvocationRequest(BaseModel):
    input: Dict[str, Any]


class InvocationResponse(BaseModel):
    output: Dict[str, Any]


@app.post("/invocations", response_model=InvocationResponse)
async def invoke_agent(request: InvocationRequest):
    """
    Main endpoint called by AgentCore Runtime.
    Expected payload: { "input": { "prompt": "..." } }
    """
    prompt = request.input.get("prompt", "").strip()
    if not prompt:
        raise HTTPException(
            status_code=400,
            detail="The 'prompt' field inside 'input' is required.",
        )

    saved_state.reset()  # last_saved is filled if the model calls save_to_s3 in this invocation
    try:
        agent         = _get_agent()
        result        = agent(prompt)
        response_text = str(result)
    except Exception as exc:
        import traceback
        tb = traceback.format_exc()
        print(f"ERROR in /invocations:\n{tb}", flush=True)
        raise HTTPException(
            status_code=500,
            detail=f"Agent error: {str(exc)}",
        )

    policy = _extract_json(response_text)
    s3_key = _extract_pattern(response_text, r"policies/[^\s\"']+\.json")
    s3_url = _extract_pattern(
        response_text,
        r"https://[^\s\"']+\.amazonaws\.com[^\s\"']+",
    )

    # Guaranteed save: if the model already saved (save_to_s3) that result is used; if not,
    # the server validates and saves the policy itself (the flow does not depend on the LLM obeying).
    saved = saved_state.last_saved
    if policy and not saved:
        saved = _autosave(prompt, policy)
    if saved:
        s3_key = saved["key"]
        s3_url = saved["presigned_url"]

    return InvocationResponse(
        output={
            "message":   response_text,
            "policy":    policy,
            "s3_key":    s3_key,
            "s3_url":    s3_url,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )


@app.get("/ping")
async def ping():
    """Health check required by AgentCore Runtime."""
    return {"status": "healthy"}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _extract_json(text: str) -> dict | None:
    """Extracts the first valid JSON block from the agent's text."""
    for pattern in [r"```json\s*([\s\S]*?)```", r"```\s*([\s\S]*?)```"]:
        match = re.search(pattern, text)
        if match:
            try:
                return json.loads(match.group(1).strip())
            except json.JSONDecodeError:
                continue

    brace_start = text.find("{")
    if brace_start != -1:
        for end in range(len(text), brace_start, -1):
            try:
                return json.loads(text[brace_start:end])
            except json.JSONDecodeError:
                continue

    return None


def _infer_level(prompt: str) -> str:
    """Infers the privilege level from the prompt text (default: least-privilege)."""
    text = prompt.lower()
    if "broad" in text:
        return "broad"
    if "standard" in text:
        return "standard"
    return "least-privilege"


def _infer_service(policy: dict) -> str:
    """Takes the prefix of the first action (e.g. 's3:GetObject' → 's3')."""
    try:
        action = policy["Statement"][0]["Action"]
        action = action[0] if isinstance(action, list) else action
        prefix = str(action).split(":")[0].strip().lower()
        if prefix and prefix != "*":
            return prefix
    except (KeyError, IndexError, TypeError):
        pass
    return "policy"


def _autosave(prompt: str, policy: dict) -> dict | None:
    """Validates and saves the policy to S3. Returns None (without breaking the response) if it cannot."""
    try:
        level = _infer_level(prompt)
        check = check_policy(policy, level)
        if not check["valid"]:
            print(f"AUTOSAVE skipped, invalid policy: {check['errors']}", flush=True)
            return None
        return save_policy(policy, _infer_service(policy), level, check["summary"])
    except Exception as exc:
        print(f"ERROR in autosave: {exc!r}", flush=True)
        return None


def _extract_pattern(text: str, pattern: str) -> str | None:
    match = re.search(pattern, text)
    return match.group(0) if match else None


# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
````

#### `infra/agent/requirements.txt`

````text
strands-agents==0.1.9
boto3==1.38.42
fastapi==0.115.12
uvicorn[standard]==0.34.3
pydantic==2.12.5
````

#### `infra/agent/tools/__init__.py`

````python
from .generate import generate_iam_policy
from .validate import validate_iam_policy
from .s3_save  import save_to_s3

__all__ = ["generate_iam_policy", "validate_iam_policy", "save_to_s3"]
````

#### `infra/agent/tools/generate.py`

````python
"""
Tool: generate_iam_policy
Builds the JSON of an AWS IAM policy from the user's
parameters. The agent calls this tool when it has
enough information to put the policy together.
"""

import json
from strands import tool

# Service map → IAM action prefix
SERVICE_PREFIX_MAP = {
    "s3":           "s3",
    "lambda":       "lambda",
    "dynamodb":     "dynamodb",
    "ec2":          "ec2",
    "rds":          "rds",
    "sqs":          "sqs",
    "sns":          "sns",
    "cloudwatch":   "cloudwatch",
    "logs":         "logs",
    "iam":          "iam",
    "kms":          "kms",
    "ssm":          "ssm",
    "bedrock":      "bedrock",
    "glue":         "glue",
    "athena":       "athena",
    "stepfunctions": "states",
    "eventbridge":  "events",
    "apigateway":   "execute-api",
}

# Predefined actions by privilege level and service
ACTIONS_BY_LEVEL = {
    "least-privilege": {
        "s3":          ["s3:GetObject", "s3:PutObject"],
        "lambda":      ["lambda:InvokeFunction"],
        "dynamodb":    ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"],
        "ec2":         ["ec2:DescribeInstances"],
        "sqs":         ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage"],
        "sns":         ["sns:Publish"],
        "cloudwatch":  ["cloudwatch:PutMetricData"],
        "logs":        ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        "ssm":         ["ssm:GetParameter", "ssm:GetParameters"],
        "bedrock":     ["bedrock:InvokeModel"],
        "kms":         ["kms:Decrypt", "kms:GenerateDataKey"],
    },
    "standard": {
        "s3":          ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
        "lambda":      ["lambda:InvokeFunction", "lambda:GetFunction"],
        "dynamodb":    ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
                        "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan"],
        "ec2":         ["ec2:DescribeInstances", "ec2:StartInstances", "ec2:StopInstances"],
        "sqs":         ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage",
                        "sqs:GetQueueAttributes", "sqs:GetQueueUrl"],
        "sns":         ["sns:Publish", "sns:Subscribe", "sns:ListTopics"],
        "cloudwatch":  ["cloudwatch:PutMetricData", "cloudwatch:GetMetricStatistics",
                        "cloudwatch:ListMetrics"],
        "logs":        ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents",
                        "logs:DescribeLogGroups", "logs:DescribeLogStreams"],
        "ssm":         ["ssm:GetParameter", "ssm:GetParameters", "ssm:PutParameter"],
        "bedrock":     ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        "kms":         ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:DescribeKey"],
    },
    "broad": {
        # For the broad level a wildcard with the service prefix is used
        "_use_wildcard": True,
    },
}


@tool
def generate_iam_policy(
    service: str,
    actions: list[str],
    permission_level: str,
    resource_arn: str = "*",
    conditions: dict = None,
    region: str = "*",
    account_id: str = "*",
) -> dict:
    """
    Generates the JSON of an AWS IAM policy.

    Args:
        service:          AWS service name (e.g. 's3', 'lambda', 'dynamodb').
        actions:          List of required actions in natural language or as
                          IAM prefixes (e.g. ['read', 'write'] or ['s3:GetObject']).
        permission_level: Privilege level: 'least-privilege', 'standard' or 'broad'.
        resource_arn:     ARN of the specific resource. Defaults to '*'.
        conditions:       Dictionary of additional IAM conditions (optional).
        region:           AWS region for the resource ARN (optional).
        account_id:       AWS account ID (optional).

    Returns:
        Dictionary with the IAM policy in AWS format and generation metadata.
    """
    service_key = service.lower().strip()
    prefix      = SERVICE_PREFIX_MAP.get(service_key, service_key)

    # Resolve actions according to level
    if permission_level == "broad":
        resolved_actions = [f"{prefix}:*"]
    else:
        level_actions = ACTIONS_BY_LEVEL.get(permission_level, {})
        # If the service has predefined actions for this level, use them as a base
        base_actions = level_actions.get(service_key, [])

        # Resolve the user's actions (they may come in natural language or as IAM actions)
        resolved_actions = _resolve_actions(actions, prefix, base_actions)

    # Build statement
    statement = {
        "Sid":      f"{service.capitalize()}Access",
        "Effect":   "Allow",
        "Action":   resolved_actions,
        "Resource": resource_arn,
    }

    if conditions:
        statement["Condition"] = conditions

    policy = {
        "Version":   "2012-10-17",
        "Statement": [statement],
    }

    return {
        "policy":           policy,
        "service":          service,
        "prefix":           prefix,
        "permission_level": permission_level,
        "actions_count":    len(resolved_actions),
        "has_wildcard":     any("*" in a for a in resolved_actions),
    }


def _resolve_actions(requested: list[str], prefix: str, base_actions: list[str]) -> list[str]:
    """
    Combines the level's base actions with those requested by the user.
    If the action is already in IAM format (prefix:Action) it is used directly.
    If not, it is added as prefix:* so the agent or the validation can refine it.
    """
    resolved = set(base_actions)

    for action in requested:
        action = action.strip()
        if ":" in action:
            # Already in IAM format
            resolved.add(action)
        else:
            # Natural language → add as a wildcard for the service
            # The validate tool will refine it or the agent will ask for more detail
            resolved.add(f"{prefix}:*")
            break  # one wildcard is a sufficient signal for validate

    return sorted(resolved)
````

#### `infra/agent/tools/s3_save.py`

````python
"""
Tool: save_to_s3
Saves the validated IAM policy to an S3 bucket and generates
a presigned URL for direct download from the frontend.
"""

import json
import os
import re
import unicodedata
import boto3

from datetime import datetime, timezone
from strands  import tool
import saved_state                       # shared state (see saved_state.py)


S3_BUCKET      = os.environ.get("POLICIES_BUCKET", "iam-policies-bucket")
PRESIGNED_TTL  = int(os.environ.get("PRESIGNED_TTL_SECONDS", 3600))  # 1 hour

def _ascii(text: str, limit: int = 256) -> str:
    """S3 only accepts ASCII in metadata: strips accents and non-ASCII characters."""
    plain = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")
    return plain.strip()[:limit]


def _order_policy(policy: dict) -> dict:
    """
    Reorders the keys of an IAM policy according to the canonical AWS order:
      Root level:     Version → Statement
      Each Statement: Sid → Effect → Principal → Action → Resource → Condition
    Any extra key goes at the end, alphabetically.
    """
    ROOT_ORDER      = ["Version", "Statement"]
    STATEMENT_ORDER = ["Sid", "Effect", "Principal", "Action", "Resource", "Condition"]

    def _reorder(obj: dict, key_order: list) -> dict:
        ordered = {k: obj[k] for k in key_order if k in obj}
        for k in sorted(obj):
            if k not in ordered:
                ordered[k] = obj[k]
        return ordered

    result = _reorder(policy, ROOT_ORDER)
    if "Statement" in result and isinstance(result["Statement"], list):
        result["Statement"] = [
            _reorder(stmt, STATEMENT_ORDER) if isinstance(stmt, dict) else stmt
            for stmt in result["Statement"]
        ]
    return result


def save_policy(
    policy: dict,
    service: str,
    permission_level: str,
    validation_summary: str = "",
) -> dict:
    """
    Saves an IAM policy to S3 and returns the key and the presigned URL.

    Plain function (no @tool): used by both the `save_to_s3` tool and agent.py,
    which saves the validated policy even if the model does not call the tool.

    The policy is saved under the path:
        policies/{service}/{YYYY-MM-DD}/{timestamp}.json
    """
    s3     = boto3.client("s3")
    now    = datetime.now(timezone.utc)
    date   = now.strftime("%Y-%m-%d")
    ts     = now.strftime("%Y%m%dT%H%M%SZ")

    service_slug = re.sub(r"[^a-z0-9._-]+", "-", _ascii(service).lower()).strip("-") or "policy"
    key          = f"policies/{service_slug}/{date}/{ts}.json"

    policy_body = json.dumps(_order_policy(policy), indent=2, ensure_ascii=False)

    # The model often calls the tool twice with the same policy: do not duplicate the file.
    if saved_state.last_saved is not None and saved_state.last_body == policy_body:
        return saved_state.last_saved

    # Save to S3 with metadata
    s3.put_object(
        Bucket      = S3_BUCKET,
        Key         = key,
        Body        = policy_body.encode("utf-8"),
        ContentType = "application/json",
        Metadata    = {
            "service":          service_slug,
            "permission-level": _ascii(permission_level) or "n/a",
            "generated-at":     now.isoformat(),
            "validation":       _ascii(validation_summary) or "n/a",
        },
    )

    # Generate presigned URL for download
    presigned_url = s3.generate_presigned_url(
        ClientMethod = "get_object",
        Params       = {"Bucket": S3_BUCKET, "Key": key},
        ExpiresIn    = PRESIGNED_TTL,
    )

    saved_state.last_body  = policy_body
    saved_state.last_saved = {
        "saved":         True,
        "bucket":        S3_BUCKET,
        "key":           key,
        "presigned_url": presigned_url,
        "expires_in":    PRESIGNED_TTL,
        "size_bytes":    len(policy_body.encode("utf-8")),
        "saved_at":      now.isoformat(),
    }
    return saved_state.last_saved


@tool
def save_to_s3(
    policy: dict,
    service: str,
    permission_level: str,
    validation_summary: str = "",
) -> dict:
    """
    Saves an IAM policy to S3 and returns the key and presigned URL.

    The policy is saved under the path:
        policies/{service}/{YYYY-MM-DD}/{timestamp}.json

    The object includes metadata in the S3 headers for traceability.

    Args:
        policy:             Dictionary with the IAM policy ready to save.
        service:            Name of the AWS service the policy applies to.
        permission_level:   Privilege level of the generated policy.
        validation_summary: Summary of the validation result (optional).

    Returns:
        Dictionary with key, bucket, presigned_url and metadata of the saved object.
    """
    return save_policy(policy, service, permission_level, validation_summary)
````

#### `infra/agent/tools/validate.py`

````python
"""
Tool: validate_iam_policy
Validates that the generated IAM policy complies with the AWS schema,
detects dangerous wildcards and applies the rules of the requested
privilege level.
"""

from strands import tool


# High-risk actions that must never appear in least-privilege
HIGH_RISK_ACTIONS = {
    "iam:*",
    "iam:CreateUser",
    "iam:DeleteUser",
    "iam:AttachUserPolicy",
    "iam:AttachRolePolicy",
    "iam:PutUserPolicy",
    "iam:PutRolePolicy",
    "iam:CreateAccessKey",
    "iam:DeleteAccessKey",
    "sts:AssumeRole",
    "organizations:*",
}

# Critical services where a wildcard is always high risk
CRITICAL_SERVICES = {"iam", "sts", "organizations", "kms"}


def check_policy(policy: dict, permission_level: str) -> dict:
    """
    Validates an IAM policy (plain function, no @tool).

    Used by both the `validate_iam_policy` tool and agent.py, which validates before
    saving to S3 the policy returned by the model.
    """
    errors   = []
    warnings = []
    policy   = dict(policy)  # copy so the original is not mutated

    # ── 1. Schema check ──────────────────────────────────────────
    if "Version" not in policy:
        errors.append("Missing 'Version' field. It must be '2012-10-17'.")

    if "Statement" not in policy or not isinstance(policy["Statement"], list):
        errors.append("Missing 'Statement' field or it is not a list.")
        return _result(policy, errors, warnings, valid=False)

    for idx, stmt in enumerate(policy["Statement"]):
        label = stmt.get("Sid", f"Statement[{idx}]")

        if "Effect" not in stmt:
            errors.append(f"{label}: Missing 'Effect' (must be 'Allow' or 'Deny').")

        if "Action" not in stmt:
            errors.append(f"{label}: Missing 'Action'.")

        if "Resource" not in stmt:
            errors.append(f"{label}: Missing 'Resource'.")

    if errors:
        return _result(policy, errors, warnings, valid=False)

    # ── 2. Action analysis ───────────────────────────────────────
    all_actions = []
    for stmt in policy["Statement"]:
        actions = stmt.get("Action", [])
        if isinstance(actions, str):
            actions = [actions]
        all_actions.extend(actions)

    has_full_wildcard = "*" in all_actions
    wildcarded_svcs   = [a for a in all_actions if a.endswith(":*")]
    critical_wildcards = [
        a for a in wildcarded_svcs
        if a.split(":")[0] in CRITICAL_SERVICES
    ]
    high_risk = [a for a in all_actions if a in HIGH_RISK_ACTIONS]

    # ── 3. Rules by level ────────────────────────────────────────
    if permission_level == "least-privilege":
        if has_full_wildcard:
            errors.append(
                "Level 'least-privilege' does not allow the global wildcard '*' in Action."
            )
        if wildcarded_svcs:
            errors.append(
                f"Level 'least-privilege' does not allow service wildcards: "
                f"{', '.join(wildcarded_svcs)}. Specify concrete actions."
            )
        if high_risk:
            errors.append(
                f"High-risk actions not allowed in 'least-privilege': "
                f"{', '.join(high_risk)}."
            )

    elif permission_level == "standard":
        if has_full_wildcard:
            warnings.append(
                "The global wildcard '*' in Action is unusual for level 'standard'. "
                "Consider specifying the actions."
            )
        if critical_wildcards:
            warnings.append(
                f"Wildcards on critical services for level 'standard': "
                f"{', '.join(critical_wildcards)}. Check whether this is intentional."
            )
        if high_risk:
            warnings.append(
                f"High-risk actions present: {', '.join(high_risk)}. "
                "Confirm they are necessary."
            )

    elif permission_level == "broad":
        # For broad we only warn about IAM/STS/Organizations
        if critical_wildcards:
            warnings.append(
                f"Wildcards on critical services detected: "
                f"{', '.join(critical_wildcards)}. "
                "Verify that the use case justifies it."
            )

    # ── 4. Resource check ───────────────────────────────────────
    for stmt in policy["Statement"]:
        resource = stmt.get("Resource", "")
        if isinstance(resource, str):
            resource = [resource]
        if permission_level == "least-privilege" and "*" in resource:
            warnings.append(
                f"Statement '{stmt.get('Sid', 'no Sid')}': Resource '*' with "
                "least-privilege is broad. Consider specifying the resource ARN."
            )

    valid = len(errors) == 0

    return _result(policy, errors, warnings, valid=valid)


@tool
def validate_iam_policy(policy: dict, permission_level: str) -> dict:
    """
    Validates an IAM policy generated by generate_iam_policy.

    Performs the following checks:
    1. Minimum schema required by AWS (Version, Statement, Effect, Action, Resource).
    2. Consistency of the privilege level vs. the actions present.
    3. Detection of dangerous wildcards.
    4. Critical services with excessive permissions.

    Args:
        policy:           Dictionary with the IAM policy ('policy' field of the
                          generate_iam_policy output).
        permission_level: Declared level: 'least-privilege', 'standard' or 'broad'.

    Returns:
        Dictionary with the validation result, list of warnings and
        the policy (possibly corrected).
    """
    return check_policy(policy, permission_level)


def _result(policy: dict, errors: list, warnings: list, valid: bool) -> dict:
    return {
        "valid":         valid,
        "errors":        errors,
        "warnings":      warnings,
        "error_count":   len(errors),
        "warning_count": len(warnings),
        "policy":        policy,
        "summary": (
            "Valid policy." if valid and not warnings
            else "Valid policy with warnings." if valid
            else f"Invalid policy: {len(errors)} error(s) found."
        ),
    }
````

#### `infra/custom_resource/handler.py`

````python
"""
Stack custom resources (the entire lifecycle stays inside CloudFormation).

Actions (ResourceProperties.Action):
  PackageAgent    — Takes the layer built by `sam build` (agent/ + arm64 dependencies
                    under python/), repackages it with agent.py at the root and
                    uploads it to the code bucket. Returns Bucket and Key.
  EmptyBucket     — On Delete empties the bucket (objects + versions + delete markers).
  RuntimeLogGroup — Creates/adopts the runtime's log group, sets retention and deletes it on Delete.
"""

import hashlib
import json
import logging
import os
import tempfile
import urllib.request
import zipfile

import boto3
from botocore.exceptions import ClientError

log = logging.getLogger()
log.setLevel(logging.INFO)

RUNTIME_LOG_PREFIX = "/aws/bedrock-agentcore/runtimes/"
LAYER_PREFIX = "python/"


# ─── Response to CloudFormation ────────────────────────────────────────────────

def send(event, context, status, physical_id, data=None, reason=""):
    body = json.dumps({
        "Status": status,
        "Reason": reason or f"See log stream {context.log_stream_name}",
        "PhysicalResourceId": physical_id,
        "StackId": event["StackId"],
        "RequestId": event["RequestId"],
        "LogicalResourceId": event["LogicalResourceId"],
        "Data": data or {},
    }).encode()
    req = urllib.request.Request(
        event["ResponseURL"], data=body, method="PUT",
        headers={"Content-Type": "", "Content-Length": str(len(body))})
    urllib.request.urlopen(req, timeout=30)


# ─── PackageAgent ──────────────────────────────────────────────────────────────

def _repackage(src_zip, dst_zip):
    """Copies the layer zip removing the python/ prefix (agent.py ends up at the root)."""
    with zipfile.ZipFile(src_zip) as zin, \
         zipfile.ZipFile(dst_zip, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            name = info.filename
            if not name.startswith(LAYER_PREFIX) or name == LAYER_PREFIX:
                continue
            name = name[len(LAYER_PREFIX):]
            if "__pycache__/" in name or name.endswith(".pyc"):
                continue
            new = zipfile.ZipInfo(name, date_time=info.date_time)
            mode = (info.external_attr >> 16) & 0o777
            if name.endswith("/"):
                new.external_attr = (0o040755 << 16) | 0x10
            else:
                new.external_attr = (0o100000 | (mode or 0o755)) << 16
            new.compress_type = zipfile.ZIP_DEFLATED
            zout.writestr(new, zin.read(info))


def package_agent(props, request_type, physical_id):
    bucket, prefix = props["Bucket"], props["KeyPrefix"].strip("/")
    if request_type == "Delete":
        # The previous zip is deleted when CFN replaces the resource; the whole
        # bucket is emptied by EmptyBucket when the stack is deleted.
        if physical_id.startswith(prefix + "/"):
            try:
                boto3.client("s3").delete_object(Bucket=bucket, Key=physical_id)
            except ClientError as exc:
                if exc.response["Error"]["Code"] != "NoSuchBucket":
                    raise
        return physical_id, {}

    layer = boto3.client("lambda").get_layer_version_by_arn(Arn=props["LayerVersionArn"])
    content = layer["Content"]
    digest = hashlib.sha256(content["CodeSha256"].encode()).hexdigest()[:16]
    key = f"{prefix}/agent-{digest}.zip"

    with tempfile.TemporaryDirectory() as tmp:
        src, dst = os.path.join(tmp, "layer.zip"), os.path.join(tmp, "agent.zip")
        with urllib.request.urlopen(content["Location"], timeout=120) as resp, open(src, "wb") as fh:
            while chunk := resp.read(1024 * 1024):
                fh.write(chunk)
        _repackage(src, dst)
        with zipfile.ZipFile(dst) as zf:
            if "agent.py" not in zf.namelist():
                raise RuntimeError("The package does not contain agent.py at the root")
        boto3.client("s3").upload_file(dst, bucket, key)

    log.info("Agent package: s3://%s/%s", bucket, key)
    return key, {"Bucket": bucket, "Key": key}


# ─── EmptyBucket ───────────────────────────────────────────────────────────────

def empty_bucket(props, request_type, physical_id):
    name = props["BucketName"]
    if request_type == "Delete":
        bucket = boto3.resource("s3").Bucket(name)
        try:
            bucket.object_versions.delete()
            bucket.objects.all().delete()
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "NoSuchBucket":
                raise
    return f"empty-{name}", {}


# ─── RuntimeLogGroup ───────────────────────────────────────────────────────────

def runtime_log_group(props, request_type, physical_id):
    logs = boto3.client("logs")
    if request_type == "Delete":
        if physical_id.startswith(RUNTIME_LOG_PREFIX):
            try:
                logs.delete_log_group(logGroupName=physical_id)
            except logs.exceptions.ResourceNotFoundException:
                pass
        return physical_id, {}

    name = props["LogGroupName"]
    try:
        logs.create_log_group(logGroupName=name)
    except logs.exceptions.ResourceAlreadyExistsException:
        pass  # AgentCore created it first: it is adopted
    logs.put_retention_policy(logGroupName=name, retentionInDays=int(props["RetentionInDays"]))
    return name, {}  # if the name changes, CFN sends Delete for the previous one


ACTIONS = {
    "PackageAgent":    package_agent,
    "EmptyBucket":     empty_bucket,
    "RuntimeLogGroup": runtime_log_group,
}


def handler(event, context):
    log.info(json.dumps({k: v for k, v in event.items() if k != "ResponseURL"}))
    request_type = event["RequestType"]
    physical_id = event.get("PhysicalResourceId", "none")
    try:
        action = ACTIONS[event["ResourceProperties"]["Action"]]
        physical_id, data = action(event["ResourceProperties"], request_type, physical_id)
        send(event, context, "SUCCESS", physical_id, data)
    except Exception as exc:
        log.exception("Custom resource failed")
        send(event, context, "FAILED", physical_id, reason=str(exc)[:500])
````

#### `infra/custom_resource/requirements.txt`

````text
# No extra dependencies: boto3 ships with the Lambda runtime.
````

#### `infra/proxy/proxy_handler.py`

````python
"""
proxy_handler.py — Proxy Lambda between API Gateway and AgentCore Runtime.

Receives the prompt from the frontend via API Gateway HTTP and forwards it to the
AgentCore Runtime using the bedrock-agentcore SDK. Returns the response
to the frontend (CORS is handled by API Gateway).

Required environment variables:
  AGENT_RUNTIME_ARN — ARN of the AgentCore Runtime (injected by SAM)
  AWS_REGION        — AWS region
"""

import json
import os
import uuid
import boto3


RUNTIME_ARN = os.environ["AGENT_RUNTIME_ARN"]
# AWS_REGION is reserved in Lambda — boto3 picks it up automatically from the environment
AWS_REGION  = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")


def lambda_handler(event: dict, context) -> dict:
    # ── Extract body ────────────────────────────────────────
    raw  = event.get("body", "{}")
    body = json.loads(raw) if isinstance(raw, str) else raw

    prompt     = (body.get("prompt") or "").strip()
    session_id = body.get("sessionId") or f"session-{uuid.uuid4().hex}"

    if not prompt:
        return _response(400, {"error": "The 'prompt' field is required."})

    # The AgentCore sessionId must be >= 33 chars
    if len(session_id) < 33:
        session_id = f"session-{session_id}-{uuid.uuid4().hex}"

    # ── Invoke AgentCore Runtime ───────────────────────────
    try:
        client = boto3.client("bedrock-agentcore", region_name=AWS_REGION)

        raw_response = client.invoke_agent_runtime(
            agentRuntimeArn  = RUNTIME_ARN,
            qualifier        = "DEFAULT",
            runtimeSessionId = session_id,
            payload          = json.dumps({"input": {"prompt": prompt}}).encode("utf-8"),
            contentType      = "application/json",
            accept           = "application/json",
        )

        body_bytes = raw_response["response"].read()
        data       = json.loads(body_bytes)

        # The runtime returns { output: { message, policy, s3_key, s3_url, ... } }
        output = data.get("output", data)

        # Normalize the policy key order to the canonical IAM order so
        # it matches what is saved in S3 and shown in the frontend.
        if isinstance(output.get("policy"), dict):
            output["policy"] = _order_policy(output["policy"])

    except Exception as exc:
        print(f"ERROR invoking the runtime: {exc!r}", flush=True)
        return _response(500, {"error": "Error invoking the agent. Check the proxy Lambda logs."})

    return _response(200, output)


# ── Helpers ────────────────────────────────────────────────

def _order_policy(policy: dict) -> dict:
    """Reorders the keys of an IAM policy to the canonical AWS order."""
    ROOT_ORDER      = ["Version", "Statement"]
    STATEMENT_ORDER = ["Sid", "Effect", "Principal", "Action", "Resource", "Condition"]

    def _reorder(obj: dict, key_order: list) -> dict:
        ordered = {k: obj[k] for k in key_order if k in obj}
        for k in sorted(obj):
            if k not in ordered:
                ordered[k] = obj[k]
        return ordered

    result = _reorder(policy, ROOT_ORDER)
    if "Statement" in result and isinstance(result["Statement"], list):
        result["Statement"] = [
            _reorder(stmt, STATEMENT_ORDER) if isinstance(stmt, dict) else stmt
            for stmt in result["Statement"]
        ]
    return result


def _response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        # CORS is added by API Gateway (CorsConfiguration of the HttpApi).
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False),
    }
````

#### `infra/proxy/requirements.txt`

````text
# proxy_handler.py only uses boto3 and the Python standard library.
# boto3 is already included in the Lambda runtime — no extra dependencies.
````
