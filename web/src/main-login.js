/**
 * main-login.js — Entry point of index.html (login screen).
 */

import "./styles/login.css";
import { initLogin } from "./auth/login.js";
import { bindThemeToggle } from "./shared/theme.js";

function init() {
  initLogin();
  bindThemeToggle(document.getElementById("themeToggle"));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
