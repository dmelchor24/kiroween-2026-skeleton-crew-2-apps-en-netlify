/**
 * login.js — Full Cognito authentication flow.
 * Handles: SRP login, temporary password change,
 * initial MFA setup (QR) and TOTP verification on each sign-in.
 *
 * Depends on the SDK loaded in window: amazon-cognito-identity-js
 * and qrcode-generator (to render the QR).
 */

import { COGNITO_CONFIG, MFA_ISSUER, createUserPool } from "./cognito.js";
import { CognitoUser, AuthenticationDetails } from "amazon-cognito-identity-js";
import { showError, clearError } from "../shared/ui.js";
import { renderQr } from "../shared/qr.js";

// ----------------------------------------------------------------
// Flow state (memory only, cleared when the tab closes)
// ----------------------------------------------------------------
const NICKNAME_REGEX = /^[A-Za-z0-9_-]{3,20}$/;
const REDIRECT_ON_SUCCESS = "chat.html";

let userPool = null;

let pendingUser  = null;
let pendingEmail = "";
let needsNickname = false;

// ----------------------------------------------------------------
// DOM references — resolved once after DOMContentLoaded
// ----------------------------------------------------------------
const $ = (id) => document.getElementById(id);

let statusBar, titleEl, subtitleEl;
let loginForm, emailInput, passwordInput, submitBtn, errorMsg;
let newPasswordForm, newPasswordNotice, newPasswordInput;
let newPasswordConfirmInput, nicknameField, nicknameInput;
let newPasswordBtn, newPasswordError;
let mfaSetupForm, qrBox, secretCode, mfaSetupCodeInput, mfaSetupBtn, mfaSetupError;
let mfaCodeForm, mfaCodeInput, mfaCodeBtn, mfaCodeError;
let authedPanel, authedNickname, authedEmail, logoutBtn;
let allButtons, panels, currentPanel;

function bindDom() {
  statusBar   = $("statusBar");
  titleEl     = $("title");
  subtitleEl  = $("subtitle");

  loginForm       = $("loginForm");
  emailInput      = $("email");
  passwordInput   = $("password");
  submitBtn       = $("submitBtn");
  errorMsg        = $("errorMsg");

  newPasswordForm         = $("newPasswordForm");
  newPasswordNotice       = $("newPasswordNotice");
  newPasswordInput        = $("newPassword");
  newPasswordConfirmInput = $("newPasswordConfirm");
  nicknameField   = $("nicknameField");
  nicknameInput   = $("nickname");
  newPasswordBtn  = $("newPasswordBtn");
  newPasswordError = $("newPasswordError");

  mfaSetupForm       = $("mfaSetupForm");
  qrBox              = $("qrBox");
  secretCode         = $("secretCode");
  mfaSetupCodeInput  = $("mfaSetupCode");
  mfaSetupBtn        = $("mfaSetupBtn");
  mfaSetupError      = $("mfaSetupError");

  mfaCodeForm       = $("mfaCodeForm");
  mfaCodeInput      = $("mfaCode");
  mfaCodeBtn        = $("mfaCodeBtn");
  mfaCodeError      = $("mfaCodeError");

  authedPanel    = $("authedPanel");
  authedNickname = $("authedNickname");
  authedEmail    = $("authedEmail");
  logoutBtn      = $("logoutBtn");

  allButtons = [submitBtn, newPasswordBtn, mfaSetupBtn, mfaCodeBtn];

  panels = new Map([
    [loginForm,       { error: errorMsg,        title: "Sign in",                subtitle: "This site only accepts previously authorized accounts." }],
    [newPasswordForm, { error: newPasswordError, title: "First sign-in",           subtitle: "Complete your account to continue." }],
    [mfaSetupForm,    { error: mfaSetupError,    title: "Two-step verification", subtitle: "Protect your account with an authenticator app." }],
    [mfaCodeForm,     { error: mfaCodeError,     title: "Two-step verification", subtitle: "Enter the code shown by your authenticator app." }],
    [authedPanel,     { error: null,             title: "Signed in",              subtitle: "" }],
  ]);

  currentPanel = loginForm;
}

// ----------------------------------------------------------------
// Local UI helpers
// ----------------------------------------------------------------

function _showPanel(panel) {
  panels.forEach((_, p) => p.classList.add("hidden"));
  panel.classList.remove("hidden");
  currentPanel = panel;

  const meta = panels.get(panel);
  titleEl.textContent = meta.title;
  subtitleEl.textContent = meta.subtitle;
  subtitleEl.classList.toggle("hidden", !meta.subtitle);
  if (meta.error) clearError(meta.error);
}

function _setStage(stage) {
  statusBar.classList.remove("step1", "step2", "granted", "denied");
  if (stage) statusBar.classList.add(stage);
}

