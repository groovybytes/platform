// @filename: project-management/endpoints/delete.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Project, Workspace, Membership, AssignedRole } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { deleteItem, patchItem, queryItems, readItem } from '~/utils/cosmos/utils';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { deleteProjectDatabase } from '~/utils/cosmos/utils';

/**
 * HTTP Trigger to delete a project
 * DELETE /api/v1/projects/{id}
 */
const DeleteProjectHandler: HttpHandler = secureEndpoint(
  {
    permissions: "project:*:*:delete:allow",
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
      const workspaceId = contextProject.workspaceId;
      
      // Get the existing project to verify it exists
      const existingProject = await readItem<Project>('projects', projectId, workspaceId);
      
      if (!existingProject) {
        return notFound('Project', projectId);
      }

      // Get the workspace to update its projects array
      const workspace = await readItem<Workspace>('workspaces', workspaceId, workspaceId);
      
      if (!workspace) {
        return notFound('Workspace', workspaceId);
      }

      // Get all memberships for this project
      const memberships = await queryItems<Membership>(
        'membership',
        'SELECT * FROM c WHERE c.resourceType = @resourceType AND c.resourceId = @resourceId',
        [
          { name: '@resourceType', value: 'project' },
          { name: '@resourceId', value: projectId }
        ]
      );

      // Get all role assignments for this project
      const roleAssignments = await queryItems<AssignedRole>(
        'membership',
        'SELECT * FROM c WHERE c.type = "assigned-roles" AND c.resourceType = @resourceType AND c.resourceId = @resourceId',
        [
          { name: '@resourceType', value: 'project' },
          { name: '@resourceId', value: projectId }
        ]
      );

      // 1. Delete all project-specific resources
      context.info(`Deleting project database for project ${projectId}`);
      await deleteProjectDatabase(projectId);
      
      // 2. Delete all memberships for this project
      for (const membership of memberships) {
        context.info(`Deleting membership ${membership.id} for project ${projectId}`);
        await deleteItem('membership', membership.id, [
          membership.resourceType, 
          membership.resourceId 
        ]);
      }

      // 3. Delete all role assignments for this project
      for (const roleAssignment of roleAssignments) {
        context.info(`Deleting role assignment ${roleAssignment.id} for project ${projectId}`);
        await deleteItem('membership', roleAssignment.id, [ 
          roleAssignment.resourceType, 
          roleAssignment.resourceId 
        ]);
      }

      // 4. Remove the project from the workspace's projects array
      const projectIndex = workspace.projects.indexOf(projectId);
      if (projectIndex !== -1) {
        await patchItem<Workspace>(
          'workspaces',
          workspaceId,
          [{ op: 'remove', path: `/projects/${projectIndex}` }],
          workspaceId
        );
      }

      // 5. Delete the project itself
      await deleteItem('projects', projectId, workspaceId);

      context.info(`Project ${projectId} successfully deleted`);

      return {
        status: 204 // No Content - successful deletion
      };
    } catch (error) {
      context.error('Error deleting project:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "DeleteProject",
  Route: "v1/projects/{id}",
  Handler: DeleteProjectHandler,
  Methods: ["DELETE"] as HttpMethod[],
  Input: {} as { id: string },
  Output: void 0 as void,
};