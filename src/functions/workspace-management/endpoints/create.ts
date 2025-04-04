// @filename: workspace-management/endpoints/create.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { SupportedEventMap } from '~/functions/onboarding-orchestration/endpoints/event/_schema';
import type { EnhacedLogContext } from '~/utils/protect';
import type { Workspace } from '~/types/operational';

import OnboardingEventNotification from '~/functions/onboarding-orchestration/endpoints/event/event';
import OnboardingOrchestrator from '~/functions/onboarding-orchestration/orchestrator/onboarding';
import * as df from 'durable-functions';

import { queryItems } from '~/utils/cosmos/utils';
import { badRequest, conflict, handleApiError } from '~/utils/error';

import { createMembership } from '~/utils/membership';
import { getRequestContext } from '~/utils/context';

import { createWorkspaceWithDefaults } from '../_settings';

import { getUserById } from '~/utils/cosmos/helpers';
import { secureEndpoint } from '~/utils/protect';

import { sluggify } from '~/utils/utils';
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
      const user = await getUserById(userId);
      if (!user) {
        return badRequest('User not found');
      }

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
      let instanceId = url.searchParams.get('onboardingInstance') || undefined;

      const client = df.getClient(context);
      if (!instanceId) {
        instanceId = await client.startNew(OnboardingOrchestrator.Name, {
          instanceId,
          input: {
            type: 'new_workspace',
            userId,
            email: user.emails.primary,
            name: user.name,
            resourceId: createdWorkspace.id,
            resourceType: 'workspace'
          } as typeof OnboardingOrchestrator.Input
        });
      }

      if (instanceId) {
        // Signal resource.created event to any waiting orchestrators
        await client.raiseEvent(instanceId, OnboardingEventNotification.Name, {
          eventType: 'resource.created',
          resourceId: createdWorkspace.id,
          resourceType: 'workspace'
        } as SupportedEventMap['resource.created']);
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