function _setLoading(button, isLoading) {
  button.disabled = isLoading;
  button.classList.toggle("loading", isLoading);
}

function stopLoading() {
  allButtons.forEach((b) => _setLoading(b, false));
}

function resetToLogin(message) {
  stopLoading();
  pendingUser   = null;
  needsNickname = false;
  [newPasswordForm, mfaSetupForm, mfaCodeForm].forEach((f) => f.reset());
  passwordInput.value = "";
  _setStage(null);
  _showPanel(loginForm);
  if (message) showError(errorMsg, message);
}

// ----------------------------------------------------------------
// Cognito errors → English messages
// ----------------------------------------------------------------

function translateCognitoError(err) {
  switch (err && err.code) {
    case "UserNotFoundException":
    case "NotAuthorizedException":
      return "Incorrect email or password.";
    case "UserNotConfirmedException":
      return "This account has not been confirmed yet. Contact the administrator.";
    case "PasswordResetRequiredException":
      return "A password reset is required. Contact the administrator.";
    case "TooManyFailedAttemptsException":
    case "TooManyRequestsException":
    case "LimitExceededException":
      return "Too many attempts. Wait a few minutes and try again.";
    case "InvalidPasswordException":
      return "The password does not meet the system security requirements.";
    case "CodeMismatchException":
    case "EnableSoftwareTokenMFAException":
      return "The code is incorrect. Check your app and try again.";
    case "ExpiredCodeException":
      return "The code has expired. Enter the current code from your app.";
    case "NetworkingError":
    case "network error":
      return "No internet connection. Check your network and try again.";
    default: {
      const msg = (err && err.message) || "";
      if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("failed to fetch")) {
        return "No internet connection. Check your network and try again.";
      }
      return msg || "An error occurred. Please try again.";
    }
  }
}

function handleFailure(err) {
  stopLoading();

  const inChallenge = currentPanel === newPasswordForm
    || currentPanel === mfaSetupForm
    || currentPanel === mfaCodeForm;

  if (inChallenge && err && err.code === "NotAuthorizedException") {
    resetToLogin("Your session expired. Please sign in again.");
    return;
  }

  const target = panels.get(currentPanel).error;
  if (target) showError(target, translateCognitoError(err));

  if (currentPanel === loginForm) {
    _setStage("denied");
    setTimeout(() => _setStage(null), 600);
  }
}

// ----------------------------------------------------------------
// Cognito callbacks (shared across the whole flow)
// ----------------------------------------------------------------

function authCallbacks(cognitoUser) {
  return {
    onSuccess: (session) => {
      stopLoading();
      _setStage("granted");
      onLoginSuccess(session);
    },

    onFailure: handleFailure,

    newPasswordRequired: (_userAttr, requiredAttributes) => {
      stopLoading();
      pendingUser   = cognitoUser;
      needsNickname = Array.isArray(requiredAttributes) && requiredAttributes.includes("nickname");

      nicknameField.classList.toggle("hidden", !needsNickname);
      newPasswordNotice.textContent = needsNickname
        ? "Set your new password and choose your nickname."
        : "Set your new password.";

      _showPanel(newPasswordForm);
      newPasswordInput.focus();
    },

    mfaSetup: () => startMfaSetup(cognitoUser),

    totpRequired: () => {
      stopLoading();
      pendingUser = cognitoUser;
      _setStage("step2");
      mfaCodeForm.reset();
      _showPanel(mfaCodeForm);
      mfaCodeInput.focus();
    },

    selectMFAType: () => {
      cognitoUser.sendMFASelectionAnswer("SOFTWARE_TOKEN_MFA", authCallbacks(cognitoUser));
    },

    mfaRequired: () => {
      handleFailure({ message: "This account uses an unsupported verification method. Contact the administrator." });
    },
  };
}

// ----------------------------------------------------------------
// Step 1: SRP login
// ----------------------------------------------------------------

function initLoginForm() {
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError(errorMsg);

    const email    = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError(errorMsg, "Fill in both fields.");
      return;
    }

    _setLoading(submitBtn, true);
    _setStage("step1");

    pendingEmail = email;
    const cognitoUser  = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails  = new AuthenticationDetails({ Username: email, Password: password });

    cognitoUser.authenticateUser(authDetails, authCallbacks(cognitoUser));
  });
}

// ----------------------------------------------------------------
// Step 2: new password
// ----------------------------------------------------------------

