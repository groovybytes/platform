// @filename: protect.ts
import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import type { PermissionOptions } from "./permissions";
import type { RequestContext } from "./context";

import { checkPermission, isPermissionAllowed } from "./permissions";
import { getRequestContext } from "./context";
import {
  forbidden,
  handleApiError,
  permissionDenied,
  PermissionDeniedError,
} from "./error";

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

  /**
   * Required resource context for validation
   * - If specified, ensures the user has a valid membership to this resource type
   */
  requireResource?: 'workspace' | 'project' | 'both';
}

export interface EnhacedLogContext extends Record<string, any> {
  requestId: string;
  requestPath: string;
  requestMethod: string;
  functionName: string;
  requestContext?: RequestContext;
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
 * ┌──────────────┐     ┌──────────────────┐     ┌──────────────┐      ┌──────────────────┐
 * │ HTTP Request │────>│ Permission Check │────>│ Verification │─────>│ Handler Executed │
 * └──────────────┘     └──────────────────┘     └──────────────┘      └──────────────────┘
 *                              │                       │                      │
 *                              │                       │                      │
 *                              ▼                       ▼                      ▼
 *                     ┌─────────────────┐     ┌───────────────┐      ┌──────────────────┐
 *                     │ Permission Error│     │ 403 Forbidden │      │ Other HTTP Error │
 *                     └─────────────────┘     └───────────────┘      └──────────────────┘
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
 *   "project:*:documents:read:allow",
 *   async (req, context) => {
 *     const documentId = req.params.id;
 *     const doc = await documentsService.getDocument(documentId);
 *     return { status: 200, jsonBody: doc };
 *   }
 * );
 * ```
 * 
 * @example
 * ```typescript
 * // Advanced usage with multiple permissions and resource context
 * const updateBillingInfo = protectEndpoint(
 *   checkUserPermission,
 *   {
 *     permissions: ["workspace:*:billing:write:allow", "workspace:*:billing:admin:allow"],
 *     match: "any", // User needs at least one of these permissions
 *     resourceName: "billing information",
 *     errorMessage: "You need billing write or admin permissions",
 *     requireResource: "workspace" // Ensures the user has a valid workspace membership
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
  checkFn: (permission: string | string[], req: Request | HttpRequest, context: T, options?: { 
    mode?: 'boolean' | 'throw',
    match?: 'any' | 'all',
    errorMessage?: string,
    requestContext?: RequestContext,
  }) => Promise<boolean>,
  access: string | string[] | AccessControl,
  handler: (req: Request | HttpRequest, context: T & EnhacedLogContext) => Promise<HttpResponseInit>,
  options: ProtectEndpointOptions = {}
): (req: Request | HttpRequest, context: T) => Promise<HttpResponseInit> {
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
      resourceName,
      requireResource
    } = accessControl;
    
    // Return the fully protected handler function that will never throw
    return async (req: Request | HttpRequest, context: T): Promise<HttpResponseInit> => {
      // Logger
      const logger = (context as InvocationContext) ?? console;
      const invocationId = (context as InvocationContext)?.invocationId || 'unknown';

      // Create enhanced logging context for this specific request
      const enhancedLogContext: EnhacedLogContext = {
        ...logContext,
        functionName,
        requestId: invocationId,
        requestPath: req.url || 'unknown',
        requestMethod: req.method || 'unknown',
      };

      try {
        // First, get the request context including the user and resource information
        const requestContext = await getRequestContext(req);
        Object.assign(enhancedLogContext, {
          requestContext,
        });
        
        // Validate resource membership if required
        if (requireResource) {
          if (requireResource === 'workspace' || requireResource === 'both') {
            if (!requestContext.workspace) {
              // Log resource context failure
              logger?.info?.(
                `Missing required workspace context for ${functionName}`,
                enhancedLogContext
              );
              
              return forbidden('This operation requires a valid workspace context');
            }
          }
          
          if (requireResource === 'project' || requireResource === 'both') {
            if (!requestContext.project) {
              // Log resource context failure
              logger?.info?.(
                `Missing required project context for ${functionName}`,
                enhancedLogContext
              );
              
              return forbidden('This operation requires a valid project context');
            }
          }
        }
        
        try {
          // Log permission check attempt (debug level)
          logger?.debug?.(
            `Checking permissions for ${functionName}`,
            { permissions, match, ...enhancedLogContext }
          );
          
          // Permission check with boolean mode for consistency
          const allowed = await checkFn(permissions, req, logger as T, { 
            mode: 'boolean',
            match,
            errorMessage,
            requestContext,
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
          return await handler(req, enhancedLogContext as T & EnhacedLogContext);
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
  checks: Array<(req: Request | HttpRequest, context: T) => HttpResponseInit | null>,
): (req: Request | HttpRequest, context: T) => HttpResponseInit | null {
  return (req: Request | HttpRequest, context: T) => {
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
 * Creates a permission checking function bound to the token permissions from the request
 * 
 * @param req - The HTTP request object
 * @returns A function that checks permissions using the token's permission list
 */
export function createRequestPermissionChecker(req: Request | HttpRequest) {
  // Extract user permissions from the request
  let _requestContext: RequestContext | null = null;
  
  /**
   * Check if the current user has the specified permission(s)
   * 
   * @param permission - Permission or permissions to check
   * @param options - Optional configuration for the permission check
   * @returns Boolean indicating if permission is allowed
   */
  return async function checkUserPermission(
    permission: string | string[],
    options: PermissionOptions = {}
  ): Promise<boolean> {
    // Extract user permissions from the request
    if (!_requestContext)  _requestContext = await getRequestContext(req);
    const requestContext = _requestContext;
    // Check permissions against the token permissions
    return checkPermission(requestContext.request.permissions, permission, options);
  };
}


/**
 * Simplified protectEndpoint wrapper that automatically checks permissions from the request token
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
  handler: (req: Request | HttpRequest, context: T & EnhacedLogContext) => Promise<HttpResponseInit>
) {
  return protectEndpoint(
    // Built-in permission checker that uses request token permissions
    async (permission, req, _, options) => {
      const requestContext = options?.requestContext ?? await getRequestContext(req);
      return checkPermission(requestContext.request.permissions, permission, options);
    },
    access,
    handler
  );
}

/**
 * Creates a middleware-style permission check function for the current request
 * 
 * @param req - The HTTP request containing user information
 * @returns A function that can check permissions and return HTTP errors or null
 */
export function createPermissionMiddleware(req: Request | HttpRequest) {
  let _requestContext: RequestContext | null = null;
  
  /**
   * Check if user has permission to access a resource
   * 
   * @param permission - Permission to check
   * @param resourceName - Optional resource name for error messages
   * @returns HttpResponseInit if denied, null if allowed
   */
  return async function checkResourcePermission(
    permission: string | string[],
    resourceName?: string
  ): Promise<HttpResponseInit | null> {
    try {
      if (!_requestContext) _requestContext = await getRequestContext(req);
      const requestContext = _requestContext;
      
      // Check permissions against the token permissions
      const allowed = checkPermission(requestContext.request.permissions, permission, {
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

/**
 * Validates a user has a valid active membership to a resource
 * 
 * @param req - The HTTP request
 * @param resourceType - The type of resource to validate membership for
 * @returns Boolean indicating if the user has a valid membership
 */
export async function validateResourceMembership(
  req: Request | HttpRequest,
  resourceType: 'workspace' | 'project' | 'both'
): Promise<boolean> {
  const requestContext = await getRequestContext(req);
  
  if (resourceType === 'workspace' || resourceType === 'both') {
    if (!requestContext.workspace) {
      return false;
    }
  }
  
  if (resourceType === 'project' || resourceType === 'both') {
    if (!requestContext.project) {
      return false;
    }
  }
  
  return true;
}

/**
 * Helper to check if a specific permission is allowed in the request context
 * 
 * @param req - The HTTP request
 * @param permission - The permission string to check
 * @returns Boolean indicating if the permission is allowed
 */
export async function isPermissionAllowedForRequest(
  req: Request | HttpRequest,
  permission: string
): Promise<boolean> {
  const requestContext = await getRequestContext(req);
  return isPermissionAllowed(requestContext.request.permissions, permission);
}