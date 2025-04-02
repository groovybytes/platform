import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Workspace } from '~/types/operational';

import { handleApiError, forbidden, notFound, badRequest } from '~/utils/error';
import { readItem, patchItem } from '~/utils/cosmos';
import { getUserIdFromToken } from '~/utils/auth';
import { hasWorkspaceRole } from '~/utils/auth';
import { app } from '@azure/functions';

/**
 * Generate slug from workspace name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Define allowed update fields
const UPDATABLE_FIELDS = ['name', 'settings', 'status'];

/**
 * HTTP Trigger to update a workspace
 * PATCH /api/v1/workspaces/{id}
 */
const UpdateWorkspaceHandler: HttpHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    // Get user ID from the authentication token
    const userId = getUserIdFromToken(request);
    
    // Get workspace ID from route parameter
    const workspaceId = request.params.id;
    if (!workspaceId) {
      return notFound('Workspace');
    }
    
    // Verify user has admin access to this workspace
    const hasAccess = await hasWorkspaceRole(userId, workspaceId, ['owner', 'admin']);
    if (!hasAccess) {
      return forbidden('You do not have sufficient permissions to update this workspace');
    }
    
    // Parse and validate request body
    const updates = await request.json();
    
    // Only allow updates to specific fields
    const operations = [];
    let hasValidUpdates = false;
    
    for (const field of UPDATABLE_FIELDS) {
      if (updates[field] !== undefined) {
        operations.push({
          op: 'replace',
          path: `/${field}`,
          value: updates[field]
        });
        hasValidUpdates = true;
      }
    }
    
    // If updating name, update slug as well
    if (updates.name) {
      operations.push({
        op: 'replace',
        path: '/slug',
        value: generateSlug(updates.name)
      });
    }
    
    // Add audit fields
    operations.push({
      op: 'replace',
      path: '/modifiedAt',
      value: new Date().toISOString()
    });
    
    operations.push({
      op: 'replace',
      path: '/modifiedBy',
      value: userId
    });
    
    if (!hasValidUpdates) {
      return badRequest('No valid fields to update. Allowed fields: ' + UPDATABLE_FIELDS.join(', '));
    }
    
    // Update workspace in Cosmos DB
    const updatedWorkspace = await patchItem<Workspace>('workspaces', workspaceId, operations);
    
    return {
      status: 200,
      jsonBody: updatedWorkspace
    };
  } catch (error) {
    context.error('Error updating workspace:', error);
    return handleApiError(error);
  }
};

// Register the HTTP trigger
app.http('UpdateWorkspace', {
  route: 'api/v1/workspaces/{id}',
  methods: ['PATCH'],
  authLevel: 'anonymous', // Relies on auth middleware/token validation
  handler: UpdateWorkspaceHandler,
});

export default UpdateWorkspaceHandler;