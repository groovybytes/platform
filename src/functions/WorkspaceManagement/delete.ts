import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Workspace } from '~/types/operational';
import type { PatchOperation } from '@azure/cosmos';

import { badRequest, conflict, handleApiError, notFound } from '~/utils/error';
import { deleteItem, patchItem, queryItems, readItem } from '~/utils/cosmos';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { sluggify } from '~/utils/utils';

/**
 * HTTP Trigger to delete a workspace
 * DELETE /api/v1/workspaces/{id}
 */
const DeleteWorkspaceHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:*:delete:allow",
    requireResource: "workspace"
  },
  async (request: HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
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

// Register the HTTP trigger
export default {
  Name: "UpdateWorkspace",
  Route: "v1/workspaces/{id}",
  Handler: UpdateWorkspaceHandler,
  Methods: ["PATCH"] as HttpMethod[],
  Input: {} as { id: string } & Partial<Workspace>,
  Output: {} as Workspace,
};