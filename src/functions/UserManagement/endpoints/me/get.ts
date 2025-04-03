// @filename: user-management/users/get-current-user.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { User } from '~/types/operational';

import { sanitizeUserResponse } from '../../_utils';
import { handleApiError, notFound } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { readItem } from '~/utils/cosmos';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to get the current user's profile
 * GET /v1/users/me
 */
const GetCurrentUserHandler: HttpHandler = secureEndpoint(
  "system:*:users:read:allow", // Basic permission needed to read own profile
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      // Get the user ID from the authentication context
      const { request: { userId } } = await getRequestContext(req);
      
      // Get the user from the database
      const user = await readItem<User>('users', userId);
      
      if (!user) {
        return notFound('User', userId);
      }
      
      // Return sanitized user data
      return ok(sanitizeUserResponse(user));
    } catch (error) {
      context.error('Error getting current user:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "GetCurrentUser",
  Route: "v1/users/me",
  Handler: GetCurrentUserHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: void 0 as void,
  Output: {} as Partial<User>,
};