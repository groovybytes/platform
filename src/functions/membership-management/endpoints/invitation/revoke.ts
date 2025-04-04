// @filename: user-management/membership/revoke-invitation.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Membership } from '~/types/operational';

import { handleApiError, badRequest, notFound, permissionDenied, conflict } from '~/utils/error';
import { readItem, patchItem } from '~/utils/cosmos/utils';
import { sendEmail } from '~/utils/email';

import { secureEndpoint } from '~/utils/protect';
import { getRequestContext } from '~/utils/context';
import { hasPermission } from '~/utils/permissions/permissions';
import { ok } from '~/utils/response';
/**
 * HTTP Trigger to revoke a pending invitation
 * POST /v1/memberships/{id}/revoke
 */
const RevokeInvitationHandler: HttpHandler = secureEndpoint(
  {
    permissions: ["workspace:*:members:invite:allow", "project:*:members:invite:allow", "system:*:members:admin:allow"],
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
      
      // Verify this is a pending invitation
      if (membership.status !== 'pending') {
        return conflict('Only pending invitations can be revoked');
      }
      
      // Check if the user has permission to revoke this invitation
    const { request: { permissions, userId }, workspace, project } = context?.requestContext ?? await getRequestContext(req);
      
      // Determine if the user has admin access for this specific resource
      const hasInviteAccess = hasPermission(permissions, 
        [
          'system:*:members:admin:allow',
          `${membership.resourceType}:${membership.resourceId}:members:invite:allow`,
          `${membership.resourceType}:*:members:invite:allow`
        ],
        { match: 'any' }
      );
      
      // Check resource-specific permissions
      const hasResourceAccess = 
        (membership.resourceType === 'workspace' && workspace && workspace.id === membership.resourceId) ||
        (membership.resourceType === 'project' && project && project.id === membership.resourceId);
      
      if (!hasInviteAccess || !hasResourceAccess) {
        return permissionDenied('members:invite', membership.resourceType, 'You do not have permission to revoke this invitation');
      }
      
      // Update the invitation status to revoked
      const now = new Date().toISOString();
      const updatedMembership = await patchItem<Membership>(
        'membership',
        membershipId,
        [
          { op: 'replace', path: '/status', value: 'revoked' },
          { op: 'replace', path: '/modifiedAt', value: now },
          { op: 'replace', path: '/modifiedBy', value: userId }
        ]
      );
      
      // Optionally send notification email
      const url = new URL(request.url);
      const notifyUser = url.searchParams.get('notify') === 'true';
      
      if (notifyUser && membership.inviteEmail) {
        // Get resource name
        let resourceName = membership.resourceId;
        
        if (membership.resourceType === 'workspace' && workspace) {
          const resource = await readItem('workspaces', membership.resourceId);
          resourceName = resource.name;
        } else if (membership.resourceType === 'project' && project) {
          const resource = await readItem('projects', membership.resourceId);
          resourceName = resource.name;
        }
        
        // Send revocation notification
        await sendEmail({
          to: membership.inviteEmail,
          content: {
            subject: `Invitation to ${resourceName} has been revoked`,
            htmlBody: `
              <p>Hello,</p>
              
              <p>This is to inform you that your invitation to ${membership.resourceType} <strong>${resourceName}</strong> has been revoked.</p>
              
              <p>If you believe this was done in error, please contact the person who invited you.</p>
              
              <p>Best regards,<br>The Platform Team</p>
            `,
            textBody: `
              Hello,
              
              This is to inform you that your invitation to ${membership.resourceType} "${resourceName}" has been revoked.
              
              If you believe this was done in error, please contact the person who invited you.
              
              Best regards,
              The Platform Team
            `
          }
        });
      }

      return ok({
        membership: updatedMembership,
        notificationSent: notifyUser && !!membership.inviteEmail
      })
    } catch (error) {
      context.error('Error revoking invitation:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "RevokeInvitation",
  Route: "v1/memberships/{id}/revoke",
  Handler: RevokeInvitationHandler,
  Methods: ["POST"] as HttpMethod[],
  Input: {} as { id: string, notify?: boolean },
  Output: {} as { membership: Membership, notificationSent: boolean },
};