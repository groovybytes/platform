import { permissionDenied, PermissionDeniedError } from "../error";
import { PERMISSION_HIERARCHY, type PermissionHierarchy } from "./hierarchy";


/**
 * Permission string format:
 * [resource_type]:[resource_id]:[scope]:[action]:[effect]
 * Example: project:mcdonalds:billing:write:allow
 */

/**
 * Parsed permission token
 */
export interface PermissionToken {
  resource_type: string;
  resource_id: string;
  scope: string;
  action: string;
  effect: "allow" | "deny";
}

/**
 * Options for permission check functions
 */
export interface PermissionOptions {
  /**
   * The behavior mode for the permission check
   * - 'boolean': Returns a boolean (default)
   * - 'throw': Throws a PermissionDeniedError if check fails
   * - 'silent': Returns a boolean, without logging or side effects
   */
  mode?: 'boolean' | 'throw' | 'silent';

  /**
   * Custom error message when mode is 'throw'
   */
  errorMessage?: string;

  /**
   * Match type for multiple permission checks
   * - 'any': Return true if any permission is allowed (default)
   * - 'all': Return true only if all permissions are allowed
   */
  match?: 'any' | 'all';

  /**
   * Context for the permission check, used for contextual permissions
   */
  context?: Record<string, unknown>;

  /**
   * Whether to log this permission check for audit purposes
   */
  audit?: boolean;
}

/**
 * Parses a permission string (e.g. "data:read", "!data:delete", "data:*", "*:read", "*")
 * into a PermissionToken.
 * @TODO More rigourous validation and error handling
 */
export const parsePermission = (permString: string): PermissionToken => {
  const parts = permString.split(':');
  
  if (parts.length !== 5) {
    throw new Error(`Invalid permission format: ${permString}. Expected format: resource_type:resource_id:scope:action:effect`);
  }
  
  const [resource_type, resource_id, scope, action, effect] = parts;
  
  if (effect !== 'allow' && effect !== 'deny') {
    throw new Error(`Invalid effect in permission: ${permString}. Expected 'allow' or 'deny'`);
  }
  
  return {
    resource_type,
    resource_id,
    scope,
    action,
    effect: effect as "allow" | "deny"
  };
};

/**
 * Check if a permission string contains wildcards
 */
export const hasWildcards = (permString: string): boolean => {
  return permString.includes('*');
};

/**
 * Check if a permission matches another permission
 * Supports wildcards (*) in each token
 */
export const permissionMatches = (
  permToCheck: PermissionToken,
  targetPerm: PermissionToken
): boolean => {
  // Check each token match (wildcard * matches anything)
  return (
    (permToCheck.resource_type === '*' || permToCheck.resource_type === targetPerm.resource_type) &&
    (permToCheck.resource_id === '*' || permToCheck.resource_id === targetPerm.resource_id) &&
    (permToCheck.scope === '*' || permToCheck.scope === targetPerm.scope) &&
    (permToCheck.action === '*' || permToCheck.action === targetPerm.action)
  );
};

/**
 * Cache for pre-compiled permissions
 */
export interface CompiledPermissions {
  allows: PermissionToken[];
  denies: PermissionToken[];
}

/**
 * Pre-compiles a list of permission strings for faster checks
 */
export const compilePermissions = (
  permissionList: string[]
): CompiledPermissions => {
  const allows: PermissionToken[] = [];
  const denies: PermissionToken[] = [];
  
  const expandedPermissions = expandPermissions(permissionList);
  for (const permString of expandedPermissions) {
    try {
      const perm = parsePermission(permString);
      if (perm.effect === 'deny') {
        denies.push(perm);
      } else {
        allows.push(perm);
      }
    } catch (error) {
      console.error(`Error compiling permission ${permString}: ${error}`);
    }
  }
  
  return { allows, denies };
};

/**
 * Checks if a permission is allowed based on a list of permission strings
 */
export const isPermissionAllowed = (
  permissionList: string[],
  requestedPermission: string
): boolean => {
  try {
    const requestedPerm = parsePermission(requestedPermission);
    
    // Group permissions by effect
    const { allows, denies } = compilePermissions(permissionList);
  
    // Denies take precedence over allows
    for (const denyPerm of denies) {
      if (permissionMatches(denyPerm, requestedPerm)) {
        return false;
      }
    }
    
    // Check if any allow permission matches
    for (const allowPerm of allows) {
      if (permissionMatches(allowPerm, requestedPerm)) {
        return true;
      }
    }
    
    // Default to deny
    return false;
  } catch (error) {
    console.error(`Error checking permission: ${error}`);
    return false;
  }
};

