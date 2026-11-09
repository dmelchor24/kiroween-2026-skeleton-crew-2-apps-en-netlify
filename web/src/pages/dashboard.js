/**
 * dashboard.js — Common initialization for protected pages.
 * Verifies the session, populates the topbar and registers signOut.
 * Imported by main-chat.js and main-consumption.js.
 */

import { createUserPool } from "../auth/cognito.js";
import { validateSession, signOut } from "../auth/session.js";
import { renderTopbar, setOnlineStatus } from "../shared/topbar.js";
import { setupSidebarToggle, setupSidebarEar } from "../shared/sidebar.js";
import { revealPage } from "../shared/ui.js";
import { setupThemeToggle } from "../shared/theme.js";

/**
 * Checks real connectivity by fetching an external server.
 * The Vite/local server always responds even without internet,
 * so an external endpoint is needed as a reference.
 * mode "no-cors" is used to avoid CORS errors — fetch throws
 * an exception only if there is really no network.
 * @returns {Promise<boolean>}
 */
async function checkRealConnectivity() {
  try {
    await fetch("https://1.1.1.1/cdn-cgi/trace", {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Shows the offline modal.
 */
function showOfflineModal() {
  const modal = document.getElementById("offlineModal");
  if (!modal) return;
  modal.classList.add("offline-modal--visible");
  // Focus the modal for accessibility
  modal.focus();
}

/**
 * Hides the offline modal.
 */
function hideOfflineModal() {
  const modal = document.getElementById("offlineModal");
  if (!modal) return;
  modal.classList.remove("offline-modal--visible");
}

/**
 * Starts the connectivity monitor.
 * - Offline: red dot + blocking modal.
 * - Online: revalidates session → valid: hide modal + green dot;
 *           expired: redirects to index.html.
 * - "Sign out now" button: signs out and redirects to the login.
 * - Polling every 15 s to catch drops that do not fire the 'offline' event.
 *
 * @param {object} pool - active CognitoUserPool
 */
function startConnectivityMonitor(pool) {
  let isOnline = null; // null = unknown, always forces the first update
  let pollTimer = null;

  async function applyOnlineState(online) {
    if (online === isOnline) return;
    isOnline = online;

    if (!online) {
      setOnlineStatus(false);
      showOfflineModal();
    } else {
      // Network is back — revalidate session before turning the dot green
      validateSession(
        pool,
        () => {
          // Valid session — all good
          setOnlineStatus(true);
          hideOfflineModal();
        },
        () => {
          // Session expired — redirect to login
          window.location.href = "index.html";
        }
      );
    }
  }

  async function poll() {
    const online = await checkRealConnectivity();
    await applyOnlineState(online);
  }

  // Manual "Sign out now" button
  const signOutBtn = document.getElementById("offlineSignOutBtn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", () => signOut(pool));
  }

  // Native browser events (fast response)
  window.addEventListener("offline", () => applyOnlineState(false));
  window.addEventListener("online",  () => poll());

  // Periodic polling for cases where events do not fire
  pollTimer = setInterval(poll, 15_000);

  // Initial state
  poll();

  // Clean up on page unload
  window.addEventListener("beforeunload", () => clearInterval(pollTimer), { once: true });
}

/**
 * Initializes a protected dashboard page.
 * If the session is not valid, redirects to index.html.
 * @param {object} [userPool] - Injectable for tests; uses the real pool if omitted
 */
export function initDashboardPage(userPool) {
  let pool;
  try {
    pool = userPool ?? createUserPool();
  } catch (err) {
    console.error("[dashboard]", err);
    window.location.href = "index.html";
    return;
  }

  validateSession(
    pool,
    (claims) => {
      revealPage();
      renderTopbar(claims.nickname, claims.email);
      setupThemeToggle();
      setupSidebarToggle();
      setupSidebarEar();
      startConnectivityMonitor(pool);

      const signOutBtn = document.getElementById("signOutBtn");
      if (signOutBtn) {
        signOutBtn.addEventListener("click", () => signOut(pool));
      }
    },
    () => {
      window.location.href = "index.html";
    }
  );
}
