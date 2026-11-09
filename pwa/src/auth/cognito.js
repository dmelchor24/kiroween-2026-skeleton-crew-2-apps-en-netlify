/**
 * cognito.js — User Pool configuration and singleton.
 * IDs are read from src/config.js (VITE_* variables), not written here.
 */
import { CognitoUserPool } from "amazon-cognito-identity-js";
import { CONFIG, requireConfig } from "../config.js";

export const COGNITO_CONFIG = {
  get UserPoolId() { return CONFIG.COGNITO_USER_POOL_ID; },
  get ClientId()   { return CONFIG.COGNITO_CLIENT_ID; },
};

/** Name shown in the authenticator app (Google Authenticator, etc.) */
export const MFA_ISSUER = "Kiroween 2026";

/**
 * Creates and returns the CognitoUserPool.
 * @returns {CognitoUserPool}
 */
export function createUserPool() {
  requireConfig("COGNITO_USER_POOL_ID", "COGNITO_CLIENT_ID");
  return new CognitoUserPool({
    UserPoolId: CONFIG.COGNITO_USER_POOL_ID,
    ClientId:   CONFIG.COGNITO_CLIENT_ID,
  });
}
