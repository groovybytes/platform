import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { app } from '@azure/functions';
import { queryItems } from '../utils/cosmos';
import { getUserIdFromToken } from '../utils/auth';
import { handleApiError } from '../utils/error';
import type { Workspace } from '~/types/operational';

/**
 * HTTP Trigger to list workspaces for the current user
 * GET /api/v1/workspaces
 */
const ListWorkspacesHandler: HttpHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    // Get user ID from the authentication token
    const userId = getUserIdFromToken(request);
    
    // Query workspaces where user has any role
    const query = `
      SELECT w.id, w.name, w.slug, w.type, w.status
      FROM w 
      JOIN u IN w.teams
      WHERE ARRAY_CONTAINS(u.members, @userId)
      OR EXISTS(SELECT VALUE r FROM r IN OBJECT_KEYS(w.roles) 
               WHERE EXISTS(SELECT VALUE m FROM m IN w.roles[r].members WHERE m = @userId))
    `;
    
    const workspaces = await queryItems<Partial<Workspace>>(
      'workspaces',
      query,
      [{ name: '@userId', value: userId }]
    );
    
    return {
      status: 200,
      jsonBody: { workspaces }
    };
  } catch (error) {
    context.error('Error listing workspaces:', error);
    return handleApiError(error);
  }
};

// Register the HTTP trigger
app.http('ListWorkspaces', {
  route: 'api/v1/workspaces',
  methods: ['GET'],
  authLevel: 'anonymous', // Relies on auth middleware/token validation
  handler: ListWorkspacesHandler,
});

export default ListWorkspacesHandler;