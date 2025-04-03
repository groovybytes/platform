import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Workspace } from '~/types/operational';
import type { PatchOperation } from '@azure/cosmos';

import { badRequest, conflict, handleApiError, notFound } from '~/utils/error';
import { patchItem, queryItems, readItem } from '~/utils/cosmos';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { sluggify } from '~/utils/utils';

/**
 * HTTP Trigger to update a workspace
 * PATCH /api/v1/workspaces/{id}
 */
const UpdateWorkspaceHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:settings:update:allow",
    requireResource: "workspace"
  },
  async (request: HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const workspaceId = request.params.id;
      
      if (!workspaceId) {
        return badRequest('Workspace ID is required');
      }

      // Get user ID from request context
      const { request: { userId } } = await getRequestContext(request);
      
      // Get the existing workspace
      const existingWorkspace = await readItem<Workspace>('workspaces', workspaceId);
      
      if (!existingWorkspace) {
        return notFound('Workspace', workspaceId);
      }

      // Parse the update payload
      const updates = await request.json() as Partial<Workspace>;
      
      // Validate updates
      const allowedUpdates: (keyof Workspace)[] = ['name', 'settings', 'status'];
      const invalidKeys = Object.keys(updates).filter(key => !allowedUpdates.includes(key as keyof Workspace));
      
      if (invalidKeys.length > 0) {
        return badRequest(`Invalid update fields: ${invalidKeys.join(', ')}`);
      }

      // If name is being updated, check if the new slug would conflict
      if (updates.name && updates.name !== existingWorkspace.name) {
        const newSlug = sluggify(updates.name);
        
        // Check for slug conflicts
        const conflictingWorkspaces = await queryItems<Workspace>(
          'workspaces',
          'SELECT * FROM c WHERE c.slug = @slug AND c.id != @id',
          [
            { name: '@slug', value: newSlug },
            { name: '@id', value: workspaceId }
          ]
        );
        
        if (conflictingWorkspaces.length > 0) {
          return conflict('Workspace with this name already exists');
        }
        
        // Update the slug
        updates.slug = newSlug;
      }

      // Prepare the update operations
      const operations: PatchOperation[] = [];
      
      if (updates.name) {
        operations.push({ op: 'replace', path: '/name', value: updates.name });
        operations.push({ op: 'replace', path: '/slug', value: updates.slug });
      }
      
      if (updates.status) {
        operations.push({ op: 'replace', path: '/status', value: updates.status });
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
      const updatedWorkspace = await patchItem<Workspace>(
        'workspaces',
        workspaceId,
        operations
      );

      return {
        status: 200,
        jsonBody: updatedWorkspace
      };
    } catch (error) {
      context.error('Error updating workspace:', error);
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