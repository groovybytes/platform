// @filename: project-management/endpoints/list.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Project } from '~/types/operational';

import { badRequest, handleApiError } from '~/utils/error';
import { queryItems } from '~/utils/cosmos/utils';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to list projects for a workspace
 * GET /api/v1/workspaces/{workspaceId}/projects
 */
const ListProjectsHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:projects:read:allow",
    requireResource: "workspace"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const { workspace } = context?.requestContext ?? await getRequestContext(req);
      
      // Verify workspace context is available
      if (!workspace) {
        return badRequest('Workspace context is required');
      }
      
      const workspaceId = workspace.id;
      
      // Get projects for the workspace
      const projects = await queryItems<Project>(
        'projects',
        'SELECT * FROM c WHERE c.workspaceId = @workspaceId',
        [{ name: '@workspaceId', value: workspaceId }]
      );
      
      return ok({
        items: projects,
        count: projects.length
      });
    } catch (error) {
      context.error('Error listing projects:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "ListProjects",
  Route: "v1/projects",
  Handler: ListProjectsHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { workspaceId: string },
  Output: {} as { items: Project[], count: number },
};