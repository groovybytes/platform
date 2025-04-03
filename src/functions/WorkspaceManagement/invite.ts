// @filename: workspace-invites/index.ts
import type { EndpointDefinition } from '~/types/definitions';

import { app } from '@azure/functions';

import InviteToWorkspace from './invite';
import ResendWorkspaceInvite from './resend';
import RevokeWorkspaceInvite from './revoke';
import ListWorkspaceInvites from './endpoints/list';
import GetWorkspaceInvite from './endpoints/get';

// Create the Endpoints object
export const Endpoints: Record<string, EndpointDefinition> = {
  InviteToWorkspace: {
    name: InviteToWorkspace.Name,
    route: InviteToWorkspace.Route,
    methods: InviteToWorkspace.Methods,
    handler: InviteToWorkspace.Handler,
  },
  ResendWorkspaceInvite: {
    name: ResendWorkspaceInvite.Name,
    route: ResendWorkspaceInvite.Route,
    methods: ResendWorkspaceInvite.Methods,
    handler: ResendWorkspaceInvite.Handler,
  },
  RevokeWorkspaceInvite: {
    name: RevokeWorkspaceInvite.Name,
    route: RevokeWorkspaceInvite.Route,
    methods: RevokeWorkspaceInvite.Methods,
    handler: RevokeWorkspaceInvite.Handler,
  },
  ListWorkspaceInvites: {
    name: ListWorkspaceInvites.Name,
    route: ListWorkspaceInvites.Route,
    methods: ListWorkspaceInvites.Methods,
    handler: ListWorkspaceInvites.Handler,
  },
  GetWorkspaceInvite: {
    name: GetWorkspaceInvite.Name,
    route: GetWorkspaceInvite.Route,
    methods: GetWorkspaceInvite.Methods,
    handler: GetWorkspaceInvite.Handler,
  }
};

// Register all HTTP triggers
Object.values(Endpoints).forEach(endpoint => {
  app.http(endpoint.name, {
    route: endpoint.route,
    methods: endpoint.methods,
    authLevel: 'anonymous', // Relies on auth middleware/token validation
    handler: endpoint.handler
  });
});

// Input/Output type definitions
export type InviteToWorkspaceInput = typeof InviteToWorkspace.Input;
export type InviteToWorkspaceOutput = typeof InviteToWorkspace.Output;
export type ResendWorkspaceInviteInput = typeof ResendWorkspaceInvite.Input;
export type ResendWorkspaceInviteOutput = typeof ResendWorkspaceInvite.Output;
export type RevokeWorkspaceInviteInput = typeof RevokeWorkspaceInvite.Input;
export type RevokeWorkspaceInviteOutput = typeof RevokeWorkspaceInvite.Output;
export type ListWorkspaceInvitesInput = typeof ListWorkspaceInvites.Input;
export type ListWorkspaceInvitesOutput = typeof ListWorkspaceInvites.Output;
export type GetWorkspaceInviteInput = typeof GetWorkspaceInvite.Input;
export type GetWorkspaceInviteOutput = typeof GetWorkspaceInvite.Output;

// Default export
export default Endpoints;

// @filename: workspace-invites/invite.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { User, Membership, Workspace } from '~/types/operational';
import * as df from 'durable-functions';

import { badRequest, handleApiError, notFound, conflict } from '~/utils/error';
import { queryItems, readItem } from '~/utils/cosmos';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { nanoid } from 'nanoid';
import { generateRandomHex } from '~/utils/utils';

interface InviteToWorkspaceRequest {
  email: string;
  name?: string;
  membershipType: "member" | "guest";
  message?: string;
  expiresInDays?: number;
}

interface InviteToWorkspaceResponse {
  inviteId: string;
  workspaceId: string;
  email: string;
  status: string;
  inviteUrl: string;
}

/**
 * HTTP Trigger to invite a user to a workspace
 * POST /api/v1/workspaces/{workspaceId}/invites
 */
const InviteToWorkspaceHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:members:invite:allow",
    requireResource: "workspace"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const workspaceId = request.params.workspaceId;
      
      if (!workspaceId) {
        return badRequest('Workspace ID is required');
      }
      
      // Get user ID from request context
      const { request: { userId }, workspace } = context?.requestContext ?? await getRequestContext(request);
      
      if (!workspace) {
        return notFound('Workspace', workspaceId);
      }
      
      // Parse request body
      const inviteReq: InviteToWorkspaceRequest = await request.json();
      
      // Validate request
      if (!inviteReq.email) {
        return badRequest('Email is required');
      }
      
      if (!inviteReq.membershipType || !['member', 'guest'].includes(inviteReq.membershipType)) {
        return badRequest('Valid membership type (member or guest) is required');
      }
      
      // Get workspace details
      const workspaceDetails = await readItem<Workspace>('workspaces', workspaceId);
      if (!workspaceDetails) {
        return notFound('Workspace', workspaceId);
      }
      
      // Check if user already exists with this email
      const existingUsers = await queryItems<User>(
        'users',
        'SELECT * FROM c WHERE c.emails.primary = @email',
        [{ name: '@email', value: inviteReq.email }]
      );
      
      let targetUserId: string;
      let isNewUser = false;
      
      if (existingUsers.length > 0) {
        // User exists - check if they already have a membership
        const existingUser = existingUsers[0];
        targetUserId = existingUser.id;
        
        // Check if user already has an active membership
        const existingMemberships = await queryItems<Membership>(
          'membership',
          'SELECT * FROM c WHERE c.userId = @userId AND c.resourceType = @resourceType AND c.resourceId = @resourceId',
          [
            { name: '@userId', value: targetUserId },
            { name: '@resourceType', value: 'workspace' },
            { name: '@resourceId', value: workspaceId }
          ]
        );
        
        if (existingMemberships.length > 0) {
          const membership = existingMemberships[0];
          
          if (membership.status === 'active') {
            return conflict('User is already a member of this workspace');
          }
          
          if (membership.status === 'pending') {
            return conflict('User already has a pending invitation to this workspace');
          }
        }
      } else {
        // User doesn't exist - will need to create a placeholder user
        targetUserId = nanoid();
        isNewUser = true;
      }
      
      // Generate invite token
      const inviteToken = generateRandomHex(32);
      
      // Calculate expiration (default to 14 days if not specified)
      const expiresInDays = inviteReq.expiresInDays || 14;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      
      // Start the onboarding orchestration
      const client = df.getClient(context);
      
      const instanceId = await client.startNew('OnboardingOrchestrator', undefined, {
        type: 'workspace-invite',
        workspaceId,
        invitedBy: userId,
        workspaceName: workspaceDetails.name,
        inviteDetails: {
          userId: targetUserId,
          email: inviteReq.email,
          name: inviteReq.name || inviteReq.email.split('@')[0],
          membershipType: inviteReq.membershipType,
          message: inviteReq.message,
          inviteToken,
          isNewUser,
          expiresAt: expiresAt.toISOString()
        }
      });
      
      // Generate invite URL (front-end will handle this URL)
      const baseUrl = process.env.APP_BASE_URL || 'https://app.example.com';
      const inviteUrl = `${baseUrl}/invite?token=${inviteToken}&workspace=${workspaceId}`;
      
      return {
        status: 202, // Accepted - will be processed asynchronously
        jsonBody: {
          inviteId: instanceId,
          workspaceId,
          email: inviteReq.email,
          status: 'pending',
          inviteUrl
        }
      };
    } catch (error) {
      context.error('Error inviting user to workspace:', error);
      return handleApiError(error);
    }
  }
);

// Define the HTTP trigger
export default {
  Name: "InviteToWorkspace",
  Route: "v1/workspaces/{workspaceId}/invites",
  Handler: InviteToWorkspaceHandler,
  Methods: ["POST"] as HttpMethod[],
  Input: {} as InviteToWorkspaceRequest & { workspaceId: string },
  Output: {} as InviteToWorkspaceResponse,
};

// @filename: workspace-invites/list.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Membership, User } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { queryItems, readItem } from '~/utils/cosmos';
import { secureEndpoint } from '~/utils/protect';

interface WorkspaceInviteResponse {
  id: string;
  email: string;
  status: string;
  membershipType: "member" | "guest";
  invitedAt: string;
  invitedBy: string;
  lastReminderAt?: string;
  inviteReminders?: number;
  inviteExpiresAt?: string;
}

/**
 * HTTP Trigger to list all pending invites for a workspace
 * GET /api/v1/workspaces/{workspaceId}/invites
 */
const ListWorkspaceInvitesHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:members:read:allow",
    requireResource: "workspace"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const workspaceId = request.params.workspaceId;
      
      if (!workspaceId) {
        return badRequest('Workspace ID is required');
      }
      
      // Query pending invitations (memberships with status 'pending')
      const pendingInvites = await queryItems<Membership>(
        'membership',
        'SELECT * FROM c WHERE c.resourceType = @resourceType AND c.resourceId = @resourceId AND c.status = @status',
        [
          { name: '@resourceType', value: 'workspace' },
          { name: '@resourceId', value: workspaceId },
          { name: '@status', value: 'pending' }
        ]
      );
      
      // Get inviter details for each invite
      const enrichedInvites = await Promise.all(
        pendingInvites.map(async (invite) => {
          let inviterName = 'Unknown';
          
          try {
            const inviter = await readItem<User>('users', invite.invitedBy);
            inviterName = inviter ? inviter.name : 'Unknown';
          } catch (error) {
            // Continue even if we can't get the inviter details
            context.warn(`Couldn't fetch inviter details for ${invite.invitedBy}`);
          }
          
          return {
            id: invite.id,
            email: invite.inviteEmail || 'unknown@example.com',
            status: invite.status,
            membershipType: invite.membershipType,
            invitedAt: invite.invitedAt,
            invitedBy: inviterName,
            lastReminderAt: invite.lastReminderAt,
            inviteReminders: invite.inviteReminders,
            inviteExpiresAt: invite.inviteExpiresAt
          };
        })
      );
      
      return {
        status: 200,
        jsonBody: {
          items: enrichedInvites,
          count: enrichedInvites.length
        }
      };
    } catch (error) {
      context.error('Error listing workspace invites:', error);
      return handleApiError(error);
    }
  }
);

// Define the HTTP trigger
export default {
  Name: "ListWorkspaceInvites",
  Route: "v1/workspaces/{workspaceId}/invites",
  Handler: ListWorkspaceInvitesHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { workspaceId: string },
  Output: {} as { items: WorkspaceInviteResponse[], count: number },
};

// @filename: workspace-invites/get.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Membership, User } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { readItem } from '~/utils/cosmos';
import { secureEndpoint } from '~/utils/protect';

/**
 * HTTP Trigger to get details of a specific workspace invite
 * GET /api/v1/workspaces/{workspaceId}/invites/{inviteId}
 */
const GetWorkspaceInviteHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:members:read:allow",
    requireResource: "workspace"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const workspaceId = request.params.workspaceId;
      const inviteId = request.params.inviteId;
      
      if (!workspaceId || !inviteId) {
        return badRequest('Workspace ID and Invite ID are required');
      }
      
      // Get membership record
      const invite = await readItem<Membership>('membership', inviteId);
      
      if (!invite || invite.resourceType !== 'workspace' || invite.resourceId !== workspaceId) {
        return notFound('Invite', inviteId);
      }
      
      // Get inviter details
      let inviterName = 'Unknown';
      try {
        const inviter = await readItem<User>('users', invite.invitedBy);
        inviterName = inviter ? inviter.name : 'Unknown';
      } catch (error) {
        // Continue even if we can't get the inviter details
        context.warn(`Couldn't fetch inviter details for ${invite.invitedBy}`);
      }
      
      return {
        status: 200,
        jsonBody: {
          id: invite.id,
          email: invite.inviteEmail || 'unknown@example.com',
          status: invite.status,
          membershipType: invite.membershipType,
          invitedAt: invite.invitedAt,
          invitedBy: inviterName,
          lastReminderAt: invite.lastReminderAt,
          inviteReminders: invite.inviteReminders,
          inviteExpiresAt: invite.inviteExpiresAt
        }
      };
    } catch (error) {
      context.error('Error getting workspace invite:', error);
      return handleApiError(error);
    }
  }
);

// Define the HTTP trigger
export default {
  Name: "GetWorkspaceInvite",
  Route: "v1/workspaces/{workspaceId}/invites/{inviteId}",
  Handler: GetWorkspaceInviteHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { workspaceId: string, inviteId: string },
  Output: {} as {
    id: string;
    email: string;
    status: string;
    membershipType: string;
    invitedAt: string;
    invitedBy: string;
    lastReminderAt?: string;
    inviteReminders?: number;
    inviteExpiresAt?: string;
  },
};

// @filename: workspace-invites/resend.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Membership, Workspace } from '~/types/operational';
import * as df from 'durable-functions';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { readItem, patchItem } from '~/utils/cosmos';
import { secureEndpoint } from '~/utils/protect';

/**
 * HTTP Trigger to resend a workspace invitation
 * POST /api/v1/workspaces/{workspaceId}/invites/{inviteId}/resend
 */
const ResendWorkspaceInviteHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:members:invite:allow",
    requireResource: "workspace"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const workspaceId = request.params.workspaceId;
      const inviteId = request.params.inviteId;
      
      if (!workspaceId || !inviteId) {
        return badRequest('Workspace ID and Invite ID are required');
      }
      
      // Get user ID from request context
      const { request: { userId } } = context?.requestContext ?? await getRequestContext(request);
      
      // Get membership record
      const invite = await readItem<Membership>('membership', inviteId);
      
      if (!invite || invite.resourceType !== 'workspace' || invite.resourceId !== workspaceId) {
        return notFound('Invite', inviteId);
      }
      
      if (invite.status !== 'pending') {
        return badRequest('Only pending invites can be resent');
      }
      
      // Get workspace details
      const workspace = await readItem<Workspace>('workspaces', workspaceId);
      if (!workspace) {
        return notFound('Workspace', workspaceId);
      }
      
      // Update the membership with new reminder details
      const now = new Date().toISOString();
      const reminderCount = (invite.inviteReminders || 0) + 1;
      
      await patchItem<Membership>(
        'membership',
        inviteId,
        [
          { op: 'replace', path: '/lastReminderAt', value: now },
          { op: 'replace', path: '/inviteReminders', value: reminderCount }
        ]
      );
      
      // Start the durable function to send the invitation email
      const client = df.getClient(context);
      
      const instanceId = await client.startNew('SendInvitationReminderActivity', undefined, {
        inviteId: inviteId,
        workspaceId: workspaceId,
        workspaceName: workspace.name,
        email: invite.inviteEmail || '',
        inviteToken: invite.inviteToken || '',
        reminderCount: reminderCount
      });
      
      return {
        status: 202, // Accepted - will be processed asynchronously
        jsonBody: {
          inviteId,
          workspaceId,
          email: invite.inviteEmail,
          status: 'reminder_sent',
          reminderCount
        }
      };
    } catch (error) {
      context.error('Error resending workspace invite:', error);
      return handleApiError(error);
    }
  }
);

// Define the HTTP trigger
export default {
  Name: "ResendWorkspaceInvite",
  Route: "v1/workspaces/{workspaceId}/invites/{inviteId}/resend",
  Handler: ResendWorkspaceInviteHandler,
  Methods: ["POST"] as HttpMethod[],
  Input: {} as { workspaceId: string, inviteId: string },
  Output: {} as {
    inviteId: string;
    workspaceId: string;
    email: string;
    status: string;
    reminderCount: number;
  },
};

// @filename: workspace-invites/revoke.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Membership } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { readItem, patchItem } from '~/utils/cosmos';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';

/**
 * HTTP Trigger to revoke a workspace invitation
 * DELETE /api/v1/workspaces/{workspaceId}/invites/{inviteId}
 */
const RevokeWorkspaceInviteHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:members:invite:allow",
    requireResource: "workspace"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const workspaceId = request.params.workspaceId;
      const inviteId = request.params.inviteId;
      
      if (!workspaceId || !inviteId) {
        return badRequest('Workspace ID and Invite ID are required');
      }
      
      // Get user ID from request context
      const { request: { userId } } = context?.requestContext ?? await getRequestContext(request);
      
      // Get membership record
      const invite = await readItem<Membership>('membership', inviteId);
      
      if (!invite || invite.resourceType !== 'workspace' || invite.resourceId !== workspaceId) {
        return notFound('Invite', inviteId);
      }
      
      if (invite.status !== 'pending') {
        return badRequest('Only pending invites can be revoked');
      }
      
      // Update the membership to revoked status
      const now = new Date().toISOString();
      
      await patchItem<Membership>(
        'membership',
        inviteId,
        [
          { op: 'replace', path: '/status', value: 'revoked' },
          { op: 'replace', path: '/inviteToken', value: null }
        ]
      );
      
      return {
        status: 200,
        jsonBody: {
          inviteId,
          workspaceId,
          status: 'revoked'
        }
      };
    } catch (error) {
      context.error('Error revoking workspace invite:', error);
      return handleApiError(error);
    }
  }
);

// Define the HTTP trigger
export default {
  Name: "RevokeWorkspaceInvite",
  Route: "v1/workspaces/{workspaceId}/invites/{inviteId}",
  Handler: RevokeWorkspaceInviteHandler,
  Methods: ["DELETE"] as HttpMethod[],
  Input: {} as { workspaceId: string, inviteId: string },
  Output: {} as {
    inviteId: string;
    workspaceId: string;
    status: string;
  },
};