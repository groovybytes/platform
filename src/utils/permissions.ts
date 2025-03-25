import { permissionDenied, PermissionDeniedError } from "./error";

/**
 * A token representation of a permission.
 */
export interface PermissionToken {
  scope: string;   // e.g. "data", "*" for any
  action: string;  // e.g. "read", "*" for any
  isExclusion: boolean;
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
   * Whether to expand permissions using the permission hierarchy
   * - true: Use the permission hierarchy to infer implied permissions (default)
   * - false: Use only the explicitly granted permissions
   */
  expandHierarchy?: boolean;
}

/**
 * Parses a permission string (e.g. "data:read", "!data:delete", "data:*", "*:read", "*")
 * into a PermissionToken.
 */
export const parsePermission = (perm: string): PermissionToken => {
  // Trim whitespace
  const trimmed = perm.trim();
  // Check if it's an exclusion (prefix "!")
  const isExclusion = trimmed.startsWith("!");
  const core = isExclusion ? trimmed.slice(1) : trimmed;
  // Split by colon
  const parts = core.split(":");
  // If no colon, treat as "*" wildcard for both scope and action
  if (parts.length === 1) {
    const tokenValue = parts[0] || "*";
    return { scope: tokenValue, action: tokenValue, isExclusion };
  }
  const [scopeRaw, actionRaw] = parts;
  // If any part is missing, default to "*"
  const scope = scopeRaw || "*";
  const action = actionRaw || "*";
  return { scope, action, isExclusion };
};

/**
 * Checks whether a given token (representing an allowed or excluded permission)
 * matches a requested permission token.
 *
 * A token with wildcards ("*") matches any value in that part.
 */
export const matchesToken = (
  token: PermissionToken,
  req: PermissionToken
): boolean => {
  // Check if token.scope matches requested scope (wildcard "*" matches any)
  const scopeMatches =
    token.scope === "*" || token.scope === req.scope;
  // Check if token.action matches requested action (wildcard "*" matches any)
  const actionMatches =
    token.action === "*" || token.action === req.action;
  return scopeMatches && actionMatches;
};

/**
 * Given an array of raw permission strings (the definition for a role)
 * and a requested permission string, determine if the permission is allowed.
 *
 * Exclusions (prefixed with "!") override inclusions.
 */
export const isPermissionAllowed = (
  permissionList: string[],
  requestedPermission: string
): boolean => {
  // Parse the requested permission into a token.
  const reqToken = parsePermission(requestedPermission);

  // Parse all tokens from the permission list.
  const tokens: PermissionToken[] = permissionList.map(parsePermission);

  // First, if any exclusion matches the requested permission, deny.
  const isExcluded = tokens.some(
    (token) => token.isExclusion && matchesToken(token, reqToken)
  );
  if (isExcluded) return false;

  // Then, if any inclusion token matches, allow.
  const isAllowed = tokens.some(
    (token) => !token.isExclusion && matchesToken(token, reqToken)
  );
  return isAllowed;
};

/**
 * Pre-compiles a list of raw permission strings into a structured object for faster checks.
 */
export const compilePermissions = (
  permissionList: string[]
): { inclusions: PermissionToken[]; exclusions: PermissionToken[] } => {
  const tokens = permissionList.map(parsePermission);
  const inclusions = tokens.filter((token) => !token.isExclusion);
  const exclusions = tokens.filter((token) => token.isExclusion);
  return { inclusions, exclusions };
};

/**
 * A permission check function using pre-compiled tokens.
 */
export const isPermissionAllowedCompiled = (
  compiled: { inclusions: PermissionToken[]; exclusions: PermissionToken[] },
  requestedPermission: string
): boolean => {
  const reqToken = parsePermission(requestedPermission);
  // Exclusions override inclusions.
  if (compiled.exclusions.some((token) => matchesToken(token, reqToken))) {
    return false;
  }
  return compiled.inclusions.some((token) => matchesToken(token, reqToken));
};

/**
 * Permission hierarchy definition
 * Maps permission patterns to implied permissions
 */
export interface PermissionHierarchy {
  [key: string]: string[];
}

/**
 * Default permission hierarchy
 * Defines common relationships between permissions
 */
export const defaultPermissionHierarchy: PermissionHierarchy = {
  // Admin permissions imply all other actions in that scope
  '*:admin': ['*:read', '*:write', '*:create', '*:update', '*:delete'],

  // Write permission implies update and create
  '*:write': ['*:update', '*:create'],

  // Common compound permissions
  'billing:admin': ['billing:read', 'billing:write', 'billing:create', 'billing:update', 'billing:delete', 'payment:*'],
  'user:admin': ['user:read', 'user:write', 'user:create', 'user:update', 'user:delete', 'profile:*'],
  'device:admin': ['device:read', 'device:write', 'device:create', 'device:update', 'device:delete', 'device:configure']
};

/**
 * Expands a permission list using the permission hierarchy
 * 
 * @param permissionList Original list of permissions
 * @param hierarchy Permission hierarchy to use for expansion
 * @returns Expanded list of permissions
 */
