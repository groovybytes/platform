import type { HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  forbidden,
  handleApiError,
  permissionDenied,
  PermissionDeniedError,
} from "./error";
import { checkPermission, type PermissionOptions } from "./permissions";

/**
 * Configuration options for the protected endpoint
 */
export interface ProtectEndpointOptions {
  /**
   * Additional context to include in error logs
   */
  logContext?: Record<string, any>;

  /**
   * Function name for error reporting
   */
  functionName?: string;
}

/**
 * Access control configuration for an endpoint
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
 * Creates a protected API endpoint handler with permission-based authorization for Azure Functions.
 * 
 * This higher-order function wraps an Azure Function HTTP trigger with permission checking
 * and comprehensive error handling to ensure the function never crashes due to unhandled
 * exceptions. All errors are captured and converted to appropriate HTTP responses.
 * 
 * @remarks
 * The authorization flow works as follows:
 * ```
 * ┌─────────────┐     ┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
 * │ HTTP Request│────>│ Permission Check│────>│ Verification │────>│ Handler Executed│
 * └─────────────┘     └─────────────────┘     └──────────────┘     └─────────────────┘
 *                              │                       │                      │
 *                              │                       │                      │
 *                              ▼                       ▼                      ▼
 *                     ┌─────────────────┐     ┌─────────────────┐    ┌─────────────────┐
 *                     │ Permission Error│     │ 403 Forbidden   │    │ Other HTTP Error│
 *                     └─────────────────┘     └─────────────────┘    └─────────────────┘
 * ```
 * 
 * @security
 * CRITICAL: This function is a primary security gate for the API. Any changes to this function
 * must be carefully reviewed as they can potentially create security vulnerabilities.
 * 
 * Security principles enforced:
 * 1. Deny by default - Any result other than an explicit 'true' from checkFn is treated as denial
 * 2. Defense in depth - Multiple layers of error handling to prevent authorization bypasses
 * 3. Fail closed - Errors during permission checking result in access denial, not system errors
 * 4. Comprehensive error handling - All errors are captured and returned as HTTP responses
 * 5. Azure Functions stability - Function never crashes due to unhandled exceptions
 * 
 * @param checkFn - A function that verifies if the requester has the required permissions.
 *                  This function MUST return true for authorization to succeed, any other
 *                  value (including falsy values, undefined, or errors) will result in denial.
 * 
 * @param access - The permission(s) required to access this endpoint. Can be:
 *                - A single permission string (e.g., "documents:read")
 *                - An array of permission strings (e.g., ["documents:read", "documents:write"])
 *                - An AccessControl object for more complex requirements
 * 
 * @param handler - The API handler function to execute if permission check passes.
 *                  This function will only be called if the permission check succeeds.
 *                  Any errors thrown by this handler will be caught and converted to HTTP responses.
 * 
 * @param options - Optional configuration settings for the protected endpoint.
 * 
 * @returns A function that first checks permissions before calling the handler and handles all errors.
 *          This function is guaranteed to return an HttpResponseInit and never throw exceptions.
 * 
 * @example
 * ```typescript
 * // Basic usage with a single permission
 * const getDocument = protectEndpoint(
 *   checkUserPermission,
 *   "documents:read",
 *   async (req, context) => {
 *     const documentId = req.params.id;
 *     const doc = await documentsService.getDocument(documentId);
 *     return { status: 200, jsonBody: doc };
 *   }
 * );
 * 
 * // Register with Azure Functions
 * app.http('getDocument', {
 *   methods: ['GET'],
 *   authLevel: 'function',
 *   route: 'documents/{id}',
 *   handler: getDocument
 * });
 * ```
 * 
 * @example
 * ```typescript
 * // Advanced usage with multiple permissions
 * const updateBillingInfo = protectEndpoint(
 *   checkUserPermission,
 *   {
 *     permissions: ["billing:write", "billing:admin"],
 *     match: "any", // User needs at least one of these permissions
 *     resourceName: "billing information",
 *     errorMessage: "You need billing write or admin permissions"
 *   },
 *   async (req, context) => {
 *     // Handler implementation
 *     // Any errors thrown here will be properly handled
 *   },
 *   {
 *     functionName: 'updateBillingInfo',
 *     logContext: { module: 'billing' }
 *   }
 * );
 * ```
 * 
 * @example
 * ```typescript
 * // Error handling behavior example
 * const updateUser = protectEndpoint(
 *   checkUserPermission,
 *   "users:update",
 *   async (req, context) => {
 *     // All of these error scenarios are handled automatically:
 *     
 *     // 1. Validation error → 400 Bad Request
 *     if (!req.body.email) {
 *       throw { name: 'ValidationError', message: 'Email is required' };
 *     }
 *     
 *     // 2. Not found error → 404 Not Found
 *     const user = await userService.findById(req.params.id);
 *     if (!user) {
 *       return notFound('User', req.params.id);
 *     }
 *     
 *     // 3. Database error → 500 Internal Server Error
 *     await userService.update(user, req.body);
 *     
 *     return { status: 200, jsonBody: { success: true } };
 *   }
 * );
 * ```
 * 
 * @potential_risk Edge Cases and Security Considerations:
 * 
 * 1. RISK: Relying on checkFn to throw errors instead of returning false
 *    - IMPACT: If checkFn is expected to throw but doesn't, it might incorrectly allow access
 *    - MITIGATION: Always validate explicit 'true' return and treat everything else as denial
 * 
 * 2. RISK: Passing incorrect or overly permissive permissions
 *    - IMPACT: Users might gain access to unauthorized resources
 *    - MITIGATION: Use specific, least-privilege permissions and carefully review permissions in code reviews
 * 
 * 3. RISK: Inconsistent error handling allowing bypasses
 *    - IMPACT: Some errors might be incorrectly handled, leading to unexpected behaviors
 *    - MITIGATION: All errors in both permission checking and handler execution are caught
 * 
 * 4. RISK: Improper handling of null/undefined access parameters
 *    - IMPACT: Missing permission checks could allow unauthorized access
 *    - MITIGATION: Validate access parameters and fail closed if not properly defined
 * 
 * 5. RISK: Silencing critical errors that should alert operations
 *    - IMPACT: Serious issues might go unnoticed while appearing as normal permission errors
 *    - MITIGATION: All errors are logged with context information for monitoring
 *
 * 6. RISK: Overreliance on error handling without proper validation
 *    - IMPACT: Business logic errors might be masked as general server errors
 *    - MITIGATION: Use proper validation before operations and throw specific error types
 * 
 * 7. RISK: Accessing resources after permission check but before specific object validation
 *    - IMPACT: Time-of-check to time-of-use (TOCTOU) vulnerabilities
 *    - MITIGATION: Perform object-level permission checks in handler when necessary
 *
 * 8. RISK: Azure Functions timeout while waiting for handler completion
 *    - IMPACT: Long-running operations might timeout without proper response
 *    - MITIGATION: Implement appropriate timeouts and consider using durable functions for long operations
 */
