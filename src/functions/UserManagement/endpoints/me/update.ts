// @filename: user-management/users/update-current-user.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { User } from '~/types/operational';
import type { PatchOperation } from '@azure/cosmos';

import { handleApiError, badRequest, notFound } from '~/utils/error';
import { secureEndpoint } from '~/utils/protect';
import { getRequestContext } from '~/utils/context';
import { readItem, patchItem } from '~/utils/cosmos';
import { sanitizeUserResponse } from '../../_utils';
import { ok } from '~/utils/response';

// Define the fields that users are allowed to update for themselves
const ALLOWED_UPDATE_FIELDS = [
  'name',
  'preferences.language',
  'preferences.timezone'
];

/**
 * HTTP Trigger to update the current user's profile
 * PATCH /v1/users/me
 */
const UpdateCurrentUserHandler: HttpHandler = secureEndpoint(
  "system:*:users:update:allow", // Basic permission needed to update own profile
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      // Get the user ID from the authentication context
      const { request: { userId } } = await getRequestContext(req);
      
      // Get the user from the database
      const user = await readItem<User>('users', userId);
      
      if (!user) {
        return notFound('User', userId);
      }
      
      // Parse request body
      const updates = await req.json() as Partial<User>;
      
      // Validate the updates
      const operations: PatchOperation[] = [];
      let hasValidUpdates = false;
      
      // Check for name update
      if (updates.name !== undefined) {
        if (typeof updates.name !== 'string' || updates.name.trim().length === 0) {
          return badRequest('Name cannot be empty');
        }
        
        operations.push({
          op: 'replace',
          path: '/name',
          value: updates.name.trim()
        });
        
        hasValidUpdates = true;
      }
      
      // Check for preferences updates
      if (updates.preferences) {
        if (updates.preferences.language !== undefined) {
          operations.push({
            op: 'replace',
            path: '/preferences/language',
            value: updates.preferences.language
          });
          
          hasValidUpdates = true;
        }
        
        if (updates.preferences.timezone !== undefined) {
          operations.push({
            op: 'replace',
            path: '/preferences/timezone',
            value: updates.preferences.timezone
          });
          
          hasValidUpdates = true;
        }
      }
      
      // Check if there are any valid updates
      if (!hasValidUpdates) {
        const allowedFields = ALLOWED_UPDATE_FIELDS.join(', ');
        return badRequest(`No valid fields to update. Allowed fields: ${allowedFields}`);
      }
      
      // Add modified timestamp
      operations.push({
        op: 'replace',
        path: '/modifiedAt',
        value: new Date().toISOString()
      });
      
      // Apply the updates
      const updatedUser = await patchItem<User>(
        'users',
        userId,
        operations
      );
      
      // Return sanitized updated user data
      return ok(sanitizeUserResponse(updatedUser));
    } catch (error) {
      context.error('Error updating current user:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "UpdateCurrentUser",
  Route: "v1/users/me",
  Handler: UpdateCurrentUserHandler,
  Methods: ["PATCH"] as HttpMethod[],
  Input: {} as Partial<User>,
  Output: {} as Partial<User>,
};