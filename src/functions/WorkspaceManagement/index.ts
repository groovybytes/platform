import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EndpointDefinition } from '~/types/endpoint';
import type { Workspace } from '~/types/operational';

import { queryItems, readItem, patchItem, deleteItem } from '~/utils/cosmos';
import { badRequest, conflict, notFound, handleApiError } from '~/utils/error';
import { secureEndpoint } from '~/utils/protect';

import { app } from '@azure/functions';

import CreateWorkspace from './create';
import UpdateWorkspace from './update';
import ListWorkspace from './list';
import GetWorkspace from './get';





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
    handler: CreateWorkspace.Handler,
  },
  GetWorkspace: {
    name: GetWorkspace.Name,
    route: GetWorkspace.Route,
    methods: GetWorkspace.Methods,
    handler: GetWorkspace.Handler,
  },
  ListWorkspaces: {
    name: ListWorkspace.Name,
    route: ListWorkspace.Route,
    methods: ListWorkspace.Methods,
    handler: ListWorkspace.Handler,
  },
  UpdateWorkspace: {
    name: UpdateWorkspace.Name,
    route: UpdateWorkspace.Route,
    methods: UpdateWorkspace.Methods,
    handler: UpdateWorkspace.Handler,
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

export type GetWorkspaceInput = typeof GetWorkspace.Input;
export type GetWorkspaceOutput = typeof GetWorkspace.Output;

export type ListWorkspacesInput = typeof ListWorkspace.Input;
export type ListWorkspacesOutput = typeof ListWorkspace.Output;

export type UpdateWorkspaceInput = { id: string } & Partial<Workspace>;
export type UpdateWorkspaceOutput = Workspace;

export type DeleteWorkspaceInput = { id: string };
export type DeleteWorkspaceOutput = void;

// Default export
export default Endpoints;