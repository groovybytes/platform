// @filename: project-management/endpoints/update.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Project } from '~/types/operational';
import type { PatchOperation } from '@azure/cosmos';

import { badRequest, conflict, handleApiError, notFound } from '~/utils/error';
import { patchItem, queryItems, readItem } from '~/utils/cosmos/utils';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { sluggify } from '~/utils/utils';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to update a project
 * PATCH /api/v1/projects/{id}
 */
const UpdateProjectHandler: HttpHandler = secureEndpoint(
  {
    permissions: "project:*:settings:update:allow",
    requireResource: "project"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const { project: contextProject, request: { userId } } = context?.requestContext ?? await getRequestContext(request);
      
      // Verify project context is available
      if (!contextProject) {
        return badRequest('Project context is required');
      }
      
      const projectId = contextProject.id;
      const workspaceId = contextProject.workspaceId;
      
      // Get the existing project
      const existingProject = await readItem<Project>('projects', projectId, workspaceId);
      
      if (!existingProject) {
        return notFound('Project', projectId);
      }

      // Parse the update payload
      const updates = await request.json() as Partial<Project>;
      
      // Validate updates
      const allowedUpdates: (keyof Project)[] = ['name', 'settings', 'status', 'description'];
      const invalidKeys = Object.keys(updates).filter(key => 
        !allowedUpdates.includes(key as keyof Project)
      );
      
      if (invalidKeys.length > 0) {
        return badRequest(`Invalid update fields: ${invalidKeys.join(', ')}`);
      }

      // If name is being updated, check if the new slug would conflict
      let newSlug: string | undefined;
      if (updates.name && updates.name !== existingProject.name) {
        newSlug = sluggify(updates.name);
        
        // Check for slug conflicts within the same workspace
        const conflictingProjects = await queryItems<Project>(
          'projects',
          'SELECT * FROM c WHERE c.workspaceId = @workspaceId AND c.slug = @slug AND c.id != @id',
          [
            { name: '@workspaceId', value: workspaceId },
            { name: '@slug', value: newSlug },
            { name: '@id', value: projectId }
          ]
        );
        
        if (conflictingProjects.length > 0) {
          return conflict('Project with this name already exists in this workspace');
        }
      }

      // Prepare the update operations
      const operations: PatchOperation[] = [];
      
      if (updates.name) {
        operations.push({ op: 'replace', path: '/name', value: updates.name });
        if (newSlug) {
          operations.push({ op: 'replace', path: '/slug', value: newSlug });
        }
      }
      
      if (updates.status) {
        operations.push({ op: 'replace', path: '/status', value: updates.status });
      }
      
      if (updates.description !== undefined) {
        operations.push({ op: 'replace', path: '/description', value: updates.description });
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
      const updatedProject = await patchItem<Project>(
        'projects',
        projectId,
        operations,
        workspaceId
      );

      return ok(updatedProject);
    } catch (error) {
      context.error('Error updating project:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "UpdateProject",
  Route: "v1/projects/{id}",
  Handler: UpdateProjectHandler,
  Methods: ["PATCH"] as HttpMethod[],
  Input: {} as { id: string } & Partial<Project>,
  Output: {} as Project,
};