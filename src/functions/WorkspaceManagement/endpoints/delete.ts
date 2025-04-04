// @filename: workspace-management/endpoints/delete.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Workspace, Project, Membership, AssignedRole } from '~/types/operational';
import type { EnhacedLogContext } from '~/utils/protect';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { deleteItem, queryItems, readItem } from '~/utils/cosmos/utils';

import { deleteProject } from '~/utils/cosmos/helpers';
import { secureEndpoint } from '~/utils/protect';
import { noContent } from '~/utils/response';

/**
 * HTTP Trigger to delete a workspace
 * DELETE /api/v1/workspaces/{id}
 */
const DeleteWorkspaceHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:*:delete:allow",
    requireResource: "workspace"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const workspaceId = request.params.id;
      
      if (!workspaceId) {
        return badRequest('Workspace ID is required');
      }

      // Get the existing workspace
      const existingWorkspace = await readItem<Workspace>('workspaces', workspaceId, workspaceId);
      if (!existingWorkspace) {
        return notFound('Workspace', workspaceId);
      }

      // Get all projects in the workspace
      const projects = await queryItems<Project>(
        'projects',
        'SELECT * FROM c WHERE c.workspaceId = @workspaceId',
        [{ name: '@workspaceId', value: workspaceId }]
      );

      // Get all memberships for this workspace
      const memberships = await queryItems<Membership>(
        'membership',
        'SELECT * FROM c WHERE c.resourceType = @resourceType AND c.resourceId = @resourceId',
        [
          { name: '@resourceType', value: 'workspace' },
          { name: '@resourceId', value: workspaceId }
        ]
      );

      // Get all role assignments for this workspace
      const roleAssignments = await queryItems<AssignedRole>(
        'membership',
        'SELECT * FROM c WHERE c.type = "assigned-roles" AND c.resourceType = @resourceType AND c.resourceId = @resourceId',
        [
          { name: '@resourceType', value: 'workspace' },
          { name: '@resourceId', value: workspaceId }
        ]
      );

      // Delete all projects in this workspace
      for (const project of projects) {
        context.info(`Deleting project ${project.id} from workspace ${workspaceId}`);
        await deleteProject(project.id, workspaceId);
      }

      // Delete all memberships for this workspace
      for (const membership of memberships) {
        context.info(`Deleting membership ${membership.id} for workspace ${workspaceId}`);
        await deleteItem('membership', membership.id, [
          membership.resourceType, 
          membership.resourceId 
        ]);
      }

      // Delete all role assignments for this workspace
      for (const roleAssignment of roleAssignments) {
        context.info(`Deleting role assignment ${roleAssignment.id} for workspace ${workspaceId}`);
        await deleteItem('membership', roleAssignment.id, [ 
          roleAssignment.resourceType, 
          roleAssignment.resourceId 
        ]);
      }

      // Delete the workspace
      await deleteItem('workspaces', workspaceId, workspaceId);
      context.info(`Workspace ${workspaceId} successfully deleted`);

      // No Content - successful deletion
      return noContent();
    } catch (error) {
      context.error('Error deleting workspace:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "DeleteWorkspace",
  Route: "v1/workspaces/{id}",
  Handler: DeleteWorkspaceHandler,
  Methods: ["DELETE"] as HttpMethod[],
  Input: {} as { id: string },
  Output: void 0 as void,
};