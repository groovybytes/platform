import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { app } from '@azure/functions';
import { createItem, patchItem } from '../utils/cosmos';
import { getUserIdFromToken } from '../utils/auth';
import { hasWorkspaceRole } from '../utils/auth';
import { handleApiError, forbidden, notFound, badRequest } from '../utils/error';
import { v4 as uuidv4 } from 'uuid';
import type { Project } from '~/types/operational';

/**
 * Get default project settings
 */
function getDefaultProjectSettings() {
  return {
    defaultLocale: 'en-US',
    contentValidation: true,
    publishing: {
      workflow: 'simple',
      approvalRequired: false
    }
  };
}

/**
 * HTTP Trigger to create a new project in a workspace
 * POST /api/v1/workspaces/{workspaceId}/projects
 */
const CreateProjectHandler: HttpHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    // Get user ID from the authentication token
    const userId = getUserIdFromToken(request);
    
    // Get workspace ID from route parameter
    const workspaceId = request.params.workspaceId;
    if (!workspaceId) {
      return notFound('Workspace');
    }
    
    // Verify user has admin access to this workspace
    const hasAccess = await hasWorkspaceRole(userId, workspaceId, ['owner', 'admin']);
    if (!hasAccess) {
      return forbidden('You do not have sufficient permissions to create projects in this workspace');
    }
    
    // Parse and validate request body
    const body = await request.json();
    const { name, description = '' } = body;
    
    if (!name) {
      return badRequest('Project name is required');
    }
    
    const timestamp = new Date().toISOString();
    const projectId = uuidv4();
    
    // Create project
    const project: Project = {
      id: projectId,
      workspaceId,
      name,
      description,
      status: 'active',
      contentTypes: [],
      settings: getDefaultProjectSettings(),
      createdAt: timestamp,
      createdBy: userId,
      modifiedAt: timestamp,
      modifiedBy: userId
    };
    
    // Create project in Cosmos DB
    const createdProject = await createItem<Project>('projects', project);
    
    // Add project to workspace
    await patchItem(
      'workspaces',
      workspaceId,
      [{ 
        op: 'add', 
        path: '/projects/-', 
        value: projectId 
      }]
    );
    
    // Grant access to default team
    await patchItem(
      'workspaces',
      workspaceId,
      [{ 
        op: 'add', 
        path: '/teams/default/projectAccess/' + projectId, 
        value: ['admin'] 
      }]
    );
    
    return {
      status: 201,
      jsonBody: createdProject
    };
  } catch (error) {
    context.error('Error creating project:', error);
    return handleApiError(error);
  }
};

// Register the HTTP trigger
app.http('CreateProject', {
  route: 'api/v1/workspaces/{workspaceId}/projects',
  methods: ['POST'],
  authLevel: 'anonymous', // Relies on auth middleware/token validation
  handler: CreateProjectHandler,
});

export default CreateProjectHandler;