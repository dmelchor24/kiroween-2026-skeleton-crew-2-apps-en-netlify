/**
 * config.js — Single entry point to runtime configuration.
 * Values come from VITE_* variables (.env.local file in development,
 * site environment variables on Netlify). Values are never written in the code.
 */
const env = import.meta.env;

export const CONFIG = Object.freeze({
  COGNITO_USER_POOL_ID: (env.VITE_COGNITO_USER_POOL_ID ?? "").trim(),
  COGNITO_CLIENT_ID:    (env.VITE_COGNITO_CLIENT_ID ?? "").trim(),
  CHAT_API_URL:         (env.VITE_CHAT_API_URL ?? "").trim(),
  POLICY_API_URL:       (env.VITE_POLICY_API_URL ?? "").trim(),
});

/**
 * Throws a clear error if any required variable is missing.
 * @param {...string} keys - CONFIG keys that must have a value
 */
export function requireConfig(...keys) {
  const missing = keys.filter((k) => !CONFIG[k]);
  if (missing.length) {
    throw new Error(
      "Missing configuration (" + missing.join(", ") + "). " +
      "Say «deploy architecture» or «migrate» in Kiro to generate .env.local."
    );
  }
}
