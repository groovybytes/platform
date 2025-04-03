// @filename: workspace-management/endpoints/list.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Workspace } from '~/types/operational';

import { getUserMemberships } from '~/utils/membership';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { handleApiError } from '~/utils/error';
import { readItem } from '~/utils/cosmos/utils';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to list all workspaces for the current user
 * GET /api/v1/workspaces
 */
const ListWorkspacesHandler: HttpHandler = secureEndpoint(
  "system:*:workspaces:list:allow",
  async (request: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      // Get user ID from request context
      const { request: { userId } } = context?.requestContext ?? await getRequestContext(request);

      // Get user's memberships
      const memberships = await getUserMemberships(userId, "active");
      
      // Extract workspace IDs
      const workspaceIds = memberships
        .filter(m => m.resourceType === "workspace")
        .map(m => m.resourceId);
      
      if (workspaceIds.length === 0) {
        return ok([]);
      }

      // Get workspaces data
      const workspaces = await Promise.all(
        workspaceIds.map(id => readItem<Workspace>('workspaces', id))
      );
      
      // Filter out any null results (in case a workspace was deleted)
      const validWorkspaces = workspaces.filter(w => w !== null);

      return ok(validWorkspaces);
    } catch (error) {
      context.error('Error listing workspaces:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "ListWorkspaces",
  Route: "v1/workspaces",
  Handler: ListWorkspacesHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: void 0 as void,
  Output: [] as Workspace[],
};