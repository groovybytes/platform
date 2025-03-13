import { HttpRequest } from '@azure/functions';
import { readItem, queryItems } from './cosmos';
import type { WorkspaceRole, User } from '~/types/operational';

/**
 * Extract user ID from Azure AD token
 * @param req HTTP request with authorization header
 */
export function getUserIdFromToken(req: HttpRequest): string {
  // In a real implementation, this would validate the JWT token
  // and extract the user ID from claims

  // For Azure AD B2C, typically use the oid claim
  // Example implementation:
  const token = req.headers.get("authorization")?.split(' ')[1];
  if (!token) {
    throw new Error('No authorization token provided');
  }

  // In a production environment, you would verify the token
  // using jsonwebtoken or a similar library
  const decodedToken = decodeJwt(token);

  if (!decodedToken.oid) {
    throw new Error('Invalid token: missing user ID claim');
  }

  return decodedToken.oid;
}

/**
 * Decode JWT token (simplified implementation)
 * In production, use a proper JWT library with verification
 */
function decodeJwt(token: string): any {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(jsonPayload);
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
    const user = await readItem<User>('users', userId);

    const userRoles = user.roles?.workspaces?.[workspaceId] || [];
    return userRoles.some(role => roles.includes(role as WorkspaceRole));
  } catch (error) {
    console.error('Error checking workspace role:', error);
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