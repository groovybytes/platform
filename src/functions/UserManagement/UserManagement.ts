// @filename: user-management/index.ts
import type { EndpointDefinition } from '~/types/definitions';

import { app } from '@azure/functions';

import GetCurrentUser from './get-current-user';
import UpdateCurrentUser from './update-current-user';
import GetUserById from './get-user-by-id';
import ListUsers from './list-users';
import ListWorkspaceUsers from './list-workspace-users';
import ListProjectUsers from './list-project-users';

// Create the Endpoints object
export const Endpoints: Record<string, EndpointDefinition> = {
  GetCurrentUser: {
    name: GetCurrentUser.Name,
    route: GetCurrentUser.Route,
    methods: GetCurrentUser.Methods,
    handler: GetCurrentUser.Handler,
  },
  UpdateCurrentUser: {
    name: UpdateCurrentUser.Name,
    route: UpdateCurrentUser.Route,
    methods: UpdateCurrentUser.Methods,
    handler: UpdateCurrentUser.Handler,
  },
  GetUserById: {
    name: GetUserById.Name,
    route: GetUserById.Route,
    methods: GetUserById.Methods,
    handler: GetUserById.Handler,
  },
  ListUsers: {
    name: ListUsers.Name,
    route: ListUsers.Route,
    methods: ListUsers.Methods,
    handler: ListUsers.Handler,
  },
  ListWorkspaceUsers: {
    name: ListWorkspaceUsers.Name,
    route: ListWorkspaceUsers.Route,
    methods: ListWorkspaceUsers.Methods,
    handler: ListWorkspaceUsers.Handler,
  },
  ListProjectUsers: {
    name: ListProjectUsers.Name,
    route: ListProjectUsers.Route,
    methods: ListProjectUsers.Methods,
    handler: ListProjectUsers.Handler,
  }
};

// Register all HTTP triggers
Object.values(Endpoints).forEach(endpoint => {
  app.http(endpoint.name, {
    route: endpoint.route,
    methods: endpoint.methods,
    authLevel: 'anonymous', // Relies on auth middleware/token validation
    handler: endpoint.handler
  });
});

// Input/Output type definitions
export type GetCurrentUserOutput = typeof GetCurrentUser.Output;
export type UpdateCurrentUserInput = typeof UpdateCurrentUser.Input;
export type UpdateCurrentUserOutput = typeof UpdateCurrentUser.Output;
export type GetUserByIdInput = typeof GetUserById.Input;
export type GetUserByIdOutput = typeof GetUserById.Output;
export type ListUsersOutput = typeof ListUsers.Output;
export type ListWorkspaceUsersInput = typeof ListWorkspaceUsers.Input;
export type ListWorkspaceUsersOutput = typeof ListWorkspaceUsers.Output;
export type ListProjectUsersInput = typeof ListProjectUsers.Input;
export type ListProjectUsersOutput = typeof ListProjectUsers.Output;

// Default export
export default Endpoints;

// @filename: user-management/get-current-user.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { User } from '~/types/operational';

import { handleApiError } from '~/utils/error';
import { readItem } from '~/utils/cosmos';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';

/**
 * Sanitize user object to remove sensitive data
 */
function sanitizeUserResponse(user: User): Partial<User> {
  // Only return safe user fields
  const { id, name, status, preferences, emails } = user;
  return { id, name, status, preferences, emails };
}

/**
 * HTTP Trigger to get the current user's profile
 * GET /api/v1/users/me
 */
const GetCurrentUserHandler: HttpHandler = secureEndpoint(
  "system:*:users:read:allow",
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      // Get user ID from request context
      const { request: { userId } } = context?.requestContext ?? await getRequestContext(req);
      
      // Fetch user from Cosmos DB
      const user = await readItem<User>('users', userId);
      
      // Return sanitized user data
      return {
        status: 200,
        jsonBody: sanitizeUserResponse(user)
      };
    } catch (error) {
      context.error('Error fetching current user:', error);
      return handleApiError(error);
    }
  }
);

// Define the HTTP trigger
export default {
  Name: "GetCurrentUser",
  Route: "v1/users/me",
  Handler: GetCurrentUserHandler,
  Methods: ["GET"] as HttpMethod[],
  Output: {} as Partial<User>,
};

// @filename: user-management/update-current-user.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { User } from '~/types/operational';
import type { PatchOperation } from '@azure/cosmos';

import { handleApiError, badRequest } from '~/utils/error';
import { patchItem } from '~/utils/cosmos';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';

// Define allowed update fields
const UPDATABLE_FIELDS = ['name', 'preferences'];

interface UserUpdateRequest {
  name?: string;
  preferences?: {
    language?: string;
    timezone?: string;
  };
}

/**
 * HTTP Trigger to update the current user's profile
 * PATCH /api/v1/users/me
 */
