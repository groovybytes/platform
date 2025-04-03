// @filename: user-management/users/get-user.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { User, Membership } from '~/types/operational';

import { handleApiError, badRequest, notFound, permissionDenied } from '~/utils/error';
import { secureEndpoint } from '~/utils/protect';
import { getRequestContext } from '~/utils/context';
import { readItem, queryItems } from '~/utils/cosmos/utils';
import { ok } from '~/utils/response';

/**
 * Sanitize user object to remove sensitive data
 */
function sanitizeUserResponse(user: User): Partial<User> {
  // Only return safe user fields
  const { id, name, status, preferences, emails, createdAt, modifiedAt } = user;
  return { id, name, status, preferences, emails, createdAt, modifiedAt };
}

/**
 * HTTP Trigger to get a user by ID
 * GET /v1/users/{id}
 */
const GetUserHandler: HttpHandler = secureEndpoint(
  {
    permissions: ["workspace:*:users:read:allow", "project:*:users:read:allow", "system:*:users:admin:allow"],
    match: "any"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const targetUserId = request.params.id;
      
      if (!targetUserId) {
        return badRequest('User ID is required');
      }
      
      // Get the user from the database
      const user = await readItem<User>('users', targetUserId);
      
      if (!user) {
        return notFound('User', targetUserId);
      }
      
      // Get the current user's context
      const { request: { userId, permissions }, workspace, project } = await getRequestContext(req);
      
      // If users are looking up themselves, allow it
      if (targetUserId === userId) {
        return {
          status: 200,
          jsonBody: sanitizeUserResponse(user)
        };
      }
      
      // Check if the user has system-level admin permission
      const hasSystemAdmin = permissions.some(p => p === "system:*:users:admin:allow");
      
      if (hasSystemAdmin) {
        return {
          status: 200,
          jsonBody: sanitizeUserResponse(user)
        };
      }
      
      // If not system admin, check if they share a workspace or project
      // and have appropriate permissions
      
      // Check for workspace-level permission first
      if (workspace) {
        // Does the target user belong to this workspace?
        const targetUserMemberships = await queryItems<Membership>(
          'membership',
          'SELECT * FROM c WHERE c.userId = @userId AND c.resourceType = "workspace" AND c.resourceId = @resourceId AND c.status = "active"',
          [
            { name: '@userId', value: targetUserId },
            { name: '@resourceId', value: workspace.id }
          ]
        );
        
        if (targetUserMemberships.length > 0 && 
            permissions.some(p => p.startsWith(`workspace:${workspace.id}:users:read:allow`) || 
                                  p === "workspace:*:users:read:allow")) {
          return ok(sanitizeUserResponse(user));
        }
      }
      
      // Check for project-level permission
      if (project) {
        // Does the target user belong to this project?
        const targetUserMemberships = await queryItems<Membership>(
          'membership',
          'SELECT * FROM c WHERE c.userId = @userId AND c.resourceType = "project" AND c.resourceId = @resourceId AND c.status = "active"',
          [
            { name: '@userId', value: targetUserId },
            { name: '@resourceId', value: project.id }
          ]
        );
        
        if (targetUserMemberships.length > 0 && 
            permissions.some(p => p.startsWith(`project:${project.id}:users:read:allow`) || 
                                  p === "project:*:users:read:allow")) {
          return ok(sanitizeUserResponse(user));
        }
      }
      
      // If they got here, they don't have permission
      return permissionDenied("users:read", "user", "You don't have permission to view this user");
    } catch (error) {
      context.error('Error getting user:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "GetUser",
  Route: "v1/users/{id}",
  Handler: GetUserHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { id: string },
  Output: {} as Partial<User>,
};