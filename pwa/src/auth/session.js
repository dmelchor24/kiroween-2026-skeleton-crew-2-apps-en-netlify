/**
 * session.js — Cognito session management.
 * Validates tokens, extracts claims and handles sign-out.
 */

import { createUserPool } from "./cognito.js";

/**
 * Extracts { nickname, email } from the ID Token of a valid session.
 * Returns null if the `email` claim is missing or empty.
 *
 * @param {object} session - CognitoUserSession
 * @returns {{ nickname: string, email: string } | null}
 */
export function extractClaims(session) {
  const payload  = session.getIdToken().decodePayload();
  const email    = (payload.email    || "").trim();
  const nickname = (payload.nickname || "").trim();
  if (!email) return null;
  return { nickname, email };
}

/**
 * Checks the current user's session and calls onSuccess(claims)
 * or redirects to index.html if there is no valid session.
 *
 * @param {object} userPool - CognitoUserPool (injectable for tests)
 * @param {function} onSuccess - cb({ nickname, email })
 * @param {function} onFail    - cb() called when there is no session
 */
export function validateSession(userPool, onSuccess, onFail) {
  const pool = userPool ?? createUserPool();
  const cognitoUser = pool.getCurrentUser();

  if (!cognitoUser) {
    onFail();
    return;
  }

  cognitoUser.getSession(function (err, session) {
    if (err || !session || !session.isValid()) {
      onFail();
      return;
    }

    const claims = extractClaims(session);
    if (!claims) {
      onFail();
      return;
    }

    onSuccess(claims, cognitoUser);
  });
}

/**
 * Signs out of Cognito and redirects to index.html.
 *
 * @param {object} userPool - CognitoUserPool (injectable for tests)
 */
export function signOut(userPool) {
  const pool = userPool ?? createUserPool();
  const cognitoUser = pool.getCurrentUser();

  if (cognitoUser) {
    cognitoUser.signOut();
  }

  window.location.href = "index.html";
}
