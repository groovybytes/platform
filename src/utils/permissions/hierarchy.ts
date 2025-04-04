// @filename: utils/permissions/hierarchy.ts
/**
 * Permission hierarchy definition
 * Maps permission patterns to implied permissions
 */
export interface PermissionHierarchy {
  [key: string]: string[];
}

/**
 * Enhanced permission hierarchy for the permission expansion logic
 * specific to the GroovyBytes Business Insights platform
 */
export const PERMISSION_HIERARCHY: PermissionHierarchy = {
  // Business Insights specific permissions
  'project:*:analytics:create:allow': [
    'project:*:analytics:execute:allow'
  ],

  'project:*:analytics:update:allow': [
    'project:*:analytics:execute:allow'
  ],

  'project:*:jobs:create:allow': [
    'project:*:jobs:execute:allow'
  ],

  // Guest permissions are limited
  'workspace:*:*:invite:allow': [
    'workspace:*:members:invite:allow'
  ],

  'project:*:*:invite:allow': [
    'project:*:members:invite:allow'
  ],

  // Workspace scope hierarchies
  'workspace:*:settings:admin:allow': [
    'workspace:*:settings:read:allow',
    'workspace:*:settings:update:allow'
  ],

  'workspace:*:members:admin:allow': [
    'workspace:*:members:read:allow',
    'workspace:*:members:invite:allow',
    'workspace:*:members:update:allow',
    'workspace:*:members:delete:allow'
  ],

  'workspace:*:projects:admin:allow': [
    'workspace:*:projects:read:allow',
    'workspace:*:projects:create:allow',
    'workspace:*:projects:update:allow',
    'workspace:*:projects:delete:allow',

    // Cross-resource permissions
    'project:*:settings:read:allow',
    'project:*:members:read:allow'
  ],

  'workspace:*:teams:admin:allow': [
    'workspace:*:teams:read:allow',
    'workspace:*:teams:create:allow',
    'workspace:*:teams:update:allow',
    'workspace:*:teams:delete:allow'
  ],

  'workspace:*:billing:admin:allow': [
    'workspace:*:billing:read:allow',
    'workspace:*:billing:update:allow'
  ],

  // Project scope hierarchies
  'project:*:settings:admin:allow': [
    'project:*:settings:read:allow',
    'project:*:settings:update:allow'
  ],

  'project:*:devices:admin:allow': [
    'project:*:devices:read:allow',
    'project:*:devices:create:allow',
    'project:*:devices:update:allow',
    'project:*:devices:delete:allow'
  ],

  'project:*:assets:admin:allow': [
    'project:*:assets:read:allow',
    'project:*:assets:create:allow',
    'project:*:assets:update:allow',
    'project:*:assets:delete:allow'
  ],

  'project:*:analytics:admin:allow': [
    'project:*:analytics:read:allow',
    'project:*:analytics:create:allow',
    'project:*:analytics:update:allow',
    'project:*:analytics:delete:allow',
    'project:*:analytics:execute:allow'
  ],

  'project:*:jobs:admin:allow': [
    'project:*:jobs:read:allow',
    'project:*:jobs:create:allow',
    'project:*:jobs:update:allow',
    'project:*:jobs:delete:allow',
    'project:*:jobs:execute:allow'
  ],

  'project:*:members:admin:allow': [
    'project:*:members:read:allow',
    'project:*:members:invite:allow',
    'project:*:members:update:allow',
    'project:*:members:delete:allow'
  ],

  // Resource type level hierarchies
  'workspace:*:*:admin:allow': [
    'workspace:*:*:read:allow',
    'workspace:*:*:create:allow',
    'workspace:*:*:update:allow',
    'workspace:*:*:delete:allow',

    // Cross-resource permissions
    'project:*:*:read:allow'
  ],

  'project:*:*:admin:allow': [
    'project:*:*:read:allow',
    'project:*:*:create:allow',
    'project:*:*:update:allow',
    'project:*:*:delete:allow'
  ],

  'system:*:*:admin:allow': [
    'system:*:*:read:allow',
    'system:*:*:create:allow',
    'system:*:*:update:allow',
    'system:*:*:delete:allow'
  ],

  // Action hierarchies  
  '*:*:*:*:allow': [
    '*:*:*:read:allow',
    '*:*:*:create:allow',
    '*:*:*:update:allow',
    '*:*:*:delete:allow',
    '*:*:*:admin:allow',
    '*:*:*:execute:allow',
    '*:*:*:invite:allow'
  ],

  '*:*:*:write:allow': [
    '*:*:*:create:allow',
    '*:*:*:update:allow'
  ],

  '*:*:*:update:allow': [
    '*:*:*:create:allow'
  ],
};

/**
 * Guest-assignable permissions - permissions that can be granted to guest users
 * This is important for security as it limits what permissions can be given to external users
 */
export const guestAssignablePermissions: string[] = [
  // Workspace guest permissions
  'workspace:*:*:read:allow',

  // Project guest permissions
  'project:*:*:read:allow',
  'project:*:analytics:read:allow',
  'project:*:devices:read:allow',
  'project:*:assets:read:allow',
  'project:*:jobs:read:allow'
];

/**
 * Checks if a permission is assignable to guests
 */
export function isPermissionGuestAssignable(permission: string): boolean {
  // Use the existing permission matching logic to check if permission is in guestAssignablePermissions
  return guestAssignablePermissions.some(allowedPerm => {
    const allowedParts = allowedPerm.split(':');
    const requestedParts = permission.split(':');

    // Make sure all parts match or the allowed part is a wildcard
    for (let i = 0; i < allowedParts.length; i++) {
      if (allowedParts[i] !== '*' && allowedParts[i] !== requestedParts[i]) {
        return false;
      }
    }

    return true;
  });
}