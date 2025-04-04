// @filename: workspace-management/get.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Workspace } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { secureEndpoint } from '~/utils/protect';
import { readItem } from '~/utils/cosmos/utils';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to get a workspace by ID
 * GET /api/v1/workspaces/{id}
 */
const GetWorkspaceHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:*:read:allow",
    requireResource: "workspace"
  },
  async (req: Request | HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const workspaceId = request.params.id || request.query.get('id');
      
      if (!workspaceId) {
        return badRequest('Workspace ID is required');
      }

      // Get workspace from Cosmos DB
      const workspace = await readItem<Workspace>('workspaces', workspaceId);
      
      if (!workspace) {
        return notFound('Workspace', workspaceId);
      }

      return ok(workspace);
    } catch (error) {
      context.error('Error getting workspace:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "GetWorkspace",
  Route: "v1/workspaces/{id}",
  Handler: GetWorkspaceHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { id: string },
  Output: {} as Workspace,
};