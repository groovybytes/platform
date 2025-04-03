import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { app } from '@azure/functions';
import { queryItems } from '../utils/cosmos';
import { getUserIdFromToken } from '../utils/auth';
import { hasWorkspaceAccess } from '../utils/auth';
import { handleApiError, forbidden, notFound } from '../utils/error';
import type { Project } from '~/types/operational';

/**
 * HTTP Trigger to list projects in a workspace
 * GET /api/v1/workspaces/{workspaceId}/projects
 */
const ListProjectsHandler: HttpHandler = async (
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
    
    // Verify user has access to this workspace
    const hasAccess = await hasWorkspaceAccess(userId, workspaceId);
    if (!hasAccess) {
      return forbidden('You do not have access to this workspace');
    }
    
    // Query projects for this workspace
    const projects = await queryItems<Project>(
      'projects',
      'SELECT * FROM c WHERE c.workspaceId = @workspaceId',
      [{ name: '@workspaceId', value: workspaceId }]
    );
    
    return {
      status: 200,
      jsonBody: { projects }
    };
  } catch (error) {
    context.error('Error listing projects:', error);
    return handleApiError(error);
  }
};

// Register the HTTP trigger
app.http('ListProjects', {
  route: 'api/v1/workspaces/{workspaceId}/projects',
  methods: ['GET'],
  authLevel: 'anonymous', // Relies on auth middleware/token validation
  handler: ListProjectsHandler,
});

export default ListProjectsHandler;