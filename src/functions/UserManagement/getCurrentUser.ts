import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { app } from '@azure/functions';
import { readItem } from '../utils/cosmos';
import { getUserIdFromToken } from '../utils/auth';
import { handleApiError } from '../utils/error';
import type { User } from '~/types/operational';

/**
 * Sanitize user object to remove sensitive data
 */
function sanitizeUserResponse(user: User): Partial<User> {
  // Only return safe user fields
  const { id, name, status, preferences, emails } = user;
  return { id, name, status, preferences, emails };
}

/**
 * HTTP Trigger to get the current user's profile
 * GET /api/v1/users/me
 */
const GetCurrentUserHandler: HttpHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    // Get user ID from the authentication token
    const userId = getUserIdFromToken(request);
    
    // Fetch user from Cosmos DB
    const user = await readItem<User>('users', userId);
    
    // Return sanitized user data
    return {
      status: 200,
      jsonBody: sanitizeUserResponse(user)
    };
  } catch (error) {
    context.error('Error fetching current user:', error);
    return handleApiError(error);
  }
};

// Register the HTTP trigger
app.http('GetCurrentUser', {
  route: 'api/v1/users/me',
  methods: ['GET'],
  authLevel: 'anonymous', // Relies on auth middleware/token validation
  handler: GetCurrentUserHandler,
});

export default GetCurrentUserHandler;