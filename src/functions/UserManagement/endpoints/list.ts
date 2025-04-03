// @filename: user-management/users/list-users.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { User, Membership } from '~/types/operational';

import { handleApiError, badRequest } from '~/utils/error';
import { secureEndpoint } from '~/utils/protect';
import { getRequestContext } from '~/utils/context';
import { queryItems } from '~/utils/cosmos/utils';

import { sanitizeUserResponse } from '../_utils';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to list users with filtering
 * GET /v1/users
 * 
 * Query parameters:
 * - resourceType: "workspace" | "project" (optional)
 * - resourceId: string (optional)
 * - status: "active" | "pending" | "inactive" | "suspended" (optional)
 * - email: string (optional, for searching by email)
 * - name: string (optional, for searching by name)
 */
const ListUsersHandler: HttpHandler = secureEndpoint(
  {
    permissions: ["workspace:*:users:read:allow", "project:*:users:read:allow", "system:*:users:admin:allow"],
    match: "any"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      
      // Get query parameters
      const resourceType = request.query.get('resourceType');
      const resourceId = request.query.get('resourceId');
      const status = request.query.get('status');
      const email = request.query.get('email');
      const name = request.query.get('name');
      
      // Get the current user's context
      const { request: { userId, permissions }, workspace, project } = await getRequestContext(req);
      
      // Check if the user has system-level admin permission
      const hasSystemAdmin = permissions.some(p => p === "system:*:users:admin:allow");
      
      let userIds: string[] = [];
      
      // If filtering by resource, check permissions and get users in that resource
      if (resourceType && resourceId) {
        // Validate resource access
        if (resourceType === 'workspace') {
          // Check workspace access
          if (!workspace || workspace.id !== resourceId) {
            return badRequest('Invalid workspace context');
          }
          
          // Check permission for this workspace
          if (!hasSystemAdmin && 
              !permissions.some(p => p.startsWith(`workspace:${resourceId}:users:read:allow`) || 
                                    p === "workspace:*:users:read:allow")) {
            return badRequest('Insufficient permissions to list users in this workspace');
          }
          
          // Get all users in this workspace
          const memberships = await queryItems<Membership>(
            'membership',
            'SELECT c.userId FROM c WHERE c.resourceType = @resourceType AND c.resourceId = @resourceId AND c.status = "active"',
            [
              { name: '@resourceType', value: 'workspace' },
              { name: '@resourceId', value: resourceId }
            ]
          );
          
          userIds = memberships.map(m => m.userId);
        } else if (resourceType === 'project') {
          // Check project access
          if (!project || project.id !== resourceId) {
            return badRequest('Invalid project context');
          }
          
          // Check permission for this project
          if (!hasSystemAdmin && 
              !permissions.some(p => p.startsWith(`project:${resourceId}:users:read:allow`) || 
                                    p === "project:*:users:read:allow")) {
            return badRequest('Insufficient permissions to list users in this project');
          }
          
          // Get all users in this project
          const memberships = await queryItems<Membership>(
            'membership',
            'SELECT c.userId FROM c WHERE c.resourceType = @resourceType AND c.resourceId = @resourceId AND c.status = "active"',
            [
              { name: '@resourceType', value: 'project' },
              { name: '@resourceId', value: resourceId }
            ]
          );
          
          userIds = memberships.map(m => m.userId);
        } else {
          return badRequest('Invalid resource type. Must be "workspace" or "project"');
        }
        
        if (userIds.length === 0) {
          // No users found for this resource
          return ok([]);
        }
      } else if (!hasSystemAdmin) {
        // If not filtering by resource and not a system admin, only allow if in a workspace/project context
        if (workspace) {
          // Check permission for this workspace
          if (!permissions.some(p => p.startsWith(`workspace:${workspace.id}:users:read:allow`) || 
                                    p === "workspace:*:users:read:allow")) {
            return badRequest('Insufficient permissions to list users');
          }
          
          // Get all users in this workspace
          const memberships = await queryItems<Membership>(
            'membership',
            'SELECT c.userId FROM c WHERE c.resourceType = @resourceType AND c.resourceId = @resourceId AND c.status = "active"',
            [
              { name: '@resourceType', value: 'workspace' },
              { name: '@resourceId', value: workspace.id }
            ]
          );
          
          userIds = memberships.map(m => m.userId);
        } else if (project) {
          // Check permission for this project
          if (!permissions.some(p => p.startsWith(`project:${project.id}:users:read:allow`) || 
                                    p === "project:*:users:read:allow")) {
            return badRequest('Insufficient permissions to list users');
          }
          
          // Get all users in this project
          const memberships = await queryItems<Membership>(
            'membership',
            'SELECT c.userId FROM c WHERE c.resourceType = @resourceType AND c.resourceId = @resourceId AND c.status = "active"',
            [
              { name: '@resourceType', value: 'project' },
              { name: '@resourceId', value: project.id }
            ]
          );
          
          userIds = memberships.map(m => m.userId);
        } else {
          return badRequest('Insufficient permissions to list all users');
        }
        
        if (userIds.length === 0) {
          // No users found in context
          return ok([]);
        }
      }
      
      // Build query for users
      let query = 'SELECT * FROM c WHERE 1=1';
      const parameters = [];
      
      // Add filters
      if (userIds.length > 0) {
        // Use IN operator for multiple user IDs
        query += ' AND c.id IN (' + userIds.map((_, i) => `@userId${i}`).join(',') + ')';
        userIds.forEach((id, i) => {
          parameters.push({ name: `@userId${i}`, value: id });
        });
      }
      
      if (status) {
        query += ' AND c.status = @status';
        parameters.push({ name: '@status', value: status });
      }
      
      if (email) {
        query += ' AND CONTAINS(c.emails.primary, @email, true)';
        parameters.push({ name: '@email', value: email });
      }
      
      if (name) {
        query += ' AND CONTAINS(c.name, @name, true)';
        parameters.push({ name: '@name', value: name });
      }
      
      // Execute query
      const users = await queryItems<User>(
        'users',
        query,
        parameters
      );
      
      // Sanitize response
      const sanitizedUsers = users.map(user => sanitizeUserResponse(user));
      return ok(sanitizedUsers);
    } catch (error) {
      context.error('Error listing users:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "ListUsers",
  Route: "v1/users",
  Handler: ListUsersHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { 
    resourceType?: string; 
    resourceId?: string; 
    status?: string; 
    email?: string; 
    name?: string; 
  },
  Output: [] as Partial<User>[],
};