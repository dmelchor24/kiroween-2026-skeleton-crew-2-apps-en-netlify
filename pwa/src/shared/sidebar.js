/**
 * sidebar.js — Responsive sidebar logic.
 */

const STORAGE_KEY = "sidebar-collapsed";

/**
 * Registers the hamburger button listener for mobile.
 * Toggles .sidebar--open on #sidebar and aria-expanded on the toggle.
 */
export function setupSidebarToggle() {
  const toggle  = document.getElementById("sidebarToggle");
  const sidebar = document.getElementById("sidebar");
  if (!toggle || !sidebar) return;

  toggle.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("sidebar--open");
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
}

/**
 * Registers the "ear" button to collapse/expand the sidebar on desktop.
 * Persists the state in localStorage.
 */
export function setupSidebarEar() {
  const ear     = document.getElementById("sidebarEar");
  const sidebar = document.getElementById("sidebar");
  const layout  = document.querySelector(".dashboard-layout");
  if (!ear || !sidebar) return;

  // Restore saved state
  const collapsed = localStorage.getItem(STORAGE_KEY) === "true";
  if (collapsed) {
    sidebar.classList.add("sidebar--collapsed");
    layout?.classList.add("sidebar-is-collapsed");
    ear.setAttribute("aria-expanded", "false");
    ear.setAttribute("aria-label", "Expand menu");
  }

  ear.addEventListener("click", () => {
    const isCollapsed = sidebar.classList.toggle("sidebar--collapsed");
    layout?.classList.toggle("sidebar-is-collapsed", isCollapsed);
    ear.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    ear.setAttribute("aria-label", isCollapsed ? "Expand menu" : "Collapse menu");
    localStorage.setItem(STORAGE_KEY, isCollapsed ? "true" : "false");
  });
}
