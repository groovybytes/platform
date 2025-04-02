import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { User, Workspace } from '~/types/operational';

// Import necessary functions - these would be implemented in your membership module
import { createMembership, getUserMemberships, assignRolesToUser } from '~/utils/membership';

import { queryItems, createItem, readItem, patchItem, deleteItem } from '~/utils/cosmos';
import { badRequest, conflict, notFound, handleApiError } from '~/utils/error';
import { secureEndpoint } from '~/utils/protect';

import { app } from '@azure/functions';
import { nanoid } from 'nanoid';

import CreateWorkspace from './create';
import type { EndpointDefinition } from '~/types/endpoint';


/**
 * HTTP Trigger to get a workspace by ID
 * GET /api/v1/workspaces/{id}
 */
const GetWorkspaceHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:*:read:allow",
    requireResource: "workspace"
  },
  async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const workspaceId = request.params.id;
      
      if (!workspaceId) {
        return badRequest('Workspace ID is required');
      }

      // Get workspace from Cosmos DB
      const workspace = await readItem<Workspace>('workspaces', workspaceId);
      
      if (!workspace) {
        return notFound('Workspace', workspaceId);
      }

      return {
        status: 200,
        jsonBody: workspace
      };
    } catch (error) {
      context.error('Error getting workspace:', error);
      return handleApiError(error);
    }
  }
);

/**
 * HTTP Trigger to list all workspaces for the current user
 * GET /api/v1/workspaces
 */
const ListWorkspacesHandler: HttpHandler = secureEndpoint(
  "system:*:workspaces:list:allow",
  async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      // Get user ID from request context
      const { request: { id: userId } } = await getRequestContext(request);

      // Get user's memberships
      const memberships = await getUserMemberships(userId, "active");
      
      // Extract workspace IDs
      const workspaceIds = memberships
        .filter(m => m.resourceType === "workspace")
        .map(m => m.resourceId);
      
      if (workspaceIds.length === 0) {
        return {
          status: 200,
          jsonBody: []
        };
      }

      // Get workspaces data
      const workspaces = await Promise.all(
        workspaceIds.map(id => readItem<Workspace>('workspaces', id))
      );
      
      // Filter out any null results (in case a workspace was deleted)
      const validWorkspaces = workspaces.filter(w => w !== null);

      return {
        status: 200,
        jsonBody: validWorkspaces
      };
    } catch (error) {
      context.error('Error listing workspaces:', error);
      return handleApiError(error);
    }
  }
);

/**
 * HTTP Trigger to update a workspace
 * PATCH /api/v1/workspaces/{id}
 */
const UpdateWorkspaceHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:settings:update:allow",
    requireResource: "workspace"
  },
  async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const workspaceId = request.params.id;
      
      if (!workspaceId) {
        return badRequest('Workspace ID is required');
      }

      // Get user ID from request context
      const { request: { id: userId } } = await getRequestContext(request);
      
      // Get the existing workspace
      const existingWorkspace = await readItem<Workspace>('workspaces', workspaceId);
      
      if (!existingWorkspace) {
        return notFound('Workspace', workspaceId);
      }

      // Parse the update payload
      const updates = await request.json() as Partial<Workspace>;
      
      // Validate updates
      const allowedUpdates: (keyof Workspace)[] = ['name', 'settings', 'status'];
      const invalidKeys = Object.keys(updates).filter(key => !allowedUpdates.includes(key as keyof Workspace));
      
      if (invalidKeys.length > 0) {
        return badRequest(`Invalid update fields: ${invalidKeys.join(', ')}`);
      }

      // If name is being updated, check if the new slug would conflict
      if (updates.name && updates.name !== existingWorkspace.name) {
        const newSlug = generateSlug(updates.name);
        
        // Check for slug conflicts
        const conflictingWorkspaces = await queryItems<Workspace>(
          'workspaces',
          'SELECT * FROM c WHERE c.slug = @slug AND c.id != @id',
          [
            { name: '@slug', value: newSlug },
            { name: '@id', value: workspaceId }
          ]
        );
        
        if (conflictingWorkspaces.length > 0) {
          return conflict('Workspace with this name already exists');
        }
        
        // Update the slug
        updates.slug = newSlug;
      }

      // Prepare the update operations
      const operations = [];
      
      if (updates.name) {
        operations.push({ op: 'replace', path: '/name', value: updates.name });
        operations.push({ op: 'replace', path: '/slug', value: updates.slug });
      }
      
      if (updates.status) {
        operations.push({ op: 'replace', path: '/status', value: updates.status });
      }
      
      if (updates.settings) {
        // Only update specific settings to prevent overriding all settings
        const settingsToUpdate = Object.entries(updates.settings);
        
        for (const [key, value] of settingsToUpdate) {
          operations.push({ op: 'replace', path: `/settings/${key}`, value });
        }
      }
      
      // Always update modified metadata
      operations.push({ op: 'replace', path: '/modifiedAt', value: new Date().toISOString() });
      operations.push({ op: 'replace', path: '/modifiedBy', value: userId });
      
      // Apply the updates
      const updatedWorkspace = await patchItem<Workspace>(
        'workspaces',
        workspaceId,
        operations
      );

      return {
        status: 200,
        jsonBody: updatedWorkspace
      };
    } catch (error) {
      context.error('Error updating workspace:', error);
      return handleApiError(error);
    }
  }
);

