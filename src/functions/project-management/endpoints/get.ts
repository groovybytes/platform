// @filename: project-management/endpoints/get.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Project } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { readItem } from '~/utils/cosmos/utils';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to get a project by ID
 * GET /api/v1/projects/{id}
 */
const GetProjectHandler: HttpHandler = secureEndpoint(
  {
    permissions: "project:*:*:read:allow",
    requireResource: "project"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const { project: contextProject } = context?.requestContext ?? await getRequestContext(request);
      
      // Verify project context is available
      if (!contextProject) {
        return badRequest('Project context is required');
      }
      
      const projectId = contextProject.id;
      
      // Get the project from database
      const project = await readItem<Project>('projects', projectId, contextProject.workspaceId);
      
      if (!project) {
        return notFound('Project', projectId);
      }
      
      return ok(project);
    } catch (error) {
      context.error('Error getting project:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "GetProject",
  Route: "v1/projects/{id}",
  Handler: GetProjectHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { id: string },
  Output: {} as Project,
};