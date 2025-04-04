import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { SupportedEventMap } from '~/functions/onboarding-orchestration/endpoints/event/_schema';
import type { Project, Workspace } from '~/types/operational';
import type { EnhacedLogContext } from '~/utils/protect';

import OnboardingEventNotification from '~/functions/onboarding-orchestration/endpoints/event/event';
import OnboardingOrchestrator from '~/functions/onboarding-orchestration/orchestrator/onboarding';
import * as df from 'durable-functions';

import { queryItems, patchItem, readItem } from '~/utils/cosmos/utils';
import { badRequest, conflict, handleApiError, notFound } from '~/utils/error';

import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { sluggify } from '~/utils/utils';
import { created } from '~/utils/response';

import { createProjectWithDefaults } from '../_settings';
import { BACKEND_BASE_URL } from '~/utils/config';
import { createMembership } from '~/utils/membership';
import { getUserById } from '~/utils/cosmos/helpers';

/**
 * HTTP Trigger to create a new project in a workspace
 * POST /api/v1/projects
 */
const CreateProjectHandler: HttpHandler = secureEndpoint(
  {
    permissions: "workspace:*:projects:create:allow",
    requireResource: "workspace"
  },
  async (request: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      // Get user ID from request context
      const { request: { userId }, workspace } = context?.requestContext ?? await getRequestContext(request);
      const user = await getUserById(userId);
      if (!user) {
        return badRequest('User not found');
      }
      
      // Ensure we have a workspace context
      if (!workspace) {
        return badRequest('Workspace context is required');
      }
      
      const workspaceId = workspace.id;
      
      // Get the existing workspace
      const existingWorkspace = await readItem<Workspace>('workspaces', workspaceId, workspaceId);
      
      if (!existingWorkspace) {
        return notFound('Workspace', workspaceId);
      }

      // Parse and validate request body
      const body = await request.json() as Project;
      const { name, description } = body;

      if (!name) {
        return badRequest('Project name is required');
      }

      // Generate slug from name
      const slug = sluggify(name);

      // Check if slug is already taken in this workspace
      const existingProjects = await queryItems<Project>(
        'projects',
        'SELECT * FROM c WHERE c.workspaceId = @workspaceId AND c.slug = @slug',
        [
          { name: '@workspaceId', value: workspaceId },
          { name: '@slug', value: slug }
        ]
      );

      if (existingProjects.length > 0) {
        return conflict('Project with this name already exists in this workspace');
      }

      // Create project with default settings and owner role assignment
      const { project: createdProject } = await createProjectWithDefaults(
        name,
        slug,
        workspaceId,
        userId,
        description
      );
      
      // Create membership for the current user (this is separate from role assignment)
      await createMembership({
        userId,
        resourceType: "project",
        resourceId: createdProject.id,
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
            type: 'new_project',
            userId,
            email: user.emails.primary,
            name: user.name,
            resourceId: createdProject.id,
            resourceType: 'project',
            workspaceId // For projects
          } as typeof OnboardingOrchestrator.Input
        });
      }

      if (instanceId) {
        // Signal resource.created event to any waiting orchestrators
        await client.raiseEvent(instanceId, OnboardingEventNotification.Name, {
          eventType: 'resource.created',
          resourceId: createdProject.id,
          resourceType: 'project'
        } as SupportedEventMap['resource.created']);
      }

      // Update the workspace to include this project
      await patchItem<Workspace>(
        'workspaces',
        workspaceId,
        [{ op: 'add', path: '/projects/-', value: createdProject.id }],
        workspaceId
      );

      return created(createdProject);
    } catch (error) {
      context.error('Error creating project:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "CreateProject",
  Route: 'v1/projects',
  Handler: CreateProjectHandler,
  Methods: ['POST'] as HttpMethod[],
  Input: {} as Project,
  Output: {} as Project,
};