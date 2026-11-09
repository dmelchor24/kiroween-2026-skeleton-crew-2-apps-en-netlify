/**
 * theme.js — Light/dark mode toggle.
 * Persists the preference in localStorage.
 * Applies the `theme-light` class on <html>.
 */

const STORAGE_KEY = "color-theme";

/**
 * Applies the theme.
 * @param {"light"|"dark"} theme
 */
function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.classList.add("theme-light");
  } else {
    document.documentElement.classList.remove("theme-light");
  }
  syncThemeColor();
}

/**
 * Aligns <meta name="theme-color"> (browser bar / PWA) with the current --bg.
 * This way the color always comes from tokens.css and is not duplicated in the HTML.
 */
export function syncThemeColor() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (!bg) return;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = bg;
}

/**
 * Reads the saved preference or falls back to the operating system's.
 * @returns {"light"|"dark"}
 */
export function resolveTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Registers the listener on a toggle button already in the DOM.
 * Updates its icon according to the active theme.
 * @param {HTMLElement} btn
 */
export function bindThemeToggle(btn) {
  syncThemeColor();
  if (!btn) return;
  _updateIcon(btn, resolveTheme());

  btn.addEventListener("click", () => {
    const current = document.documentElement.classList.contains("theme-light") ? "light" : "dark";
    const next = current === "light" ? "dark" : "light";
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    _updateIcon(btn, next);
  });
}

/**
 * Creates the toggle button, inserts it before #topbarUser, and registers the listener.
 * Use on dashboard pages where the topbar is built dynamically.
 */
export function setupThemeToggle() {
  const topbarUser = document.getElementById("topbarUser");
  if (!topbarUser) return;

  // Avoid duplicates if called more than once
  if (document.getElementById("themeToggle")) {
    bindThemeToggle(document.getElementById("themeToggle"));
    return;
  }

  const btn = document.createElement("button");
  btn.id = "themeToggle";
  btn.className = "theme-toggle";
  btn.setAttribute("aria-label", "Toggle theme");
  btn.setAttribute("title", "Toggle theme");

  topbarUser.parentElement.insertBefore(btn, topbarUser);
  bindThemeToggle(btn);
}

/**
 * Icon SVG according to the active theme.
 * Sun = light mode  → click switches to dark.
 * Moon = dark mode → click switches to light.
 */
function _updateIcon(btn, currentTheme) {
  const label = currentTheme === "light" ? "Switch to dark mode" : "Switch to light mode";
  btn.setAttribute("aria-label", label);
  btn.innerHTML = currentTheme === "light" ? _sunIcon() : _moonIcon();
}

function _sunIcon() {
  return `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1"  x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1"  y1="12" x2="3"  y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>`;
}

function _moonIcon() {
  return `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`;
}