export function expandPermissions(
  permissionList: string[],
  hierarchy: PermissionHierarchy = defaultPermissionHierarchy
): string[] {
  const expanded = new Set<string>(permissionList);
  let changed = true;

  // Keep expanding until no new permissions are added
  while (changed) {
    changed = false;

    // Check each permission string against each hierarchy pattern
    for (const permission of Array.from(expanded)) {
      for (const [pattern, implied] of Object.entries(hierarchy)) {
        // Check if the permission matches the pattern (support wildcards)
        const patternToken = parsePermission(pattern);
        const permToken = parsePermission(permission);

        if (matchesToken(patternToken, permToken)) {
          // For each implied permission, handle wildcards
          for (const impliedPerm of implied) {
            // Replace wildcards with actual scope/action
            let resolvedPerm = impliedPerm;

            if (impliedPerm.includes('*')) {
              const impliedToken = parsePermission(impliedPerm);

              // Replace scope wildcard with actual scope
              if (impliedToken.scope === '*' && permToken.scope !== '*') {
                resolvedPerm = resolvedPerm.replace(/^\*/, permToken.scope);
              }

              // Replace action wildcard with actual action
              if (impliedToken.action === '*' && permToken.action !== '*') {
                resolvedPerm = resolvedPerm.replace(/:\*$/, `:${permToken.action}`);
              }
            }

            // Add the implied permission if it's new
            if (!expanded.has(resolvedPerm)) {
              expanded.add(resolvedPerm);
              changed = true;
            }
          }
        }
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Core permission checking function
 * 
 * @param permissionList Array of permission strings that the user has
 * @param request Permission string(s) being requested
 * @param options Configuration options for the permission check
 * @returns Boolean indicating whether permission is allowed (in 'boolean' or 'silent' mode)
 * @throws PermissionDeniedError if permission is denied (in 'throw' mode)
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
    expandHierarchy = true
  } = options;

  // Expand permissions if hierarchy expansion is enabled
  const effectivePermissions = expandHierarchy
    ? expandPermissions(permissionList)
    : permissionList;

  // Handle single permission request
  if (typeof request === 'string') {
    const allowed = isPermissionAllowed(effectivePermissions, request);

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
      permission => !isPermissionAllowed(effectivePermissions, permission)
    );
    allowed = deniedPermissions.length === 0;
  } else {
    // Check if ANY permission is allowed
    const allowedPermissions = request.filter(
      permission => isPermissionAllowed(effectivePermissions, permission)
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
 * 
 * @param permissionList Array of permission strings that the user has
 * @param scope The resource scope (e.g., "data", "user", "billing")
 * @param action The action to check (e.g., "read", "write", "delete")
 * @param options Configuration options for the permission check
 * @returns Boolean indicating if the permission is allowed
 */
export const canDo = (
  permissionList: string[],
  scope: string,
  action: string,
  options: PermissionOptions = {}
): boolean => {
  const permissionString = `${scope}:${action}`;
  return checkPermission(permissionList, permissionString, {
    ...options,
    mode: options.mode || 'silent' // Default to silent for semantic methods
  });
};

// Common action convenience methods
export const canRead = (
  permissionList: string[],
  scope: string,
  options: PermissionOptions = {}
): boolean => {
  return canDo(permissionList, scope, 'read', options);
};

export const canWrite = (
  permissionList: string[],
  scope: string,
  options: PermissionOptions = {}
): boolean => {
  return canDo(permissionList, scope, 'write', options);
};

export const canDelete = (
  permissionList: string[],
  scope: string,
  options: PermissionOptions = {}
): boolean => {
  return canDo(permissionList, scope, 'delete', options);
};

export const canCreate = (
  permissionList: string[],
  scope: string,
  options: PermissionOptions = {}
): boolean => {
  return canDo(permissionList, scope, 'create', options);
};

export const canUpdate = (
  permissionList: string[],
  scope: string,
  options: PermissionOptions = {}
): boolean => {
  return canDo(permissionList, scope, 'update', options);
};

export const canAdmin = (
  permissionList: string[],
  options: PermissionOptions = {}
): boolean => {
  return checkPermission(permissionList, 'admin:*', {
    ...options,
    mode: options.mode || 'silent'
  });
};

/**
 * Utility to create a permission checker function bound to specific permissions
 * @param permissionList List of permissions to check against
 * @returns Functions for checking permissions with the bound permission list
 */
export function createPermissionChecker(permissionList: string[]) {
  return {
    /**
     * Check a specific permission against the bound permission list
     */
    check: (
      request: string | string[],
      options: PermissionOptions = {}
    ): boolean => {
      return checkPermission(permissionList, request, options);
    },

    /**
     * Check if can perform a specific action on a resource
     */
    canDo: (
      scope: string,
      action: string,
      options: PermissionOptions = {}
    ): boolean => {
      return canDo(permissionList, scope, action, options);
    },

    // Convenience methods
    canRead: (scope: string, options: PermissionOptions = {}): boolean => {
      return canRead(permissionList, scope, options);
    },

    canWrite: (scope: string, options: PermissionOptions = {}): boolean => {
      return canWrite(permissionList, scope, options);
    },

    canDelete: (scope: string, options: PermissionOptions = {}): boolean => {
      return canDelete(permissionList, scope, options);
    },

    canCreate: (scope: string, options: PermissionOptions = {}): boolean => {
      return canCreate(permissionList, scope, options);
    },

    canUpdate: (scope: string, options: PermissionOptions = {}): boolean => {
      return canUpdate(permissionList, scope, options);
    },

    canAdmin: (options: PermissionOptions = {}): boolean => {
      return canAdmin(permissionList, options);
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
