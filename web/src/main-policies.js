/**
 * main-policies.js — Entry point of policies.html.
 */
import "./styles/login.css";
import "./styles/dashboard.css";
import "./styles/policies.css";
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