export function protectEndpoint<T>(
  checkFn: (permission: string | string[], req: any, context: T, options?: any) => boolean,
  access: string | string[] | AccessControl,
  handler: (req: any, context: T) => Promise<HttpResponseInit>,
  options: ProtectEndpointOptions = {}
): (req: any, context: T) => Promise<HttpResponseInit> {
  // Capture function initialization errors
  try {
    // Set default options
    const {
      logContext = {},
      functionName = handler.name || 'anonymous-function'
    } = options;
    
    // Validate and normalize access control configuration to prevent security misconfigurations
    if (!access) {
      throw new Error('SECURITY ERROR: Missing access control configuration');
    }
    
    const accessControl: AccessControl = typeof access === 'string' || Array.isArray(access)
      ? { permissions: access }
      : access;
    
    // Validate permissions are properly defined to prevent authorization bypass
    if (!accessControl.permissions || 
        (Array.isArray(accessControl.permissions) && accessControl.permissions.length === 0)) {
      throw new Error('SECURITY ERROR: Empty or undefined permissions in access control');
    }
    
    const {
      permissions,
      match = 'any',
      errorMessage = `You don't have permission to access this endpoint`,
      resourceName
    } = accessControl;
    
    // Return the fully protected handler function that will never throw
    return async (req: any, context: T): Promise<HttpResponseInit> => {
      // Logger
      const logger = (context as InvocationContext) ?? console;
      const invocationId = (context as InvocationContext)?.invocationId || 'unknown';

      // Create enhanced logging context for this specific request
      const enhancedLogContext = {
        ...logContext,
        functionName,
        requestId: invocationId,
        requestPath: req.url || 'unknown',
        requestMethod: req.method || 'unknown'
      };

      try {        
        try {
          // Log permission check attempt (debug level)
          logger?.debug?.(
            `Checking permissions for ${functionName}`,
            { permissions, match, ...enhancedLogContext }
          );
          
          // Permission check with boolean mode for consistency
          const allowed = checkFn(permissions, req, logger as T, { 
            mode: 'boolean',
            match,
            errorMessage
          });
          
          // Strict check - only explicit true is considered authorized
          if (allowed !== true) {
            const permissionStr = typeof permissions === 'string' 
              ? permissions 
              : (Array.isArray(permissions) ? permissions[0] : 'unknown');
            
            // Log permission denial (info level)
            logger?.info?.(
              `Permission denied: ${permissionStr} for ${resourceName || functionName}`,
              { 
                permissionStr,
                resourceName,
                ...enhancedLogContext
              }
            );
            
            return permissionDenied(permissionStr, resourceName, errorMessage);
          }
        } catch (permCheckError) {
          // Handle expected permission errors
          if (permCheckError instanceof PermissionDeniedError) {
            const permissionStr = typeof permissions === 'string' 
              ? permissions 
              : (permCheckError.requestedPermission || 
                 (Array.isArray(permissions) ? permissions[0] : 'unknown'));
            
            // Log explicit permission denial (info level)
            logger?.info?.(
              `Permission explicitly denied: ${permissionStr} for ${resourceName || functionName}`,
              {
                permissionStr,
                resourceName,
                error: permCheckError.message,
                ...enhancedLogContext
              }
            );
            
            return permissionDenied(permissionStr, resourceName, permCheckError.message);
          }
          
          // Log unexpected permission check errors (error level)
          logger?.error?.(
            `Unexpected error during permission check for ${functionName}:`,
            {
              error: permCheckError,
              phase: 'permission-check',
              ...enhancedLogContext
            }
          );
          
          // Fail closed for any errors during permission checking
          return permissionDenied(
            typeof permissions === 'string' ? permissions : 'unknown',
            resourceName,
            'Permission check failed due to an error'
          );
        }  

        // Log successful permission check (debug level)
        logger?.debug?.(
          `Permission check passed for ${functionName}`,
          enhancedLogContext
        );
        
        // HANDLER EXECUTION PHASE      
        // Execute the handler with full error protection
        try {
          return await handler(req, context);
        } catch (handlerError) {
          // Log handler execution errors (error level)
          logger?.error?.(
            `Error in handler execution for ${functionName}:`,
            {
              error: handlerError,
              phase: 'handler-execution',
              ...enhancedLogContext
            }
          );
          
          // Convert handler errors to HTTP responses using general API error handler
          return handleApiError(handlerError);
        }
      } catch (outerError) {
        // CRITICAL: This is the ultimate fallback for any errors that weren't caught
        // by the inner try/catch blocks. This ensures the Azure Function never crashes.
        
        // Log critical unhandled errors (critical level)
        logger?.error?.(
          `CRITICAL: Unhandled error in protectEndpoint wrapper for ${functionName}:`,
          {
            error: outerError,
            phase: 'outer-handler',
            isCritical: true,
            ...enhancedLogContext
          }
        );
        
        // Return a generic server error response
        return {
          status: 500,
          jsonBody: {
            error: 'Internal server error',
            message: 'An unexpected error occurred',
            code: 'INTERNAL_SERVER_ERROR',
            requestId: invocationId
          },
          headers: {
            'Content-Type': 'application/json'
          }
        };
      }
    };
  } catch (initError) {
    // Handle errors during function initialization (extremely rare but possible)
    console.error('CRITICAL: Error during protectEndpoint initialization:', initError);
    
    // Return a function that always returns an error response
    return async () => ({
      status: 500,
      jsonBody: {
        error: 'Internal server error',
        message: 'API endpoint misconfiguration',
        code: 'ENDPOINT_CONFIGURATION_ERROR'
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

/**
 * Combine multiple permission checks for complex authorization scenarios
 * @param checks Array of permission checking functions
 * @returns A function that executes all checks and returns an error if any fail
 */
export function combinePermissionChecks<T>(
  checks: Array<(req: any, context: T) => HttpResponseInit | null>,
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


/**
 * Extracts user information from a request
 * 
 * @remarks
 * This function centralizes user extraction logic to ensure consistent 
 * user identification across the application. It should be adapted to
 * match your specific authentication implementation.
 * 
 * @param req - The HTTP request object
 * @returns User object with id and permissions
 */
export function extractUserFromRequest(req: any): { id: string; permissions: string[] } {
  // IMPORTANT: Replace this implementation with your actual auth extraction logic
  // This could involve JWT token validation, session lookup, etc.
  
  // Example implementation:
  // - Check authorization header for Bearer token
  // - Verify and decode JWT
  // - Extract user ID and permissions from JWT claims

  const authHeader = req.headers?.authorization;
  
  if (authHeader?.startsWith('Bearer ')) {
    try {
      // This is a simplified example - real implementation would validate the token
      const token = authHeader.substring(7);
      
      // Parse JWT payload (simplified example - use a proper JWT library in production)
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      );
      
      return {
        id: payload.sub || 'unknown',
        permissions: Array.isArray(payload.permissions) ? payload.permissions : []
      };
    } catch (error) {
      console.error('Error extracting user from token:', error);
    }
  }
  
  // Default for unauthenticated requests
  return {
    id: 'anonymous',
    permissions: []
  };
}

/**
 * Creates a permission checking function bound to the current request
 * 
 * @remarks
 * This helper eliminates the need to manually extract user permissions
 * for each permission check, making authorization checks cleaner and
 * less error-prone.
 * 
 * @param req - The HTTP request object
 * @returns A function that checks permissions for the current user
 */
export function createRequestPermissionChecker(req: any) {
  // Extract user permissions once
  const user = extractUserFromRequest(req);
  
  /**
   * Check if the current user has the specified permission(s)
   * 
   * @param permission - Permission or permissions to check
   * @param options - Optional configuration for the permission check
   * @returns Boolean indicating if permission is allowed
   */
  return function checkUserPermission(
    permission: string | string[],
    options: PermissionOptions = {}
  ): boolean {
    return checkPermission(user.permissions, permission, options);
  };
}

/**
 * Simplified protectEndpoint wrapper that automatically extracts user permissions
 * 
 * @remarks
 * This function eliminates the need to provide a custom permission checking function
 * to protectEndpoint, making it simpler to secure API endpoints consistently.
 * 
 * @param access - Permission requirements for the endpoint
 * @param handler - The API handler function
 * @returns Protected handler function with automatic permission checking
 */
export function secureEndpoint<T>(
  access: string | string[] | AccessControl,
  handler: (req: any, context: T) => Promise<HttpResponseInit>
) {
  return protectEndpoint(
    // Built-in permission checker that extracts user from request
    (permission, req, _, options) => {
      const user = extractUserFromRequest(req);
      return checkPermission(user.permissions, permission, options);
    },
    access,
    handler
  );
}

/**
 * Creates a middleware-style permission check function for a specific user
 * 
 * @param req - The HTTP request containing user information
 * @returns A function that can check permissions and return HTTP errors or null
 */
export function createPermissionMiddleware(req: any) {
  const user = extractUserFromRequest(req);
  
  /**
   * Check if user has permission to access a resource
   * 
   * @param permission - Permission to check
   * @param resourceName - Optional resource name for error messages
   * @returns HttpResponseInit if denied, null if allowed
   */
  return function checkResourcePermission(
    permission: string | string[],
    resourceName?: string
  ): HttpResponseInit | null {
    try {
      const allowed = checkPermission(user.permissions, permission, {
        mode: 'throw',
        errorMessage: resourceName 
          ? `You don't have permission to access ${resourceName}` 
          : undefined
      });
      
      return null; // Permission granted
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        return permissionDenied(
          typeof permission === 'string' ? permission : permission[0], 
          resourceName, 
          error.message
        );
      }
      
      // Unexpected error during permission check
      return forbidden('Access denied due to an error');
    }
  };
}