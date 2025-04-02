import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Permission, Workspace } from '~/types/operational';

import { getUserIdFromToken } from '~/utils/membership';
import { queryItems, createItem, patchItem } from '~/utils/cosmos';
import { badRequest, conflict, handleApiError } from '~/utils/error';

import { app } from '@azure/functions';
import { nanoid } from 'nanoid';

/**
 * Generate slug from workspace name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Get default workspace settings
 */
function getDefaultWorkspaceSettings() {
  return {
    contentTypes: ['page', 'article', 'product'],
    defaultLocale: 'en-US',
    supportedLocales: ['en-US'],
    security: {
      mfa: false,
      ssoEnabled: false,
      ipAllowlist: []
    },
    features: {
      experimentationEnabled: false,
      advancedAnalytics: false,
      aiAssistant: false
    }
  };
}

/**
 * Get default workspace roles
 */
function getDefaultWorkspaceRoles() {
  return {
    owner: {
      name: 'Owner',
      description: 'Full control over workspace',
      permissions: ['*']
    },
    admin: {
      name: 'Administrator',
      description: 'Administrative access to workspace settings',
      permissions: [
        'workspace:read', 'workspace:update',
        'users:read', 'users:invite', 'users:remove',
        'teams:*', 'projects:*'
      ]
    },
    billing: {
      name: 'Billing Manager',
      description: 'Access to billing and subscription settings',
      permissions: [
        'workspace:read',
        'billing:read', 'billing:update'
      ]
    },
    member: {
      name: 'Member',
      description: 'Regular workspace member',
      permissions: [
        'workspace:read',
        'users:read'
      ]
    },
    guest: {
      name: 'Guest',
      description: 'Limited access with specific permissions',
      permissions: [
        'workspace:read'
      ]
    }
  };
}

/**
 * Get default workspace permissions
 */
function getDefaultWorkspacePermissions(): Record<string, Permission> {
  return {
    'workspace:read': {
      description: 'View workspace details',
      category: 'data'
    },
    'workspace:update': {
      description: 'Update workspace settings',
      category: 'data'
    },
    'users:read': {
      description: 'View workspace users',
      category: 'data'
    },
    'users:invite': {
      description: 'Invite users to workspace',
      category: 'data'
    },
    'users:remove': {
      description: 'Remove users from workspace',
      category: 'data'
    },
    'teams:*': {
      description: 'Manage teams',
      category: 'data'
    },
    'projects:*': {
      description: 'Manage projects',
      category: 'data'
    },
    'billing:read': {
      description: 'View billing information',
      category: 'billing'
    },
    'billing:update': {
      description: 'Update billing settings',
      category: 'billing'
    }
  };
}

/**
 * HTTP Trigger to create a new workspace
 * POST /api/v1/workspaces
 */
const CreateWorkspaceHandler: HttpHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    // Get user ID from the authentication token
    const userId = getUserIdFromToken(request);

    // Parse and validate request body
    const body = await request.json() as Workspace;
    const { name, type = 'standard' } = body;

    if (!name) {
      return badRequest('Workspace name is required');
    }

    // Generate slug from name
    const slug = generateSlug(name);

    // Check if slug is already taken
    const existingWorkspaces = await queryItems<Workspace>(
      'workspaces',
      'SELECT * FROM c WHERE c.slug = @slug',
      [{ name: '@slug', value: slug }]
    );

    if (existingWorkspaces.length > 0) {
      return conflict('Workspace with this name already exists');
    }

    const timestamp = new Date().toISOString();
    const workspaceId = nanoid();

    // Create workspace with current user as owner
    const workspace: Workspace = {
      id: workspaceId,
      name,
      slug,
      type,
      status: 'active',
      settings: getDefaultWorkspaceSettings(),
      subscriptionId: null, // Will be set during billing setup
      roles: getDefaultWorkspaceRoles(),
      permissions: getDefaultWorkspacePermissions(),
      teams: {
        'default': {
          name: 'Default Team',
          description: 'Default team for workspace members',
          members: [userId],
          projectAccess: {}
        }
      },
      projects: [],
      createdAt: timestamp,
      createdBy: userId,
      modifiedAt: timestamp,
      modifiedBy: userId
    };

    // Create the workspace in Cosmos DB
    const createdWorkspace = await createItem<Workspace>('workspaces', workspace);

    // Add owner role to current user
    await patchItem(
      'users',
      userId,
      [{
        op: 'add',
        path: `/roles/workspaces/${workspaceId}`,
        value: ['owner']
      }]
    );

    // If this is part of onboarding, trigger the workspace created event
    const instanceId = request.query.get('onboardingInstance');
    if (instanceId) {
      // Call the workflow endpoint to signal workspace creation
      const eventRequest = await fetch(`${process.env.APP_BASE_URL}/api/onboarding/workspace-created`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instanceId,
          userId,
          workspaceId
        })
      });

      if (!eventRequest.ok) {
        context.warn('Failed to signal workspace creation to onboarding process:', await eventRequest.text());
        // Continue anyway as the workspace is created successfully
      }
    }

    return {
      status: 201,
      jsonBody: createdWorkspace
    };
  } catch (error) {
    context.error('Error creating workspace:', error);
    return handleApiError(error);
  }
};

// Register the HTTP trigger
const _FunctionName = "CreateWorkspace";
const _FunctionRoute = 'v1/workspaces';
const _FunctionHandler = CreateWorkspaceHandler;
app.http(_FunctionName, {
  route: _FunctionRoute,
  methods: ['POST'],
  authLevel: 'anonymous', // Relies on auth middleware/token validation
  handler: _FunctionHandler,
});

export type Input = Workspace;
export type Output = Workspace;
export default {
  name: _FunctionName,
  route: _FunctionRoute,
  handler: _FunctionHandler,
};