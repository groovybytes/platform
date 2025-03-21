import type { HttpResponseInit } from '@azure/functions';
import type { ErrorResponse } from "@azure/cosmos";
import { PermissionDeniedError } from './permissions';

/**
 * Standard API error response format
 */
export interface ApiError {
  error: string;
  message?: string;
  details?: any;
  code?: string;
}

/**
 * Create a standard error response
 * @param status HTTP status code
 * @param message Error message
 * @param details Additional error details
 * @param code Error code
 */
export function createErrorResponse(
  status: number,
  message: string,
  details?: any,
  code?: string
): HttpResponseInit {
  const error: ApiError = {
    error: message,
    ...(details && { details }),
    ...(code && { code })
  };

  return {
    status,
    jsonBody: error,
    headers: {
      'Content-Type': 'application/json'
    }
  };
}

/**
 * Create a 400 Bad Request response
 * @param message Error message
 * @param details Additional error details
 */
export function badRequest(message: string, details?: any): HttpResponseInit {
  return createErrorResponse(400, message, details, 'BAD_REQUEST');
}

/**
 * Create a 401 Unauthorized response
 * @param message Error message
 */
export function unauthorized(message: string = 'Unauthorized'): HttpResponseInit {
  return createErrorResponse(401, message, undefined, 'UNAUTHORIZED');
}

/**
 * Create a 403 Forbidden response
 * @param message Error message
 */
export function forbidden(message: string = 'Access denied'): HttpResponseInit {
  return createErrorResponse(403, message, undefined, 'FORBIDDEN');
}

/**
 * Create a 404 Not Found response
 * @param resource Resource type that wasn't found
 * @param id ID of the resource
 */
export function notFound(resource: string, id?: string): HttpResponseInit {
  const message = id
    ? `${resource} with ID ${id} not found`
    : `${resource} not found`;

  return createErrorResponse(404, message, undefined, 'NOT_FOUND');
}

/**
 * Create a 409 Conflict response
 * @param message Error message
 * @param details Additional error details
 */
export function conflict(message: string, details?: any): HttpResponseInit {
  return createErrorResponse(409, message, details, 'CONFLICT');
}

/**
 * Create a 500 Internal Server Error response
 * @param error Error object
 */
export function serverError(error: any): HttpResponseInit {
  // In production, don't expose internal error details
  const isDevelopment = process.env.NODE_ENV === 'development';

  return createErrorResponse(
    500,
    'Internal server error',
    isDevelopment ? {
      message: error.message,
      stack: error.stack
    } : undefined,
    'INTERNAL_SERVER_ERROR'
  );
}

/**
 * Create a detailed 403 Forbidden response for permission issues
 * @param permission The permission that was denied (e.g., "data:read")
 * @param resource Optional resource name or ID that was being accessed
 * @param customMessage Optional custom error message
 */
export function permissionDenied(
  permission: string,
  resource?: string,
  customMessage?: string
): HttpResponseInit {
  const [scope, action] = permission.split(':');

  let message = customMessage;
  if (!message) {
    message = resource
      ? `You don't have permission to ${action} ${scope}${resource ? ` for ${resource}` : ''}`
      : `Permission denied: ${permission}`;
  }

  return createErrorResponse(403, message, {
    permission,
    scope,
    action,
    resource
  }, 'PERMISSION_DENIED');
}

/**
 * Handle permission errors in function handlers
 * @param fn The function handler to wrap with permission checking
 */
export function withPermissionCheck<T, U>(
  fn: (context: T) => Promise<U>
): (context: T) => Promise<U> {
  return async (context: T) => {
    try {
      return await fn(context);
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        throw permissionDenied(
          error.requestedPermission || 'unknown',
          undefined,
          error.message
        );
      }
      throw error;
    }
  };
}

/**
 * Handle API errors and generate appropriate responses
 * @param error Error object
 */
export function handleApiError(error: any): HttpResponseInit {
  console.error('API Error:', error);

  // Handle permission errors
  if (error instanceof PermissionDeniedError) {
    return permissionDenied(
      error.requestedPermission || 'unknown',
      undefined,
      error.message
    );
  }

  // Handle Cosmos DB errors
  if (isCosmosError(error)) {
    switch (error.code) {
      case 404:
        return notFound('Resource');
      case 409:
        return conflict('Resource conflict', { message: error.message });
      case 403:
        return forbidden();
      default:
        return serverError(error);
    }
  }

  // Handle known error types
  if (error.name === 'ValidationError') {
    return badRequest(error.message, error.details);
  }

  if (error.name === 'UnauthorizedError') {
    return unauthorized(error.message);
  }

  // Default to server error
  return serverError(error);
}

/**
 * Type guard for Cosmos DB errors
 */
export function isCosmosError(error: any): error is ErrorResponse {
  return error && typeof error.code === 'number' && error.code >= 400;
}

/**
 * Access control rule for an endpoint
 */
export interface AccessControl {
  /**
   * Required permissions - can be a single permission string or an array
   */
  permissions: string | string[];

  /**
   * Match type for multiple permissions
   * - 'any': Any one permission is sufficient (default)
   * - 'all': All permissions are required
   */
  match?: 'any' | 'all';

  /**
   * Custom error message if access is denied
   */
  errorMessage?: string;

  /**
   * Resource name for error messages
   */
  resourceName?: string;
}

/**
 * Higher-order function that wraps an API handler with permission checking
 * @param checkFn The permission check function to use
 * @param access Permission(s) required to access the API (string, string array, or AccessControl object)
 * @param handler The API handler function
 */
export function protectEndpoint<T>(
  checkFn: (p: string | string[], opts?: any) => boolean,
  access: string | string[] | AccessControl,
  handler: (req: any, context: T) => Promise<HttpResponseInit>
) {
  // Normalize access control configuration
  const accessControl: AccessControl = typeof access === 'string' || Array.isArray(access)
    ? { permissions: access }
    : access;

  const {
    permissions,
    match = 'any',
    errorMessage = `You don't have permission to access this endpoint`,
    resourceName
  } = accessControl;

  return async (req: any, context: T): Promise<HttpResponseInit> => {
    try {
      // Try to check the permission(s)
      const result = checkFn(permissions, {
        mode: 'throw',
        match,
        errorMessage
      });

      // If permission check passes, call the handler
      return await handler(req, context);
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        const permissionStr = typeof permissions === 'string'
          ? permissions
          : (error.requestedPermission || permissions[0]);

        return permissionDenied(permissionStr, resourceName, error.message);
      }

      // Pass other errors to the general error handler
      return handleApiError(error);
    }
  };
}

/**
 * Combine multiple permission checks for complex authorization scenarios
 * @param checks Array of permission checking functions
 * @returns A function that executes all checks and returns an error if any fail
 */
export function combinePermissionChecks<T>(
  checks: Array<(req: any, context: T) => HttpResponseInit | null>
): (req: any, context: T) => HttpResponseInit | null {
  return (req: any, context: T) => {
    for (const check of checks) {
      const result = check(req, context);
      if (result !== null) {
        return result; // Return the first error response
      }
    }
    return null; // All checks passed
  };
}