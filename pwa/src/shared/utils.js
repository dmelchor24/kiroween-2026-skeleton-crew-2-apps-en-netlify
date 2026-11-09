/**
 * utils.js — Pure utility functions.
 * No dependencies on the DOM or the Cognito SDK.
 */

/**
 * Truncates a string to maxLen characters; appends "…" if truncated.
 * @param {string} str
 * @param {number} maxLen - Positive integer
 * @returns {string}
 */
export function truncateDisplay(str, maxLen) {
  if (!str) return "";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "\u2026";
}