const UpdateCurrentUserHandler: HttpHandler = secureEndpoint(
  "system:*:users:update:allow",
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      // Get user ID from request context
      const { request: { userId } } = context?.requestContext ?? await getRequestContext(req);
      
      // Parse and validate request body
      const updates: UserUpdateRequest = await req.json();
      
      // Only allow updates to specific fields
      const operations: PatchOperation[] = [];
      let hasValidUpdates = false;
      
      for (const field of UPDATABLE_FIELDS) {
        if (updates[field as keyof UserUpdateRequest] !== undefined) {
          if (field === 'preferences' && typeof updates.preferences === 'object') {
            // Handle nested preference updates
            for (const prefKey in updates.preferences) {
              operations.push({
                op: 'replace',
                path: `/preferences/${prefKey}`,
                value: updates.preferences[prefKey as keyof typeof updates.preferences]
              });
              hasValidUpdates = true;
            }
          } else {
            // Handle top-level field updates
            operations.push({
              op: 'replace',
              path: `/${field}`,
              value: updates[field as keyof UserUpdateRequest]
            });
            hasValidUpdates = true;
          }
        }
      }
      
      if (!hasValidUpdates) {
        return badRequest('No valid fields to update. Allowed fields: ' + UPDATABLE_FIELDS.join(', '));
      }
      
      // Add timestamp update
      operations.push({
        op: 'replace',
        path: '/modifiedAt',
        value: new Date().toISOString()
      });
      
      // Update user in Cosmos DB
      const updatedUser = await patchItem<User>('users', userId, operations);
      
      // Return sanitized updated user data
      return {
        status: 200,
        jsonBody: {
          id: updatedUser.id,
          name: updatedUser.name,
          status: updatedUser.status,
          preferences: updatedUser.preferences,
          emails: updatedUser.emails
        }
      };
    } catch (error) {
      context.error('Error updating current user:', error);
      return handleApiError(error);
    }
  }
);

// Define the HTTP trigger
export default {
  Name: "UpdateCurrentUser",
  Route: "v1/users/me",
  Handler: UpdateCurrentUserHandler,
  Methods: ["PATCH"] as HttpMethod[],
  Input: {} as UserUpdateRequest,
  Output: {} as Partial<User>,
};

// @filename: user-management/get-user-by-id.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { User } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { readItem } from '~/utils/cosmos';
import { secureEndpoint } from '~/utils/protect';

/**
 * Sanitize user object to remove sensitive data
 */
function sanitizeUserResponse(user: User): Partial<User> {
  // Only return safe user fields
  const { id, name, status, preferences, emails } = user;
  return { id, name, status, preferences, emails };
}

/**
 * HTTP Trigger to get a user by ID
 * GET /api/v1/users/{id}
 */
const GetUserByIdHandler: HttpHandler = secureEndpoint(
  "system:*:users:read:allow",
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const userId = request.params.id;
      
      if (!userId) {
        return badRequest('User ID is required');
      }

      // Fetch user from Cosmos DB
      const user = await readItem<User>('users', userId);
      
      if (!user) {
        return notFound('User', userId);
      }
      
      // Return sanitized user data
      return {
        status: 200,
        jsonBody: sanitizeUserResponse(user)
      };
    } catch (error) {
      context.error('Error fetching user:', error);
      return handleApiError(error);
    }
  }
);

// Define the HTTP trigger
export default {
  Name: "GetUserById",
  Route: "v1/users/{id}",
  Handler: GetUserByIdHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { id: string },
  Output: {} as Partial<User>,
};

// @filename: user-management/list-users.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { User } from '~/types/operational';

import { queryItems } from '~/utils/cosmos';
import { handleApiError } from '~/utils/error';
import { secureEndpoint } from '~/utils/protect';

interface UserListResponse {
  items: Partial<User>[];
  count: number;
}

/**
 * HTTP Trigger to list all users
 * GET /api/v1/users
 */
const ListUsersHandler: HttpHandler = secureEndpoint(
  "system:*:users:list:allow",
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const limit = parseInt(request.query.get('limit') || '50', 10);
      const status = request.query.get('status') || 'active';
      
      // Build query for users
      let query = `SELECT u.id, u.name, u.status, u.preferences, u.emails FROM u WHERE u.status = @status`;
      let parameters = [{ name: '@status', value: status }];
      
      // Execute the query with pagination
      const users = await queryItems<User>('users', query, parameters);
      
      // Return paginated response
      return {
        status: 200,
        jsonBody: {
          items: users.slice(0, limit).map(user => ({
            id: user.id,
            name: user.name,
            status: user.status,
            preferences: user.preferences,
            emails: user.emails
          })),
          count: users.length
        }
      };
    } catch (error) {
      context.error('Error listing users:', error);
      return handleApiError(error);
    }
  }
);

// Define the HTTP trigger
export default {
  Name: "ListUsers",
  Route: "v1/users",
  Handler: ListUsersHandler,
  Methods: ["GET"] as HttpMethod[],
  Output: {} as UserListResponse,
};

// @filename: user-management/list-workspace-users.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { User, Membership } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { queryItems, readItem } from '~/utils/cosmos';
import { getResourceMembers } from '~/utils/membership';
import { secureEndpoint } from '~/utils/protect';

