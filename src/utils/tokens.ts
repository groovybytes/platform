import type { HttpRequest, InvocationContext } from "@azure/functions";
import process from "node:process";
import * as msal from "@azure/msal-node";

// Simple in-memory cache for token validation results
export const tokenCache = new Map<string, { valid: boolean, timestamp: number }>();
export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

export async function validateToken(token: string, context: InvocationContext): Promise<boolean> {
  try {
    // Generate a cache key based on the token
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const cacheKey = `auth:${hashHex}`;

    // Check in-memory cache first
    const cachedEntry = tokenCache.get(cacheKey);
    const now = Date.now();

    if (cachedEntry && (now - cachedEntry.timestamp < CACHE_TTL)) {
      context.log("Token validation result from cache");
      return cachedEntry.valid;
    }

    // Configuration for your Azure Entra ID application
    const config: msal.Configuration = {
      auth: {
        clientId: process.env.AZURE_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`
      }
    };

    // Create MSAL application instance
    const pca = new msal.ConfidentialClientApplication(config);

    // Validate token - simplified for example
    const tokenClaims = decodeToken(token);

    // Check if token is expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (tokenClaims.exp && tokenClaims.exp < currentTime) {
      // Cache the invalid result
      tokenCache.set(cacheKey, { valid: false, timestamp: now });
      return false;
    }

    // Additional validation as needed
    const isValid = true; // Replace with actual validation

    // Cache the result
    tokenCache.set(cacheKey, { valid: isValid, timestamp: now });

    return isValid;
  } catch (error) {
    context.error("Token validation error:", error);
    return false;
  }
}

export function decodeToken(token: string): any {
  // Web standard API for base64 decoding
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = atob(base64);

  return JSON.parse(jsonPayload);
}

export function hasPermission(userClaims: any, path: string, method: string): boolean {
  // Implement your permission logic here
  const userRoles = userClaims.roles || [];

  // Example implementation based on your architecture diagram:
  if (path.startsWith("workspace") && !userRoles.includes("WorkspaceUser")) {
    return false;
  }

  if (path.startsWith("user") && !userRoles.includes("UserAdmin")) {
    return false;
  }

  if (path.startsWith("config") && !userRoles.includes("ConfigAdmin")) {
    return false;
  }

  if (path.startsWith("query") && !userRoles.includes("QueryUser")) {
    return false;
  }

  return true;
}

export function determineTargetFunction(path: string): string {
  // Map the incoming path to the appropriate backend function URL
  const baseFunctionUrl = process.env.BACKEND_FUNCTION_URL;

  if (path.startsWith("workspace")) {
    return `${baseFunctionUrl}/api/workspace-service`;
  } else if (path.startsWith("user")) {
    return `${baseFunctionUrl}/api/user-management`;
  } else if (path.startsWith("config")) {
    return `${baseFunctionUrl}/api/config-service`;
  } else if (path.startsWith("query")) {
    return `${baseFunctionUrl}/api/query-service`;
  }

  return `${baseFunctionUrl}/api/default`;
}

export async function forwardRequest(originalReq: HttpRequest, targetUrl: string): Promise<Response> {
  // Create a new request object with original properties
  const requestInit: RequestInit = {
    method: originalReq.method,
    headers: Object.entries(originalReq.headers),
    redirect: 'follow'
  };

  // Add body if exists (and not a GET/HEAD request)
  if (!['GET', 'HEAD'].includes(originalReq.method)) {
    requestInit.body = await originalReq.arrayBuffer();
  }

  // Forward the request using fetch API
  return await fetch(targetUrl, requestInit);
}

// Clean up expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of tokenCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      tokenCache.delete(key);
    }
  }
}, 60_000); // Run cleanup every minute