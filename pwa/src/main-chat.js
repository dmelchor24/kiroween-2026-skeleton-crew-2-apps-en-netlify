/**
 * main-chat.js — Entry point of chat.html.
 */

import "./styles/login.css";
import "./styles/dashboard.css";
import "./styles/pwa.css";
import { initDashboardPage } from "./pages/dashboard.js";
import { initChatAgent } from "./chat-agent.js";

function bootstrap() {
  initDashboardPage();
  initChatAgent();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