interface WorkspaceUserResponse {
  user: {
    id: string;
    name: string;
    status: string;
    emails: {
      primary: string;
    }
  };
  membership: {
    membershipType: "member" | "guest";
    status: string;
    joinedAt?: string;
    invitedAt: string;
  };
}

interface UserListResponse {
  items: WorkspaceUserResponse[];
  count: number;
}

/**
 * HTTP Trigger to list all users in a workspace
 * GET /api/v1/workspaces/{workspaceId}/users
 */
const ListWorkspaceUsersHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:members:read:allow",
    requireResource: "workspace"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const workspaceId = request.params.workspaceId;
      
      if (!workspaceId) {
        return badRequest('Workspace ID is required');
      }
      
      // Verify workspace exists
      const workspace = await readItem('workspaces', workspaceId);
      if (!workspace) {
        return notFound('Workspace', workspaceId);
      }
      
      // Get all members for this workspace
      const memberships = await getResourceMembers("workspace", workspaceId);
      
      if (memberships.length === 0) {
        return {
          status: 200,
          jsonBody: {
            items: [],
            count: 0
          }
        };
      }
      
      // Get user details for each membership
      const userResponses = await Promise.all(
        memberships.map(async (membership) => {
          try {
            const user = await readItem<User>('users', membership.userId);
            
            return {
              user: {
                id: user.id,
                name: user.name,
                status: user.status,
                emails: {
                  primary: user.emails.primary
                }
              },
              membership: {
                membershipType: membership.membershipType,
                status: membership.status,
                joinedAt: membership.joinedAt,
                invitedAt: membership.invitedAt
              }
            };
          } catch (error) {
            // Skip users that can't be found (shouldn't happen with referential integrity)
            context.warn(`Couldn't find user ${membership.userId} for workspace ${workspaceId}`);
            return null;
          }
        })
      );
      
      // Filter out null responses and return
      const validResponses = userResponses.filter((r): r is WorkspaceUserResponse => r !== null);
      
      return {
        status: 200,
        jsonBody: {
          items: validResponses,
          count: validResponses.length
        }
      };
    } catch (error) {
      context.error('Error listing workspace users:', error);
      return handleApiError(error);
    }
  }
);

// Define the HTTP trigger
export default {
  Name: "ListWorkspaceUsers",
  Route: "v1/workspaces/{workspaceId}/users",
  Handler: ListWorkspaceUsersHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { workspaceId: string },
  Output: {} as UserListResponse,
};

// @filename: user-management/list-project-users.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { User, Membership } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { queryItems, readItem } from '~/utils/cosmos';
import { getResourceMembers } from '~/utils/membership';
import { secureEndpoint } from '~/utils/protect';

interface ProjectUserResponse {
  user: {
    id: string;
    name: string;
    status: string;
    emails: {
      primary: string;
    }
  };
  membership: {
    membershipType: "member" | "guest";
    status: string;
    joinedAt?: string;
    invitedAt: string;
  };
}

interface UserListResponse {
  items: ProjectUserResponse[];
  count: number;
}

/**
 * HTTP Trigger to list all users in a project
 * GET /api/v1/projects/{projectId}/users
 */
const ListProjectUsersHandler: HttpHandler = secureEndpoint(
  {
    permissions: "project:*:members:read:allow",
    requireResource: "project"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const projectId = request.params.projectId;
      
      if (!projectId) {
        return badRequest('Project ID is required');
      }
      
      // Verify project exists
      const project = await readItem('projects', projectId);
      if (!project) {
        return notFound('Project', projectId);
      }
      
      // Get all members for this project
      const memberships = await getResourceMembers("project", projectId);
      
      if (memberships.length === 0) {
        return {
          status: 200,
          jsonBody: {
            items: [],
            count: 0
          }
        };
      }
      
      // Get user details for each membership
      const userResponses = await Promise.all(
        memberships.map(async (membership) => {
          try {
            const user = await readItem<User>('users', membership.userId);
            
            return {
              user: {
                id: user.id,
                name: user.name,
                status: user.status,
                emails: {
                  primary: user.emails.primary
                }
              },
              membership: {
                membershipType: membership.membershipType,
                status: membership.status,
                joinedAt: membership.joinedAt,
                invitedAt: membership.invitedAt
              }
            };
          } catch (error) {
            // Skip users that can't be found (shouldn't happen with referential integrity)
            context.warn(`Couldn't find user ${membership.userId} for project ${projectId}`);
            return null;
          }
        })
      );
      
      // Filter out null responses and return
      const validResponses = userResponses.filter((r): r is ProjectUserResponse => r !== null);
      
      return {
        status: 200,
        jsonBody: {
          items: validResponses,
          count: validResponses.length
        }
      };
    } catch (error) {
      context.error('Error listing project users:', error);
      return handleApiError(error);
    }
  }
);

// Define the HTTP trigger
export default {
  Name: "ListProjectUsers",
  Route: "v1/projects/{projectId}/users",
  Handler: ListProjectUsersHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { projectId: string },
  Output: {} as UserListResponse,
};