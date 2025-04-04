import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Workspace } from '~/types/operational';

import { queryItems, createItem, patchItem } from '~/utils/cosmos/utils';
import { badRequest, conflict, handleApiError } from '~/utils/error';

import { assignRolesToUser, createMembership } from '~/utils/membership';
import { getRequestContext } from '~/utils/context';

import { BASE_URL } from '~/utils/config';

import { secureEndpoint } from '~/utils/protect';
import { sluggify } from '~/utils/utils';
import { nanoid } from 'nanoid';
import { created } from '~/utils/response';

/**
 * HTTP Trigger to create a new project in a workspace
 * POST /api/v1/workspaces/{workspaceId}/projects
 */
const CreateProjectHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:projects:create:allow",
    requireResource: "workspace"
  },
  async (request: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      // Get user ID from request context
      const { request: { userId }, workspace } = context?.requestContext ?? await getRequestContext(request);
      
      // Ensure we have a workspace context
      if (!workspace) {
        return badRequest('Workspace context is required');
      }
      
      const workspaceId = workspace.id;
      
      // Get the existing workspace
      const existingWorkspace = await readItem<Workspace>('workspaces', workspaceId, workspaceId);
      
      if (!existingWorkspace) {
        return notFound('Workspace', workspaceId);
      }

      // Parse and validate request body
      const body = await request.json() as Project;
      const { name, description } = body;

      if (!name) {
        return badRequest('Project name is required');
      }

      // Generate slug from name
      const slug = sluggify(name);

      // Check if slug is already taken in this workspace
      const existingProjects = await queryItems<Project>(
        'projects',
        'SELECT * FROM c WHERE c.workspaceId = @workspaceId AND c.slug = @slug',
        [
          { name: '@workspaceId', value: workspaceId },
          { name: '@slug', value: slug }
        ]
      );

      if (existingProjects.length > 0) {
        return conflict('Project with this name already exists in this workspace');
      }

      // Create project with default settings and owner role assignment
      const { project: createdProject } = await createProjectWithDefaults(
        name,
        slug,
        workspaceId,
        userId,
        description
      );

      // Update the workspace to include this project
      await patchItem<Workspace>(
        'workspaces',
        workspaceId,
        [{ op: 'add', path: '/projects/-', value: createdProject.id }],
        workspaceId
      );

      return created(createdProject);
    } catch (error) {
      context.error('Error creating project:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "CreateProject",
  Route: 'v1/workspaces/{workspaceId}/projects',
  Handler: CreateProjectHandler,
  Methods: ['POST'] as HttpMethod[],
  Input: {} as Project,
  Output: {} as Project,
};