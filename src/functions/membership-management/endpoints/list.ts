// @filename: user-management/membership/list.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Membership } from '~/types/operational';

import { handleApiError, badRequest } from '~/utils/error';
import { secureEndpoint } from '~/utils/protect';

import { getRequestContext } from '~/utils/context';
import { queryItems } from '~/utils/cosmos/utils';
import { hasPermission } from '~/utils/permissions/permissions';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to list memberships with filtering options
 * GET /v1/memberships
 * 
 * Query parameters:
 * - resourceType: "workspace" | "project" (optional)
 * - resourceId: string (optional)
 * - userId: string (optional)
 * - status: "active" | "pending" | "inactive" | "revoked" | "suspended" | "expired" (optional)
 * - membershipType: "member" | "guest" (optional)
 */
const ListMembershipsHandler: HttpHandler = secureEndpoint(
  {
    permissions: ["workspace:*:members:read:allow", "project:*:members:read:allow", "system:*:members:read:allow"],
    match: "any"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      
      // Get query parameters
      const url = new URL(request.url);
      const resourceType = url.searchParams.get('resourceType');
      const resourceId = url.searchParams.get('resourceId');
      const userId = url.searchParams.get('userId');
      const status = url.searchParams.get('status');
      const membershipType = url.searchParams.get('membershipType');
      
      if (!resourceType || !resourceId) {
        return badRequest('Resource type and ID are required');
      }
      
      const { request: { permissions, userId: currentUserId }, workspace, project } = context?.requestContext ?? await getRequestContext(req);
      
      // Build the query
      let query = 'SELECT * FROM c WHERE 1=1';
      const parameters = [];
      
      if (resourceType) {
        query += ' AND c.resourceType = @resourceType';
        parameters.push({ name: '@resourceType', value: resourceType });
        
        // Verify permission for the resource type
        if (resourceType === 'workspace') {
          // Check if we have a specific resourceId for this query
          if (resourceId) {
            // We need to verify the user has access to this specific workspace
            if (!workspace || workspace.id !== resourceId) {
              return badRequest('Invalid workspace context');
            }
          } else {
            // We're querying all workspaces, so we need system-level permission
            if (!hasPermission(permissions, 'system:*:members:read:allow')) {
              return badRequest('Insufficient permissions to list all workspace memberships');
            }
          }
        } else if (resourceType === 'project') {
          // Similar checks for projects
          if (resourceId) {
            if (!project || project.id !== resourceId) {
              return badRequest('Invalid project context');
            }
          } else {
            if (!hasPermission(permissions, 'system:*:members:read:allow')) {
              return badRequest('Insufficient permissions to list all project memberships');
            }
          }
        }
      }
      
      if (resourceId) {
        query += ' AND c.resourceId = @resourceId';
        parameters.push({ name: '@resourceId', value: resourceId });
      }
      
      if (userId) {
        query += ' AND c.userId = @userId';
        parameters.push({ name: '@userId', value: userId });
      } else {        
        // Add check for access - either admin or looking at own memberships
        const hasAdminAccess = hasPermission(permissions, [
            'system:*:members:read:allow', 
            'workspace:*:members:admin:allow', 
            'project:*:members:admin:allow'
          ], 
          { match: 'any' }
        );
        
        if (!hasAdminAccess) {
          // Non-admins can only see their own memberships
          query += ' AND c.userId = @currentUserId';
          parameters.push({ name: '@currentUserId', value: currentUserId });
        }
      }
      
      if (status) {
        query += ' AND c.status = @status';
        parameters.push({ name: '@status', value: status });
      }
      
      if (membershipType) {
        query += ' AND c.membershipType = @membershipType';
        parameters.push({ name: '@membershipType', value: membershipType });
      }
      
      // Query memberships
      const memberships = await queryItems<Membership>(
        'membership',
        query,
        parameters
      );
      
      return ok(memberships);
    } catch (error) {
      context.error('Error listing memberships:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "ListMemberships",
  Route: "v1/memberships",
  Handler: ListMembershipsHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { 
    resourceType?: string; 
    resourceId?: string; 
    userId?: string; 
    status?: string; 
    membershipType?: string; 
  },
  Output: [] as Membership[],
};