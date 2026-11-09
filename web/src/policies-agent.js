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
