/**
 * topbar.js — Renders the user area in the topbar.
 */

import { truncateDisplay } from "./utils.js";

/**
 * Fills #topbarUser with a status dot + truncated name/email.
 * @param {string} nickname
 * @param {string} email
 */
export function renderTopbar(nickname, email) {
  const el = document.getElementById("topbarUser");
  if (!el) return;

  const displayName = nickname
    ? truncateDisplay(nickname, 30)
    : truncateDisplay(email, 40);

  const dot = document.createElement("span");
  dot.className = "online-dot";
  dot.setAttribute("aria-hidden", "true");

  const name = document.createElement("span");
  name.className = "topbar-username";
  name.textContent = displayName;

  el.innerHTML = "";
  el.appendChild(dot);
  el.appendChild(name);
}

/**
 * Updates the status dot in the topbar.
 * @param {boolean} isOnline - true = green (online), false = red (offline)
 */
export function setOnlineStatus(isOnline) {
  const dot = document.querySelector("#topbarUser .online-dot");
  if (!dot) return;

  if (isOnline) {
    dot.classList.remove("dot--offline");
    dot.removeAttribute("title");
  } else {
    dot.classList.add("dot--offline");
    dot.setAttribute("title", "No connection");
  }
}
