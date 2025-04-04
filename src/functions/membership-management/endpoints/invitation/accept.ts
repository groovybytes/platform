// @filename: user-management/membership/accept-invitation.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { SupportedEventMap } from '~/functions/onboarding-orchestration/endpoints/event/_schema';
import type { Membership, User, Workspace, Project } from '~/types/operational';
import type { EnhacedLogContext } from '~/utils/protect';

import OnboardingEventNotification from '~/functions/onboarding-orchestration/endpoints/event/event';
import OnboardingOrchestrator from '~/functions/onboarding-orchestration/orchestrator/onboarding';

import { badRequest, handleApiError, notFound, unauthorized } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';

import { queryItems, readItem, patchItem } from '~/utils/cosmos/utils';
import * as df from 'durable-functions';

import { ok } from '~/utils/response';

/**
 * HTTP Trigger to accept an invitation
 * POST /api/v1/memberships/accept-invitation
 */
const AcceptInvitationHandler: HttpHandler = secureEndpoint(
  {
    permissions: ["workspace:*:members:invite:allow", "project:*:members:invite:allow"],
    match: "any"
  }, 
  async (
    req: Request | HttpRequest, 
    context: InvocationContext & EnhacedLogContext
  ): Promise<HttpResponseInit> => {
    try {
      const { request: { userId: authenticatedUserId, isAuthenticated } } = context?.requestContext ?? await getRequestContext(req);
      const input = await req.json() as AcceptInvitationInput;
      const { token, userId: providedUserId } = input;

      if (!token) {
        return badRequest('Invitation token is required');
      }

      // Find the invitation by token
      const invitations = await queryItems<Membership>(
        'membership',
        'SELECT * FROM c WHERE c.inviteToken = @token AND c.status = "pending"',
        [{ name: '@token', value: token }]
      );
      if (invitations.length === 0) {
        return notFound('Invitation');
      }

      const invitation = invitations[0];

      // Get the invited user
      const invitedUser = await readItem<User>('users', invitation.userId);
      if (!invitedUser) {
        return notFound('User associated with invitation');
      }

      let userId = invitedUser.id;
      let isNewUser = invitedUser.status === 'pending';

      if (isAuthenticated && authenticatedUserId !== invitedUser.id && isNewUser) {
        userId = authenticatedUserId;
        await patchItem<Membership>(
          'membership',
          invitation.id,
          [{ op: 'replace', path: '/userId', value: authenticatedUserId }]
        );
      } else if (providedUserId && providedUserId !== userId) {
        return unauthorized('User ID does not match invitation');
      }

      const now = new Date().toISOString();
      const updatedMembership = await patchItem<Membership>(
        'membership',
        invitation.id,
        [
          { op: 'replace', path: '/status', value: 'active' },
          { op: 'replace', path: '/joinedAt', value: now },
          { op: 'replace', path: '/lastActiveAt', value: now },
          { op: 'remove', path: '/inviteToken' }
        ]
      );

      if (isNewUser) {
        await patchItem<User>(
          'users',
          invitedUser.id,
          [
            { op: 'replace', path: '/status', value: 'active' },
            { op: 'replace', path: '/modifiedAt', value: now }
          ]
        );
      }

      let resourceName = '';
      if (invitation.resourceType === 'workspace') {
        const workspace = await readItem<Workspace>('workspaces', invitation.resourceId);
        resourceName = workspace ? workspace.name : 'Unknown Workspace';
      } else if (invitation.resourceType === 'project') {
        const project = await readItem<Project>('projects', invitation.resourceId);
        resourceName = project ? project.name : 'Unknown Project';
      }

      // Use the durable client: prefer context.df if available (when bound), otherwise fallback to df.getClient(context)
      const client = df.getClient(context);
      let instanceId = invitation.inviteToken;

      // Start the onboarding orchestrator for new users
      if (isNewUser) {
        instanceId = await client.startNew(OnboardingOrchestrator.Name, {
          instanceId,
          input: {
            type: 'invite',
            userId,
            email: invitation.inviteEmail,
            resourceType: invitation.resourceType,
            resourceId: invitation.resourceId,
            membershipType: invitation.membershipType
          } as typeof OnboardingOrchestrator.Input
        });
      }

      // Raise an event for the invitation orchestrator if waiting
      try {
        await client.raiseEvent(instanceId!, OnboardingEventNotification.Name, {
          eventType: 'invitation.accepted',
          userId,
          membershipId: invitation.id,
          resourceType: invitation.resourceType,
          resourceId: invitation.resourceId
        } as SupportedEventMap['invitation.accepted']);
      } catch (error) {
        context.log('No waiting orchestration found for invitation acceptance event', error);
      }
      
      return ok({
        membership: updatedMembership,
        resource: {
          type: invitation.resourceType,
          id: invitation.resourceId,
          name: resourceName
        },
        isNewUser
      } as AcceptInvitationOutput)
    } catch (error) {
      context.error('Error accepting invitation:', error);
      return handleApiError(error);
    }
  }
);

/**
 * Input for accepting an invitation
 */
export interface AcceptInvitationInput {
    token: string;             // Invitation token from the URL
    userId?: string;           // If user is already authenticated
  }
  
  /**
   * Response for accepting an invitation
   */
  export interface AcceptInvitationOutput {
    membership: Membership;
    resource: {
      type: "workspace" | "project";
      id: string;
      name: string;
    };
    isNewUser: boolean;        // Whether the user was just created
  }
  

// Register the HTTP trigger
export default {
  Name: "AcceptInvitation",
  Route: "v1/memberships/accept-invitation",
  Handler: AcceptInvitationHandler,
  Methods: ["POST"] as HttpMethod[],
  Input: {} as AcceptInvitationInput,
  Output: {} as AcceptInvitationOutput,
};
