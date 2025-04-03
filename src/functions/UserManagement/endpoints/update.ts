// @filename: user-management/users/update-user.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { User } from '~/types/operational';
import type { PatchOperation } from '@azure/cosmos';

import { handleApiError, badRequest, notFound, permissionDenied } from '~/utils/error';
import { secureEndpoint } from '~/utils/protect';
import { getRequestContext } from '~/utils/context';
import { readItem, patchItem } from '~/utils/cosmos';

import { sanitizeUserResponse } from '../_utils';
import { ok } from '~/utils/response';

// Define the fields that admins are allowed to update
const ALLOWED_ADMIN_UPDATE_FIELDS = [
  'name',
  'status',
  'preferences',
  'emails'
];

/**
 * HTTP Trigger to update a user as an admin
 * PATCH /v1/users/{id}
 */
const UpdateUserHandler: HttpHandler = secureEndpoint(
  "system:*:users:admin:allow", // Only system admins can update other users
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const targetUserId = request.params.id;
      
      if (!targetUserId) {
        return badRequest('User ID is required');
      }
      
      // Get the user from the database
      const user = await readItem<User>('users', targetUserId);
      
      if (!user) {
        return notFound('User', targetUserId);
      }
      
      // Get the current user's context
      const { request: { userId } } = await getRequestContext(req);
      
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
      
      // Check for status update
      if (updates.status !== undefined) {
        const validStatuses = ['active', 'inactive', 'suspended', 'pending', 'deleted'];
        if (!validStatuses.includes(updates.status)) {
          return badRequest(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }
        
        operations.push({
          op: 'replace',
          path: '/status',
          value: updates.status
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
      
      // Check for email updates
      if (updates.emails) {
        if (updates.emails.primary !== undefined) {
          // Validate email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(updates.emails.primary)) {
            return badRequest('Invalid email format');
          }
          
          operations.push({
            op: 'replace',
            path: '/emails/primary',
            value: updates.emails.primary
          });
          
          // Update all emails array if primary email changes
          operations.push({
            op: 'replace',
            path: '/emails/all',
            value: [...new Set([updates.emails.primary, ...(updates.emails.all || user.emails.all || [])])]
          });
          
          hasValidUpdates = true;
        } else if (updates.emails.all !== undefined) {
          // Just updating the all array
          operations.push({
            op: 'replace',
            path: '/emails/all',
            value: [...new Set([user.emails.primary, ...(updates.emails.all || [])])]
          });
          
          hasValidUpdates = true;
        }
      }
      
      // Check if there are any valid updates
      if (!hasValidUpdates) {
        const allowedFields = ALLOWED_ADMIN_UPDATE_FIELDS.join(', ');
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
        targetUserId,
        operations
      );
      
      // Return sanitized updated user data
      return ok(sanitizeUserResponse(updatedUser));
    } catch (error) {
      context.error('Error updating user:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "UpdateUser",
  Route: "v1/users/{id}",
  Handler: UpdateUserHandler,
  Methods: ["PATCH"] as HttpMethod[],
  Input: {} as { id: string } & Partial<User>,
  Output: {} as Partial<User>,
};