/**
 * HTTP Trigger to delete a workspace
 * DELETE /api/v1/workspaces/{id}
 */
const DeleteWorkspaceHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:*:delete:allow",
    requireResource: "workspace"
  },
  async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const workspaceId = request.params.id;
      
      if (!workspaceId) {
        return badRequest('Workspace ID is required');
      }

      // Get the existing workspace
      const existingWorkspace = await readItem<Workspace>('workspaces', workspaceId);
      
      if (!existingWorkspace) {
        return notFound('Workspace', workspaceId);
      }

      // Delete the workspace
      await deleteItem('workspaces', workspaceId);

      // TODO: In a real implementation, we would:
      // 1. Delete or archive all associated memberships
      // 2. Delete or archive all associated roles
      // 3. Delete or archive all associated projects
      // 4. Trigger any cleanup workflows

      return {
        status: 204
      };
    } catch (error) {
      context.error('Error deleting workspace:', error);
      return handleApiError(error);
    }
  }
);

// Create the Endpoints object
export const Endpoints: Record<string, EndpointDefinition> = {
  CreateWorkspace: {
    name: CreateWorkspace.Name,
    route: CreateWorkspace.Route,
    methods: CreateWorkspace.Methods,
    handler: CreateWorkspace.Handler
  },
  GetWorkspace: {
    name: "GetWorkspace",
    route: "v1/workspaces/{id}",
    methods: ["GET"],
    handler: GetWorkspaceHandler
  },
  ListWorkspaces: {
    name: "ListWorkspaces",
    route: "v1/workspaces",
    methods: ["GET"],
    handler: ListWorkspacesHandler
  },
  UpdateWorkspace: {
    name: "UpdateWorkspace",
    route: "v1/workspaces/{id}",
    methods: ["PATCH"],
    handler: UpdateWorkspaceHandler
  },
  DeleteWorkspace: {
    name: "DeleteWorkspace",
    route: "v1/workspaces/{id}",
    methods: ["DELETE"],
    handler: DeleteWorkspaceHandler
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
export type CreateWorkspaceInput = typeof CreateWorkspace.Input;
export type CreateWorkspaceOutput = typeof CreateWorkspace.Output;

export type GetWorkspaceInput = { id: string };
export type GetWorkspaceOutput = Workspace;

export type ListWorkspacesInput = void;
export type ListWorkspacesOutput = Workspace[];

export type UpdateWorkspaceInput = { id: string } & Partial<Workspace>;
export type UpdateWorkspaceOutput = Workspace;

export type DeleteWorkspaceInput = { id: string };
export type DeleteWorkspaceOutput = void;

// Default export
export default Endpoints;