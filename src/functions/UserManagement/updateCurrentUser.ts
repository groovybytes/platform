import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { app } from '@azure/functions';
import { readItem, patchItem } from '../utils/cosmos';
import { getUserIdFromToken } from '../utils/auth';
import { handleApiError, badRequest } from '../utils/error';
import type { User } from '~/types/operational';

/**
 * Sanitize user object to remove sensitive data
 */
function sanitizeUserResponse(user: User): Partial<User> {
  // Only return safe user fields
  const { id, name, status, preferences, emails } = user;
  return { id, name, status, preferences, emails };
}

// Define allowed update fields
const UPDATABLE_FIELDS = ['name', 'preferences'];

/**
 * HTTP Trigger to update the current user's profile
 * PATCH /api/v1/users/me
 */
const UpdateCurrentUserHandler: HttpHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    // Get user ID from the authentication token
    const userId = getUserIdFromToken(request);
    
    // Parse and validate request body
    const updates = await request.json();
    
    // Only allow updates to specific fields
    const operations = [];
    let hasValidUpdates = false;
    
    for (const field of UPDATABLE_FIELDS) {
      if (updates[field] !== undefined) {
        operations.push({
          op: 'replace',
          path: `/${field}`,
          value: updates[field]
        });
        hasValidUpdates = true;
      }
    }
    
    // Add timestamp update
    operations.push({
      op: 'replace',
      path: '/modifiedAt',
      value: new Date().toISOString()
    });
    
    if (!hasValidUpdates) {
      return badRequest('No valid fields to update. Allowed fields: ' + UPDATABLE_FIELDS.join(', '));
    }
    
    // Update user in Cosmos DB
    const updatedUser = await patchItem<User>('users', userId, operations);
    
    // Return sanitized updated user data
    return {
      status: 200,
      jsonBody: sanitizeUserResponse(updatedUser)
    };
  } catch (error) {
    context.error('Error updating current user:', error);
    return handleApiError(error);
  }
};

// Register the HTTP trigger
app.http('UpdateCurrentUser', {
  route: 'api/v1/users/me',
  methods: ['PATCH'],
  authLevel: 'anonymous', // Relies on auth middleware/token validation
  handler: UpdateCurrentUserHandler,
});

export default UpdateCurrentUserHandler;