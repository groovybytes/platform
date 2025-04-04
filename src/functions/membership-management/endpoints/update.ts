// @filename: user-management/membership/create.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Membership, Project, User, Workspace } from '~/types/operational';
import type { EnhacedLogContext } from '~/utils/protect';

import { badRequest, handleApiError, conflict } from '~/utils/error';
import { createItem, queryItems, readItem } from '~/utils/cosmos/utils';
import { assignRolesToUser } from '~/utils/membership';
import { getRequestContext } from '~/utils/context';
import { sendInvitationEmail } from '~/email/email';
import { generateRandomHex } from '~/utils/utils';
import { secureEndpoint } from '~/utils/protect';

import { BACKEND_BASE_URL, FRONTEND_BASE_URL } from '~/utils/config';
import { nanoid } from 'nanoid';

import AcceptInvitation from './invitation/accept';
import { created } from '~/utils/response';

/**
 * HTTP Trigger to create a membership or invitation
 * POST /api/v1/memberships
 */
const CreateMembershipHandler: HttpHandler = secureEndpoint(
  {
    permissions: ["workspace:*:members:invite:allow", "project:*:members:invite:allow"],
    match: "any",
    requireResource: "either"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      // Get request context
      const { request: { userId: currentUserId }, workspace, project } = context?.requestContext ?? await getRequestContext(req);
      
      // Parse request body
      const input = await req.json() as CreateMembershipInput;
      const { email, resourceType, resourceId, membershipType, roles = [] } = input;
      
      // Validate input
      if (!email) {
        return badRequest('Email is required');
      }
      
      if (!resourceType || !resourceId) {
        return badRequest('Resource type and ID are required');
      }
      
      if (!membershipType) {
        return badRequest('Membership type is required');
      }
      
      // Validate that the user has permission for the specified resource
      if (resourceType === 'workspace' && (!workspace || workspace.id !== resourceId)) {
        return badRequest('Invalid workspace context');
      }
      
      if (resourceType === 'project' && (!project || project.id !== resourceId)) {
        return badRequest('Invalid project context');
      }
      
      // Check if user already exists with this email
      const existingUsers = await queryItems<User>(
        'users',
        'SELECT * FROM c WHERE c.emails.primary = @email',
        [{ name: '@email', value: email }]
      );
      
      let user: User;
      let isNewUser = false;
      
      if (existingUsers.length > 0) {
        // Use existing user
        user = existingUsers[0];
        
        // Check if there's already an active membership
        const existingMemberships = await queryItems<Membership>(
          'membership',
          'SELECT * FROM c WHERE c.userId = @userId AND c.resourceType = @resourceType AND c.resourceId = @resourceId',
          [
            { name: '@userId', value: user.id },
            { name: '@resourceType', value: resourceType },
            { name: '@resourceId', value: resourceId }
          ]
        );
        
        const activeMembership = existingMemberships.find(m => 
          m.status === 'active' || m.status === 'pending'
        );
        
        if (activeMembership) {
          return conflict(
            `User already has an ${activeMembership.status} membership for this ${resourceType}`
          );
        }
      } else {
        // Create a placeholder user
        isNewUser = true;
        const name = input.name || email.split('@')[0];
        
        user = {
          id: nanoid(),
          name,
          status: 'pending',
          preferences: {
            language: 'en',
            timezone: 'UTC'
          },
          emails: {
            primary: email,
            all: [email]
          },
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString()
        };
        
        await createItem<User>('users', user);
      }
      
      // Generate invite token if this is an invitation
      const isInvitation = user.status === 'pending' || !input.userId;
      const inviteToken = isInvitation ? generateRandomHex(32) : undefined;
      const now = new Date();
      
      // Calculate expiration date (default: 7 days)
      const expiresAt = input.expiresAt || 
        new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      
      // Create the membership/invitation
      const membership: Membership = {
        id: nanoid(),
        userId: user.id,
        resourceType,
        resourceId,
        membershipType,
        status: isInvitation ? 'pending' : 'active',
        expiresAt: membershipType === 'guest' ? expiresAt : undefined,
        joinedAt: isInvitation ? undefined : now.toISOString(),
        lastActiveAt: isInvitation ? undefined : now.toISOString(),
        invitedAt: now.toISOString(),
        invitedBy: currentUserId,
        inviteToken,
        inviteEmail: email,
        inviteReminders: 0,
        inviteExpiresAt: isInvitation ? expiresAt : undefined
      };
      
      const createdMembership = await createItem<Membership>('membership', membership);
      
      // If roles are provided, assign them
      if (roles.length > 0) {
        await assignRolesToUser(
          user.id,
          resourceType,
          resourceId,
          roles,
          currentUserId,
          membershipType === 'guest',
          membershipType === 'guest' ? expiresAt : undefined
        );
      }
      
      // If this is an invitation, send the email
      let inviteLink: string | undefined;
      
      if (isInvitation && inviteToken) {
        // Generate invite link
        inviteLink = `${FRONTEND_BASE_URL}/invitation/accept?token=${inviteToken}`;
        
        // Get resource name
        let resourceName = resourceId;
        
        const resource = await readItem<Workspace | Project>(
          resourceType === 'workspace' ? 'workspaces' : 'projects',
          resourceId
        );

        if (resourceType === 'workspace' && workspace) {
          resourceName = resource?.name || 'Unnamed workspace';
        } else if (resourceType === 'project' && project) {
          resourceName = resource?.name || 'Unnamed project';
        }
        
        // Send invitation email
        await sendInvitationEmail(email, resourceName, inviteLink);
      }
      
      // Return successful response with membership, user, and invite link
      return created({
        membership: createdMembership,
        user,
        isNewUser,
        ...(inviteLink && { inviteLink })
      } as CreateMembershipOutput);
    } catch (error) {
      context.error('Error creating membership:', error);
      return handleApiError(error);
    }
  }
);

/**
 * Input for creating a new membership or invitation
 */
export interface CreateMembershipInput {
    userId?: string;           // Optional if inviting by email
    email: string;             // Required for invitations
    name?: string;             // Optional name for new users
    resourceType: "workspace" | "project";
    resourceId: string;
    membershipType: "member" | "guest";
    inviteMessage?: string;    // Optional custom message for invitation email
    expiresAt?: string;        // Optional expiration date
    roles?: string[];          // Optional roles to assign upon acceptance
  }
  
  /**
   * Response for membership creation
   */
  export interface CreateMembershipOutput {
    membership: Membership;
    inviteLink?: string;       // Only provided for invitations
    user: User;                // Either existing or newly created placeholder user
    isNewUser: boolean;        // Whether a placeholder user was created
  }
  

/**
 * Input for updating a membership
 */
export interface UpdateMembershipInput {
  status?: "active" | "inactive" | "pending" | "revoked" | "suspended" | "expired";
  membershipType?: "member" | "guest";
  expiresAt?: string;
}

// Register the HTTP trigger
export default {
  Name: "CreateMembership",
  Route: "v1/memberships",
  Handler: CreateMembershipHandler,
  Methods: ["POST"] as HttpMethod[],
  Input: {} as CreateMembershipInput,
  Output: {} as CreateMembershipOutput,
};