function initNewPasswordForm() {
  newPasswordForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError(newPasswordError);

    const newPassword = newPasswordInput.value;
    const confirm     = newPasswordConfirmInput.value;
    const nickname    = nicknameInput.value.trim();

    if (newPassword.length < 8) {
      showError(newPasswordError, "The password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirm) {
      showError(newPasswordError, "The passwords do not match.");
      return;
    }
    if (needsNickname && !NICKNAME_REGEX.test(nickname)) {
      showError(newPasswordError, "The nickname must be 3 to 20 characters: letters, numbers, hyphen or underscore.");
      return;
    }
    if (!pendingUser) {
      resetToLogin("Your session expired. Please sign in again.");
      return;
    }

    _setLoading(newPasswordBtn, true);
    const attrs = {};
    if (needsNickname) attrs.nickname = nickname;
    pendingUser.completeNewPasswordChallenge(newPassword, attrs, authCallbacks(pendingUser));
  });
}

// ----------------------------------------------------------------
// Step 3: set up MFA (QR + first code)
// ----------------------------------------------------------------

function buildOtpAuthUri(secret) {
  const issuer  = encodeURIComponent(MFA_ISSUER);
  const account = encodeURIComponent(pendingEmail);
  return `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}`;
}

function startMfaSetup(cognitoUser) {
  stopLoading();
  pendingUser = cognitoUser;
  _setStage("step2");

  qrBox.textContent = "";
  secretCode.textContent = "";
  mfaSetupForm.reset();
  _showPanel(mfaSetupForm);

  cognitoUser.associateSoftwareToken({
    associateSecretCode: (secret) => {
      secretCode.textContent = secret;
      renderQr(qrBox, buildOtpAuthUri(secret));
      mfaSetupCodeInput.focus();
    },
    onFailure: handleFailure,
  });
}

function initMfaSetupForm() {
  mfaSetupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError(mfaSetupError);

    const code = mfaSetupCodeInput.value.replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) {
      showError(mfaSetupError, "The code has 6 digits.");
      return;
    }
    if (!pendingUser) {
      resetToLogin("Your session expired. Please sign in again.");
      return;
    }

    _setLoading(mfaSetupBtn, true);
    pendingUser.verifySoftwareToken(code, "Authenticator", {
      onSuccess: (result) => {
        if (result && typeof result.getIdToken === "function") {
          stopLoading();
          _setStage("granted");
          onLoginSuccess(result);
        } else {
          handleFailure({ message: "Could not complete the setup. Please try again." });
        }
      },
      onFailure: handleFailure,
    });
  });
}

// ----------------------------------------------------------------
// Step 4: MFA code on each sign-in
// ----------------------------------------------------------------

function initMfaCodeForm() {
  mfaCodeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError(mfaCodeError);

    const code = mfaCodeInput.value.replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) {
      showError(mfaCodeError, "The code has 6 digits.");
      return;
    }
    if (!pendingUser) {
      resetToLogin("Your session expired. Please sign in again.");
      return;
    }

    _setLoading(mfaCodeBtn, true);
    pendingUser.sendMFACode(code, authCallbacks(pendingUser), "SOFTWARE_TOKEN_MFA");
  });
}

// ----------------------------------------------------------------
// Success: redirect or show session panel
// ----------------------------------------------------------------

function onLoginSuccess(session) {
  const claims   = session.getIdToken().decodePayload();
  const email    = claims.email    || pendingEmail;
  const nickname = claims.nickname || "";

  pendingUser = null;
  [newPasswordForm, mfaSetupForm, mfaCodeForm].forEach((f) => f.reset());
  passwordInput.value = "";

  if (REDIRECT_ON_SUCCESS) {
    window.location.href = REDIRECT_ON_SUCCESS;
    return;
  }

  authedNickname.textContent = nickname;
  authedNickname.classList.toggle("hidden", !nickname);
  authedEmail.textContent = email;
  _setStage("granted");
  _showPanel(authedPanel);
}

// ----------------------------------------------------------------
// Restore existing session on page load
// ----------------------------------------------------------------

function restoreSession() {
  const user = userPool.getCurrentUser();
  if (!user) return;

  user.getSession((err, session) => {
    if (err || !session || !session.isValid()) return;
    onLoginSuccess(session);
  });
}

// ----------------------------------------------------------------
// Startup
// ----------------------------------------------------------------

export function initLogin() {
  try {
    userPool = createUserPool();
    bindDom();
    initLoginForm();
    initNewPasswordForm();
    initMfaSetupForm();
    initMfaCodeForm();

    document.querySelectorAll(".js-cancel").forEach((btn) => {
      btn.addEventListener("click", () => resetToLogin());
    });

    logoutBtn.addEventListener("click", () => {
      const user = userPool.getCurrentUser();
      if (user) user.signOut();
      pendingEmail = "";
      loginForm.reset();
      resetToLogin();
    });

    restoreSession();
  } catch (err) {
    // Show the error in the console and on screen for diagnosis
    console.error("[initLogin] Initialization error:", err);
    const errEl = document.getElementById("errorMsg");
    if (errEl) errEl.textContent = "Error loading: " + (err.message || err);
  }
}
