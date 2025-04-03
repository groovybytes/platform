// @filename: user-management/membership/accept-invitation.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Membership, User, Workspace, Project } from '~/types/operational';

import { badRequest, handleApiError, notFound, unauthorized } from '~/utils/error';
import { getRequestContext } from '~/utils/context';

import { queryItems, readItem, patchItem } from '~/utils/cosmos';
import * as df from 'durable-functions';

/**
 * HTTP Trigger to accept an invitation
 * POST /v1/memberships/accept-invitation
 */
const AcceptInvitationHandler: HttpHandler = async (
  req: Request | HttpRequest, 
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    // No authentication required for accepting invitations, but we'll use it if available
    const { request: { userId: authenticatedUserId, isAuthenticated } } = await getRequestContext(req);
    
    // Parse request body
    const input = await req.json() as AcceptInvitationInput;
    const { token, userId: providedUserId } = input;
    
    // Validate input
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
    
    // If authenticated user is different from the invited user, 
    // handle the link between them (for pending users only)
    if (isAuthenticated && authenticatedUserId !== invitedUser.id && isNewUser) {
      // This means an authenticated user is accepting an invitation that was sent to an email
      // We should update the placeholder user with the authenticated user's ID
      // Or alternatively, update the membership to point to the authenticated user
      
      // For simplicity, we'll update the membership to point to the authenticated user
      userId = authenticatedUserId;
      
      // Update the membership
      await patchItem<Membership>(
        'membership',
        invitation.id,
        [{ op: 'replace', path: '/userId', value: authenticatedUserId }]
      );
    } else if (providedUserId && providedUserId !== userId) {
      // If a user ID is provided but doesn't match the invitation
      return unauthorized('User ID does not match invitation');
    }
    
    // Get current date/time
    const now = new Date().toISOString();
    
    // Update the membership
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
    
    // If this was a pending user, update their status
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
    
    // Get the resource name
    let resourceName = '';
    
    if (invitation.resourceType === 'workspace') {
      const workspace = await readItem<Workspace>('workspaces', invitation.resourceId);
      resourceName = workspace ? workspace.name : 'Unknown Workspace';
    } else if (invitation.resourceType === 'project') {
      const project = await readItem<Project>('projects', invitation.resourceId);
      resourceName = project ? project.name : 'Unknown Project';
    }
    
    // Start the onboarding orchestrator for the user if they're new
    if (isNewUser) {
      const client = df.getClient(context);
      
      await client.startNew(
        'OnboardingOrchestrator', 
        undefined, 
        {
          type: 'invite',
          userId,
          email: invitation.inviteEmail,
          resourceType: invitation.resourceType,
          resourceId: invitation.resourceId,
          membershipType: invitation.membershipType
        }
      );
    }
    
    // Notify the invitation orchestrator if it's waiting for this event
    if (df.isOrchestrationClient(context)) {
      const client = df.getClient(context);
      
      try {
        await client.raiseEvent(
          `invite-${invitation.id}`,
          'InvitationAccepted',
          {
            userId,
            membershipId: invitation.id,
            resourceType: invitation.resourceType,
            resourceId: invitation.resourceId
          }
        );
      } catch (error) {
        // It's okay if there's no orchestration waiting for this event
        context.log('No waiting orchestration found for invitation acceptance event', error);
      }
    }
    
    // Return successful response
    return {
      status: 200,
      jsonBody: {
        membership: updatedMembership,
        resource: {
          type: invitation.resourceType,
          id: invitation.resourceId,
          name: resourceName
        },
        isNewUser
      } as AcceptInvitationOutput
    };
  } catch (error) {
    context.error('Error accepting invitation:', error);
    return handleApiError(error);
  }
};

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