import type { Configuration } from "@azure/msal-node";
import { LogLevel } from "@azure/msal-node";
import { generateRandomHex } from "./utils";

import process from "node:process";

export const AZURE_ENTRA_CLIENT_ID = process.env.AZURE_ENTRA_CLIENT_ID ?? "azure_entra_client_id";
export const AZURE_ENTRA_CLIENT_SECRET = process.env.AZURE_ENTRA_CLIENT_SECRET ?? "azure_entra_client_secret";
export const AZURE_ENTRA_TENANT_NAME = process.env.AZURE_ENTRA_TENANT_NAME ?? "azure_entra_tenant_name";

// Retrieve JWT-related secrets and salts from environment variables
export const AUTH_SECRET = process.env.AUTH_SECRET ?? generateRandomHex(64); // openssl rand -base64 32
export const AUTH_SALT = process.env.AUTH_SALT ?? generateRandomHex(64); // openssl rand -base64 32

export const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
export const REDIRECT_URI = process.env.REDIRECT_URI ?? `${BASE_URL}/api/auth/redirect`;

export const SIGN_UP_SIGN_IN_POLICY_NAME = process.env.SIGN_UP_SIGN_IN_POLICY_NAME ?? "B2C_1_Signup_Login";
export const RESET_PASSWORD_POLICY_NAME = process.env.RESET_PASSWORD_POLICY_NAME ?? "B2C_1_Password_Reset";
export const EDIT_PROFILE_POLICY_NAME = process.env.EDIT_PROFILE_POLICY_NAME ?? "B2C_1_Profile_Editing";

// B2C authority domain
export const AUTHORITY_DOMAIN = process.env.AUTHORITY_DOMAIN ?? `https://${AZURE_ENTRA_TENANT_NAME}.b2clogin.com`;

// B2C sign up and sign in user flow / policy authority
export const SIGN_UP_SIGN_IN_POLICY_AUTHORITY = `${AUTHORITY_DOMAIN}/${AZURE_ENTRA_TENANT_NAME}.onmicrosoft.com/${SIGN_UP_SIGN_IN_POLICY_NAME}`;
export const RESET_PASSWORD_POLICY_AUTHORITY = `${AUTHORITY_DOMAIN}/${AZURE_ENTRA_TENANT_NAME}.onmicrosoft.com/${RESET_PASSWORD_POLICY_NAME}`;
export const EDIT_PROFILE_POLICY_AUTHORITY = `${AUTHORITY_DOMAIN}/${AZURE_ENTRA_TENANT_NAME}.onmicrosoft.com/${EDIT_PROFILE_POLICY_NAME}`;

// Logout endpoint
export const LOGOUT_ENDPOINT = `${SIGN_UP_SIGN_IN_POLICY_AUTHORITY}/oauth2/v2.0/logout?post_logout_redirect_uri=${REDIRECT_URI}`

export const MSAL_SCOPES = [];
export const MSAL_CONFIG: Configuration = {
  'auth': {
    'clientId': AZURE_ENTRA_CLIENT_ID,
    'clientSecret': AZURE_ENTRA_CLIENT_SECRET,
    'authority': SIGN_UP_SIGN_IN_POLICY_AUTHORITY,
    'knownAuthorities': [AUTHORITY_DOMAIN], // This must be an array
  },
  'system': {
    'loggerOptions': {
      loggerCallback(_, message) {
        console.log(message);
      },
      'piiLoggingEnabled': false,
      'logLevel': LogLevel.Verbose,
    }
  }
};

// KV keys for storing PKCE and CSRF state; adjust as needed:
export const KV_VERIFIER_KEY = ['tokens', 'credentials', 'verifier'] as const;
export const KV_CHALLENGE_KEY = ['tokens', 'credentials', 'challenge'] as const;
export const KV_CHALLENGE_METHOD_KEY = ['tokens', 'credentials', 'challengeMethod'] as const;
