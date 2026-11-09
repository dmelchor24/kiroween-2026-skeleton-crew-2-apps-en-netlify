/**
 * ui.js — DOM helpers shared across pages.
 */

/**
 * Shows an error message in the given element.
 * @param {HTMLElement} el
 * @param {string} message
 */
export function showError(el, message) {
  el.textContent = message;
  el.classList.add("visible");
}

/**
 * Clears the error message of an element.
 * @param {HTMLElement} el
 */
export function clearError(el) {
  el.textContent = "";
  el.classList.remove("visible");
}

/**
 * Shows the page (removes the hidden loading state).
 * Called after validating the session on protected pages.
 * No transition — the reveal is instant to avoid flicker
 * when navigating between pages on the same domain.
 */
export function revealPage() {
  document.documentElement.style.opacity = '';
  document.body.classList.add("dashboard-ready");
}
