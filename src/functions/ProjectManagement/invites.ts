// @filename: project-invites/index.ts
import type { EndpointDefinition } from '~/types/definitions';

import { app } from '@azure/functions';

import InviteToProject from './invite';
import ResendProjectInvite from './resend';
import RevokeProjectInvite from './revoke';
import ListProjectInvites from './list';
import GetProjectInvite from './get';

// Create the Endpoints object
export const Endpoints: Record<string, EndpointDefinition> = {
  InviteToProject: {
    name: InviteToProject.Name,
    route: InviteToProject.Route,
    methods: InviteToProject.Methods,
    handler: InviteToProject.Handler,
  },
  ResendProjectInvite: {
    name: ResendProjectInvite.Name,
    route: ResendProjectInvite.Route,
    methods: ResendProjectInvite.Methods,
    handler: ResendProjectInvite.Handler,
  },
  RevokeProjectInvite: {
    name: RevokeProjectInvite.Name,
    route: RevokeProjectInvite.Route,
    methods: RevokeProjectInvite.Methods,
    handler: RevokeProjectInvite.Handler,
  },
  ListProjectInvites: {
    name: ListProjectInvites.Name,
    route: ListProjectInvites.Route,
    methods: ListProjectInvites.Methods,
    handler: ListProjectInvites.Handler,
  },
  GetProjectInvite: {
    name: GetProjectInvite.Name,
    route: GetProjectInvite.Route,
    methods: GetProjectInvite.Methods,
    handler: GetProjectInvite.Handler,
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
export type InviteToProjectInput = typeof InviteToProject.Input;
export type InviteToProjectOutput = typeof InviteToProject.Output;
export type ResendProjectInviteInput = typeof ResendProjectInvite.Input;
export type ResendProjectInviteOutput = typeof ResendProjectInvite.Output;
export type RevokeProjectInviteInput = typeof RevokeProjectInvite.Input;
export type RevokeProjectInviteOutput = typeof RevokeProjectInvite.Output;
export type ListProjectInvitesInput = typeof ListProjectInvites.Input;
export type ListProjectInvitesOutput = typeof ListProjectInvites.Output;
export type GetProjectInviteInput = typeof GetProjectInvite.Input;
export type GetProjectInviteOutput = typeof GetProjectInvite.Output;

// Default export
export default Endpoints;

// @filename: project-invites/invite.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { User, Membership, Project, Workspace } from '~/types/operational';
import * as df from 'durable-functions';

import { badRequest, handleApiError, notFound, conflict } from '~/utils/error';
import { queryItems, readItem } from '~/utils/cosmos';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { nanoid } from 'nanoid';
import { generateRandomHex } from '~/utils/utils';

interface InviteToProjectRequest {
  email: string;
  name?: string;
  membershipType: "member" | "guest";
  message?: string;
  expiresInDays?: number;
}

interface InviteToProjectResponse {
  inviteId: string;
  projectId: string;
  email: string;
  status: string;
  inviteUrl: string;
}

/**
 * HTTP Trigger to invite a user to a project
 * POST /api/v1/projects/{projectId}/invites
 */
const InviteToProjectHandler: HttpHandler = secureEndpoint(
  {
    permissions: "project:*:members:invite:allow",
    requireResource: "project"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const projectId = request.params.projectId;
      
      if (!projectId) {
        return badRequest('Project ID is required');
      }
      
      // Get user ID from request context
      const { request: { userId }, project } = context?.requestContext ?? await getRequestContext(request);
      
      if (!project) {
        return notFound('Project', projectId);
      }
      
      // Parse request body
      const inviteReq: InviteToProjectRequest = await request.json();
      
      // Validate request
      if (!inviteReq.email) {
        return badRequest('Email is required');
      }
      
      if (!inviteReq.membershipType || !['member', 'guest'].includes(inviteReq.membershipType)) {
        return badRequest('Valid membership type (member or guest) is required');
      }
      
      // Get project details
      const projectDetails = await readItem<Project>('projects', projectId);
      if (!projectDetails) {
        return notFound('Project', projectId);
      }
      
      // Get workspace details (for invitation email)
      const workspaceDetails = await readItem<Workspace>('workspaces', projectDetails.workspaceId);
      if (!workspaceDetails) {
        return notFound('Workspace', projectDetails.workspaceId);
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
            { name: '@resourceType', value: 'project' },
            { name: '@resourceId', value: projectId }
          ]
        );
        
        if (existingMemberships.length > 0) {
          const membership = existingMemberships[0];
          
          if (membership.status === 'active') {
            return conflict('User is already a member of this project');
          }
          
          if (membership.status === 'pending') {
            return conflict('User already has a pending invitation to this project');
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
        type: 'project-invite',
        projectId,
        projectName: projectDetails.name,
        workspaceId: projectDetails.workspaceId,
        workspaceName: workspaceDetails.name,
        invitedBy: userId,
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
      const inviteUrl = `${baseUrl}/invite?token=${inviteToken}&project=${projectId}`;
      
      return {
        status: 202, // Accepted - will be processed asynchronously
        jsonBody: {
          inviteId: instanceId,
          projectId,
          email: inviteReq.email,
          status: 'pending',
          inviteUrl
        }
      };
    } catch (error) {
      context.error('Error inviting user to project:', error);
      return handleApiError(error);
    }
  }
);

// Define the HTTP trigger
export default {
  Name: "InviteToProject",
  Route: "v1/projects/{projectId}/invites",
  Handler: InviteToProjectHandler,
  Methods: ["POST"] as HttpMethod[],
  Input: {} as InviteToProjectRequest & { projectId: string },
  Output: {} as InviteToProjectResponse,
};

// @filename: project-invites/list.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Membership, User } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { queryItems, readItem } from '~/utils/cosmos';
import { secureEndpoint } from '~/utils/protect';

interface ProjectInviteResponse {
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
 * HTTP Trigger to list all pending invites for a project
 * GET /api/v1/projects/{projectId}/invites
 */
const ListProjectInvitesHandler: HttpHandler = secureEndpoint(
  {
    permissions: "project:*:members:read:allow",
    requireResource: "project"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const projectId = request.params.projectId;
      
      if (!projectId) {
        return badRequest('Project ID is required');
      }
      
      // Query pending invitations (memberships with status 'pending')
      const pendingInvites = await queryItems<Membership>(
        'membership',
        'SELECT * FROM c WHERE c.resourceType = @resourceType AND c.resourceId = @resourceId AND c.status = @status',
        [
          { name: '@resourceType', value: 'project' },
          { name: '@resourceId', value: projectId },
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
      context.error('Error listing project invites:', error);
      return handleApiError(error);
    }
  }
);

// Define the HTTP trigger
export default {
  Name: "ListProjectInvites",
  Route: "v1/projects/{projectId}/invites",
  Handler: ListProjectInvitesHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { projectId: string },
  Output: {} as { items: ProjectInviteResponse[], count: number },
};

// @filename: project-invites/get.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Membership, User } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { readItem } from '~/utils/cosmos';
import { secureEndpoint } from '~/utils/protect';

/**
 * HTTP Trigger to get details of a specific project invite
 * GET /api/v1/projects/{projectId}/invites/{inviteId}
 */
const GetProjectInviteHandler: HttpHandler = secureEndpoint(
  {
    permissions: "project:*:members:read:allow",
    requireResource: "project"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const projectId = request.params.projectId;
      const inviteId = request.params.inviteId;
      
      if (!projectId || !inviteId) {
        return badRequest('Project ID and Invite ID are required');
      }
      
      // Get membership record
      const invite = await readItem<Membership>('membership', inviteId);
      
      if (!invite || invite.resourceType !== 'project' || invite.resourceId !== projectId) {
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
      context.error('Error getting project invite:', error);
      return handleApiError(error);