// @filename: user-management/membership/delete.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Membership } from '~/types/operational';

import { handleApiError, badRequest, notFound, permissionDenied, conflict } from '~/utils/error';
import { readItem, deleteItem, queryItems } from '~/utils/cosmos/utils';
import { hasPermission } from '~/utils/permissions/permissions';
import { noContent } from '~/utils/response';

import { secureEndpoint } from '~/utils/protect';
import { getRequestContext } from '~/utils/context';

/**
 * HTTP Trigger to delete a membership
 * DELETE /v1/memberships/{id}
 */
const DeleteMembershipHandler: HttpHandler = secureEndpoint(
  {
    permissions: ["workspace:*:members:admin:allow", "project:*:members:admin:allow", "system:*:members:admin:allow"],
    match: "any"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const membershipId = request.params.id;
      
      if (!membershipId) {
        return badRequest('Membership ID is required');
      }
      
      // Get the membership
      const membership = await readItem<Membership>('membership', membershipId);
      
      if (!membership) {
        return notFound('Membership', membershipId);
      }
      
    // Check if the user has permission to delete this membership
    const { request: { permissions, userId }, workspace, project } = context?.requestContext ?? await getRequestContext(req);
      
    // Determine if the user has admin access
    const hasAdminAccess = hasPermission(permissions, 
        [
          'system:*:members:read:allow',
          `${membership.resourceType}:${membership.resourceId}:members:admin:allow`,
          `${membership.resourceType}:*:members:admin:allow`
        ],
        { match: 'any' }
    );
      
      // Check resource-specific permissions
      const hasResourceAccess = 
        (membership.resourceType === 'workspace' && workspace && workspace.id === membership.resourceId) ||
        (membership.resourceType === 'project' && project && project.id === membership.resourceId);
      
      if (!hasAdminAccess || !hasResourceAccess) {
        return permissionDenied('members:admin', membership.resourceType, 'You do not have permission to delete this membership');
      }
      
      // Prevent users from deleting their own membership to avoid leaving resources without admin
      if (membership.userId === userId) {
        // Check if this is the last admin for this resource
        const query = `
          SELECT * FROM c 
          WHERE c.resourceType = @resourceType 
          AND c.resourceId = @resourceId 
          AND c.status = 'active' 
          AND c.userId != @userId`;
        
        const otherMemberships = await queryItems<Membership>(
          'membership',
          query,
          [
            { name: '@resourceType', value: membership.resourceType },
            { name: '@resourceId', value: membership.resourceId },
            { name: '@userId', value: userId }
          ]
        );
        
        const hasOtherAdmins = otherMemberships.some(m => 
          hasPermission(permissions, `${membership.resourceType}:${membership.resourceId}:members:admin:allow`)
        );
        
        if (!hasOtherAdmins) {
          return conflict('Cannot delete your own membership as you are the last admin of this resource');
        }
      }
      
      // Delete the membership
      await deleteItem('membership', membershipId);

      // No content for successful deletion
      return noContent();
    } catch (error) {
      context.error('Error deleting membership:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "DeleteMembership",
  Route: "v1/memberships/{id}",
  Handler: DeleteMembershipHandler,
  Methods: ["DELETE"] as HttpMethod[],
  Input: {} as { id: string },
  Output: void 0 as void,
};