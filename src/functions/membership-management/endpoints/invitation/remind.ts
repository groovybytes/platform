// @filename: user-management/membership/send-reminder.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Membership, Workspace, Project } from '~/types/operational';

import AcceptInvitation from './accept';

import { badRequest, handleApiError, notFound, conflict } from '~/utils/error';
import { secureEndpoint } from '~/utils/protect';
import { getRequestContext } from '~/utils/context';
import { readItem, patchItem } from '~/utils/cosmos/utils';
import { sendInvitationEmail } from '~/email/email';
import { ok } from '~/utils/response';

import { FRONTEND_BASE_URL } from '~/utils/config';

/**
 * HTTP Trigger to send a reminder for a pending invitation
 * POST /api/v1/memberships/{id}/remind
 */
const SendReminderHandler: HttpHandler = secureEndpoint(
  {
    permissions: ["workspace:*:members:invite:allow", "project:*:members:invite:allow"],
    match: "any"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      // Get the membership ID from the URL
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
        return conflict('Only pending invitations can receive reminders');
      }
      
      // Verify invitation has not expired
      if (membership.inviteExpiresAt && new Date(membership.inviteExpiresAt) < new Date()) {
        return conflict('Invitation has expired');
      }
      
      // Verify invitation has a token
      if (!membership.inviteToken) {
        return conflict('Invitation does not have a valid token');
      }
      
      // Verify the user has permission for this resource
      const { request: { userId }, workspace, project } = context?.requestContext ?? await getRequestContext(req);
      
      if (membership.resourceType === 'workspace' && (!workspace || workspace.id !== membership.resourceId)) {
        return badRequest('Invalid workspace context');
      }
      
      if (membership.resourceType === 'project' && (!project || project.id !== membership.resourceId)) {
        return badRequest('Invalid project context');
      }
      
      // Get the resource name
      let resourceName = '';
      
      if (membership.resourceType === 'workspace') {
        const workspace = await readItem<Workspace>('workspaces', membership.resourceId);
        resourceName = workspace ? workspace.name : 'Unknown Workspace';
      } else if (membership.resourceType === 'project') {
        const project = await readItem<Project>('projects', membership.resourceId);
        resourceName = project ? project.name : 'Unknown Project';
      }
      
      // Generate invite link
      const inviteLink = `${FRONTEND_BASE_URL}/invitation/accept?token=${membership.inviteToken}`;
      
      // Update reminder count and time
      const now = new Date().toISOString();
      const currentCount = membership.inviteReminders || 0;
      const newCount = currentCount + 1;
      
      const updatedMembership = await patchItem<Membership>(
        'membership',
        membershipId,
        [
          { op: 'replace', path: '/inviteReminders', value: newCount },
          { op: 'replace', path: '/lastReminderAt', value: now }
        ]
      );
      
      // Send the reminder email
      let emailSent = false;
      
      try {
        await sendInvitationEmail(
          membership.inviteEmail!, 
          resourceName, 
          inviteLink,
          true, // isReminder flag to customize the email template
          newCount
        );
        emailSent = true;
      } catch (error) {
        context.error('Error sending reminder email:', error);
        // We'll continue and return success even if email fails
      }
      
      // Return successful response
      return ok({
        membership: updatedMembership,
        reminderCount: newCount,
        emailSent
      } as SendReminderOutput);
    } catch (error) {
      context.error('Error sending invitation reminder:', error);
      return handleApiError(error);
    }
  }
);

/**
 * Input for sending an invitation reminder
 */
export interface SendReminderInput {
  membershipId: string;
}

/**
 * Response for sending a reminder
 */
export interface SendReminderOutput {
  membership: Membership;
  reminderCount: number;
  emailSent: boolean;
}

// Register the HTTP trigger
export default {
  Name: "SendReminder",
  Route: "v1/memberships/{id}/remind",
  Handler: SendReminderHandler,
  Methods: ["POST"] as HttpMethod[],
  Input: {} as SendReminderInput,
  Output: {} as SendReminderOutput,
};