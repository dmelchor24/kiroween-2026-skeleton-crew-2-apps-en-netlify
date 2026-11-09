/**
 * api.js — POST JSON against the stack's public APIs (no authentication on the API).
 * Portal access is controlled by the Cognito login; the API accepts any origin.
 */

/**
 * POST JSON.
 * @param {string} url
 * @param {object} payload
 * @returns {Promise<object>} JSON body of the response
 */
export async function postJson(url, payload) {
  if (!url) throw new Error("The API URL is not configured.");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error("The API returned HTML instead of JSON. Check the configured URL.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || `Server error: HTTP ${response.status}`);
  }
  return data;
}