/**
 * Expands permissions using the permission hierarchy
 * 
 * @param permissionList Original list of permissions
 * @param hierarchy Permission hierarchy to use for expansion
 * @returns Expanded list of permissions
 * 
 * @TODO add limits the while expansion process to avoid infinite loops
 */
export function expandPermissions(
  permissionList: string[],
  hierarchy: PermissionHierarchy = PERMISSION_HIERARCHY
): string[] {
  const expanded = new Set<string>(permissionList);
  let changed = true;

  while (changed) {
    changed = false;
    
    for (const permString of Array.from(expanded)) {
      try {
        const perm = parsePermission(permString);
        
        // Skip deny permissions in expansion
        if (perm.effect === 'deny') continue;
        
        for (const [hierarchyPattern, impliedPerms] of Object.entries(hierarchy)) {
          const hierarchyPerm = parsePermission(hierarchyPattern);
          
          if (permissionMatches(hierarchyPerm, perm)) {
            for (const impliedPermString of impliedPerms) {
              // Replace wildcards with actual values when appropriate
              let resolvedPermString = impliedPermString;
              
              // Replace resource_type wildcard if needed
              if (impliedPermString.startsWith('*:') && perm.resource_type !== '*') {
                resolvedPermString = resolvedPermString.replace(/^\*/, perm.resource_type);
              }
              
              // Replace resource_id wildcard if needed
              const parts = resolvedPermString.split(':');
              if (parts[1] === '*' && perm.resource_id !== '*') {
                parts[1] = perm.resource_id;
                resolvedPermString = parts.join(':');
              }
              
              if (!expanded.has(resolvedPermString)) {
                expanded.add(resolvedPermString);
                changed = true;
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error expanding permission ${permString}: ${error}`);
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Core permission checking function
 */
export const checkPermission = (
  permissionList: string[],
  request: string | string[],
  options: PermissionOptions = {}
): boolean => {
  const {
    mode = 'boolean',
    errorMessage,
    match = 'any',
    audit = true
  } = options;
  
  // Handle single permission request
  if (typeof request === 'string') {
    const allowed = isPermissionAllowed(permissionList, request);
    
    if (mode === 'throw' && !allowed) {
      throw new PermissionDeniedError(
        errorMessage || `Permission denied: ${request}`,
        request
      );
    }
    
    return allowed;
  }
  
  // Handle multiple permission requests
  if (request.length === 0) {
    return true; // No permissions requested means no restrictions
  }
  
  let allowed: boolean;
  let deniedPermissions: string[] = [];
  
  if (match === 'all') {
    // Check if ALL permissions are allowed
    deniedPermissions = request.filter(
      permission => !isPermissionAllowed(permissionList, permission)
    );
    allowed = deniedPermissions.length === 0;
  } else {
    // Check if ANY permission is allowed
    const allowedPermissions = request.filter(
      permission => isPermissionAllowed(permissionList, permission)
    );
    allowed = allowedPermissions.length > 0;
    deniedPermissions = allowed ? [] : request;
  }
  
  if (mode === 'throw' && !allowed) {
    throw new PermissionDeniedError(
      errorMessage ||
      (match === 'all'
        ? `Permissions denied: ${deniedPermissions.join(', ')}`
        : `All permissions denied: ${request.join(', ')}`),
      deniedPermissions[0] || request[0]
    );
  }
  
  return allowed;
};

/**
 * Alias for checkPermission with 'boolean' mode (returns boolean)
 */
export const hasPermission = (
  permissionList: string[],
  request: string | string[],
  options: Omit<PermissionOptions, 'mode'> = {}
): boolean => {
  return checkPermission(permissionList, request, {
    ...options,
    mode: 'boolean'
  });
};

/**
 * Alias for checkPermission with 'throw' mode (throws error)
 */
export const withPermission = (
  permissionList: string[],
  request: string | string[],
  options: Omit<PermissionOptions, 'mode'> = {}
): void => {
  checkPermission(permissionList, request, {
    ...options,
    mode: 'throw'
  });
};


/**
 * Checks if a user can perform a specific action on a resource
 */
export const canDo = (
  permissionList: string[],
  resourceType: string,
  resourceId: string,
  scope: string,
  action: string,
  options: PermissionOptions = {}
): boolean => {
  const permissionString = `${resourceType}:${resourceId}:${scope}:${action}:allow`;
  return checkPermission(permissionList, permissionString, {
    ...options,
    mode: options.mode || 'silent'
  });
};

/**
 * Creates a permission checker with context for a specific resource
 */
export function createResourcePermissionChecker(
  permissionList: string[],
  resourceType: string,
  resourceId: string
) {
  return {
    canDo: (
      scope: string,
      action: string,
      options: PermissionOptions = {}
    ): boolean => {
      return canDo(permissionList, resourceType, resourceId, scope, action, options);
    },
    
    canRead: (scope: string, options: PermissionOptions = {}): boolean => {
      return canDo(permissionList, resourceType, resourceId, scope, 'read', options);
    },
    
    canWrite: (scope: string, options: PermissionOptions = {}): boolean => {
      return canDo(permissionList, resourceType, resourceId, scope, 'write', options);
    },
    
    canCreate: (scope: string, options: PermissionOptions = {}): boolean => {
      return canDo(permissionList, resourceType, resourceId, scope, 'create', options);
    },
    
    canUpdate: (scope: string, options: PermissionOptions = {}): boolean => {
      return canDo(permissionList, resourceType, resourceId, scope, 'update', options);
    },
    
    canDelete: (scope: string, options: PermissionOptions = {}): boolean => {
      return canDo(permissionList, resourceType, resourceId, scope, 'delete', options);
    },
    
    canAdmin: (scope: string, options: PermissionOptions = {}): boolean => {
      return canDo(permissionList, resourceType, resourceId, scope, 'admin', options);
    }
  };
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
 * Creates a permission checker for a specific workspace
 */
export function createWorkspacePermissionChecker(
  permissionList: string[],
  workspaceId: string
) {
  return createResourcePermissionChecker(permissionList, 'workspace', workspaceId);
}

/**
 * Creates a permission checker for a specific project
 */
export function createProjectPermissionChecker(
  permissionList: string[],
  projectId: string
) {
  return createResourcePermissionChecker(permissionList, 'project', projectId);
}

/**
 * Utility function to get user permissions from multiple sources
 * Combines role permissions and exceptions while respecting priority
 */
export async function getUserEffectivePermissions(
  userId: string,
  fetchUserRoles: (userId: string) => Promise<string[]>,
  fetchRolePermissions: (roleIds: string[]) => Promise<string[]>,
  fetchUserExceptions: (userId: string) => Promise<string[]>
): Promise<string[]> {
  // 1. Get all user's roles
  const roleIds = await fetchUserRoles(userId);
  
  // 2. Get all permissions from those roles
  const rolePermissions = await fetchRolePermissions(roleIds);
  
  // 3. Get user-specific exceptions
  const exceptions = await fetchUserExceptions(userId);
  
  // 4. Combine them with exceptions taking precedence
  return [...rolePermissions, ...exceptions];
}

/**
 * Checks if a permission is allowed, taking guest status into account
 */
export const isPermissionAllowedForUser = (
  permissionList: string[],
  requestedPermission: string,
  isGuest: boolean,
  guestAssignablePermissions: string[] = []
): boolean => {
  // First, check if the permission is allowed at all
  const isAllowed = isPermissionAllowed(permissionList, requestedPermission);
  
  // If not allowed or not a guest, return the standard result
  if (!isAllowed || !isGuest) {
    return isAllowed;
  }
  
  // For guests, we need to check if this permission is guest-assignable
  const requestedComp = parsePermission(requestedPermission);
  
  // Check if any guest-assignable permission matches the requested one
  for (const guestPerm of guestAssignablePermissions) {
    const guestComp = parsePermission(guestPerm);
    if (permissionMatches(guestComp, requestedComp)) {
      return true;
    }
  }
  
  // If we get here, the permission is not guest-assignable
  return false;
}

/**
 * Checks if a role can be assigned to guests based on its permissions
 */
export const isRoleGuestAssignable = (
  rolePermissions: string[],
  guestAssignablePermissions: string[]
): boolean => {  
  // Make sure all role permissions are guest-assignable
  for (const rolePerm of rolePermissions) {
    if (!checkPermission(guestAssignablePermissions, rolePerm)) {
      return false;
    }
  }
  
  return true;
}