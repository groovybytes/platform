// @filename: user-management/membership/get.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Membership } from '~/types/operational';

import { handleApiError, badRequest, notFound, permissionDenied } from '~/utils/error';
import { secureEndpoint } from '~/utils/protect';
import { getRequestContext } from '~/utils/context';
import { readItem } from '~/utils/cosmos/utils';
import { hasPermission } from '~/utils/permissions/permissions';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to get a specific membership by ID
 * GET /v1/memberships/{id}
 */
const GetMembershipHandler: HttpHandler = secureEndpoint(
  {
    permissions: ["workspace:*:members:read:allow", "project:*:members:read:allow", "system:*:members:read:allow"],
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

      // Check if the user has permission to view this membership
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

      // Users can always see their own memberships
      const isOwnMembership = membership.userId === userId;

      // Check resource-specific permissions
      const hasResourceAccess =
        (membership.resourceType === 'workspace' && workspace && workspace.id === membership.resourceId) ||
        (membership.resourceType === 'project' && project && project.id === membership.resourceId);

      if (!isOwnMembership && !hasAdminAccess && !hasResourceAccess) {
        return permissionDenied('members:read', membership.resourceType, 'You do not have permission to view this membership');
      }

      return ok(membership);
    } catch (error) {
      context.error('Error getting membership:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "GetMembership",
  Route: "v1/memberships/{id}",
  Handler: GetMembershipHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { id: string },
  Output: {} as Membership,
};