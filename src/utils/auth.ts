import type { WorkspaceRole, User } from '~/types/operational.ts';
import type { HttpRequest } from '@azure/functions';
import type { ExtendedJWT } from './tokens';

import { decryptJWE } from './tokens';
import { readItem } from './cosmos';

/**
 * Extracts a JWT token from the Authorization header.
 * 
 * @param headers The HTTP request headers.
 * @returns The extracted JWT token, if present; otherwise, null.
 */
export function extractTokenFromHeaders(headers: Headers): string | null {
  const authorizationHeader = headers.get("Authorization") || "";
  const tokenMatch = authorizationHeader.match(/^Bearer (.+)$/);
  return tokenMatch ? tokenMatch[1] : null;
}

/**
 * Extracts user information from a request
 * 
 * @remarks
 * This function centralizes user extraction logic to ensure consistent 
 * user identification across the application. It should be adapted to
 * match your specific authentication implementation.
 * 
 * @param req - The HTTP request object
 * @returns User object with id and permissions
 */
export async function extractUserFromRequest(req: Request | HttpRequest): Promise<{ id: string; permissions: string[]; payload: ExtendedJWT | null }> {
  // IMPORTANT: Replace this implementation with your actual auth extraction logic
  // This could involve JWT token validation, session lookup, etc.
  
  // Example implementation:
  // - Check authorization header for Bearer token
  // - Verify and decode JWT
  // - Extract user ID and permissions from JWT claims

  const token = extractTokenFromHeaders(req.headers as Headers);
  
  if (token) {
    try {      
      // In a production environment, you would verify the token
      // using jsonwebtoken or a similar library
      const payload = await decryptJWE(token);
      if (!payload) {
        throw new Error('Invalid token: unable to decrypt or validate');
      }
      
      return {
        id: payload.sub || 'unknown',
        permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
        payload,
      };
    } catch (error) {
      console.error('Error extracting user from token:', error);
    }
  }
  
  // Default for unauthenticated requests
  return {
    id: 'anonymous',
    permissions: [],
    payload: null,
  };
}

/**
 * Extract user ID from Azure AD token
 * @param req HTTP request with authorization header
 */
export async function getUserIdFromToken(req: Request | HttpRequest): Promise<string> {
  // In a real implementation, this would validate the JWT token
  // and extract the user ID from claims

  // For Azure AD B2C, typically use the oid claim
  // Example implementation:
  const user = await extractUserFromRequest(req);
  if (!user.payload) {
    throw new Error('No authorization token provided');
  }

  // In a production environment, you would verify the token
  // using jsonwebtoken or a similar library
  if (!user.id) {
    throw new Error('Invalid token: missing user ID claim');
  }

  return user.id as string;
}

/**
 * Check if user has any access to workspace
 * @param userId User ID
 * @param workspaceId Workspace ID
 */
export async function hasWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
  try {
    // Check if user has any roles in the workspace
    const user = await readItem<User>('users', userId);

    // Check workspace role assignments
    if (user.roles?.workspaces?.[workspaceId]?.length > 0) {
      return true;
    }

    // Check team memberships
    const workspace = await readItem('workspaces', workspaceId);

    for (const teamId in workspace.teams) {
      if (workspace.teams[teamId].members.includes(userId)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking workspace access:', error);
    return false;
  }
}

/**
 * Get all roles a user has in a workspace
 * @param userId User ID
 * @param workspaceId Workspace ID
 */
export async function getUserWorkspaceRoles(
  userId: string,
  workspaceId: string
): Promise<WorkspaceRole[]> {
  try {
    const user = await readItem<User>('users', userId);
    return (user.roles?.workspaces?.[workspaceId] || []) as WorkspaceRole[];
  } catch (error) {
    console.error('Error getting user workspace roles:', error);
    return [];
  }
}

/**
 * Check if user has specific workspace role(s)
 * @param userId User ID
 * @param workspaceId Workspace ID
 * @param roles Array of roles to check
 */
export async function hasWorkspaceRole(
  userId: string,
  workspaceId: string,
  roles: WorkspaceRole[]
): Promise<boolean> {
  try {
    const userRoles = await getUserWorkspaceRoles(userId, workspaceId);
    return userRoles.some(role => roles.includes(role as WorkspaceRole));
  } catch (error) {
    console.error('Error checking workspace role:', error);
    return false;
  }
}