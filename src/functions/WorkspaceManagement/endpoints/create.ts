// @filename: workspace-management/endpoints/create.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Workspace } from '~/types/operational';

import OnboardingEventNotification from '~/functions/OnboardingOrchestration/endpoints/event/event';

import { queryItems, createItem, patchItem } from '~/utils/cosmos/utils';
import { badRequest, conflict, handleApiError } from '~/utils/error';

import { assignRolesToUser, createMembership } from '~/utils/membership';
import { getRequestContext } from '~/utils/context';

import { createWorkspaceWithDefaults, getDefaultWorkspaceSettings } from '../_settings';
import { BASE_URL } from '~/utils/config';

import { secureEndpoint } from '~/utils/protect';
import { sluggify } from '~/utils/utils';
import { nanoid } from 'nanoid';
import { created } from '~/utils/response';


/**
 * HTTP Trigger to create a new workspace
 * POST /api/v1/workspaces
 */
const CreateWorkspaceHandler: HttpHandler = secureEndpoint(
  "system:*:workspaces:create:allow",
  async (request: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      // Get user ID from request context
      const { request: { userId } } = context?.requestContext ?? await getRequestContext(request);

      // Parse and validate request body
      const body = await request.json() as Workspace;
      const { name, type = 'standard' } = body;

      if (!name) {
        return badRequest('Workspace name is required');
      }

      // Generate slug from name
      const slug = sluggify(name);

      // Check if slug is already taken
      const existingWorkspaces = await queryItems<Workspace>(
        'workspaces',
        'SELECT * FROM c WHERE c.slug = @slug',
        [{ name: '@slug', value: slug }]
      );

      if (existingWorkspaces.length > 0) {
        return conflict('Workspace with this name already exists');
      }

      // Create workspace with default settings and owner role assignment
      const { workspace: createdWorkspace } = await createWorkspaceWithDefaults(
        name, 
        slug, 
        userId, 
        type
      );

      // Create membership for the current user (this is separate from role assignment)
      await createMembership({
        userId,
        resourceType: "workspace",
        resourceId: createdWorkspace.id,
        membershipType: "member",
        status: "active"
      }, userId);

      // If this is part of onboarding, trigger the workspace created event
      const url = new URL(request.url);
      const instanceId = url.searchParams.get('onboardingInstance');
      if (instanceId) {
        // Call the workflow endpoint to signal workspace creation
        const eventRequest = await fetch(`${BASE_URL}/api/${OnboardingEventNotification.Route}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            instanceId,
            userId,
            workspaceId: createdWorkspace.id
          })
        });

        if (!eventRequest.ok) {
          context.warn('Failed to signal workspace creation to onboarding process:', await eventRequest.text());
          // Continue anyway as the workspace is created successfully
        }
      }

      return created(createdWorkspace);
    } catch (error) {
      context.error('Error creating workspace:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "CreateWorkspace",
  Route: 'v1/workspaces',
  Handler: CreateWorkspaceHandler,
  Methods: ['POST'] as HttpMethod[],
  Input: {} as Workspace,
  Output: {} as Workspace,
};