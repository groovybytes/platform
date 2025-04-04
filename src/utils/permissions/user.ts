// @filename: utils/permissions/user.ts
import type { AssignedRole, RoleDefinition, RoleException } from '~/types/operational';
import { queryItems } from '~/utils/cosmos/utils';
import { compilePermissions, expandPermissions } from './permissions';

/**
 * Get all roles assigned to a user for a specific resource
 * @param userId User ID
 * @param resourceType Resource type (workspace or project)
 * @param resourceId Specific resource ID
 * @returns Promise resolving to assigned roles for the user
 */
export async function getUserRolesForResource(
  userId: string,
  resourceType: 'workspace' | 'project',
  resourceId: string
): Promise<AssignedRole[]> {
  return queryItems<AssignedRole>(
    'membership',
    'SELECT * FROM c WHERE c.type = "assigned-roles" AND c.userId = @userId AND c.resourceType = @resourceType AND c.resourceId = @resourceId',
    [
      { name: '@userId', value: userId },
      { name: '@resourceType', value: resourceType },
      { name: '@resourceId', value: resourceId }
    ]
  );
}

/**
 * Get role definitions by ID
 * @param roleIds Array of role IDs to retrieve
 * @returns Promise resolving to role definitions
 */
export async function getRoleDefinitionsById(roleIds: string[]): Promise<RoleDefinition[]> {
  if (roleIds.length === 0) {
    return [];
  }
  
  return queryItems<RoleDefinition>(
    'membership',
    'SELECT * FROM c WHERE c.type = "role" AND ARRAY_CONTAINS(@roleIds, c.id)',
    [{ name: '@roleIds', value: roleIds }]
  );
}

/**
 * Get permission exceptions for a user
 * @param userId User ID
 * @returns Promise resolving to role exceptions
 */
export async function getUserExceptions(userId: string): Promise<RoleException[]> {
  return queryItems<RoleException>(
    'membership',
    'SELECT * FROM c WHERE c.type = "role-exceptions" AND c.resourceType = "user" AND c.resourceId = @userId',
    [{ name: '@userId', value: userId }]
  );
}

/**
 * Get all permissions from a user's assigned roles
 * @param roleIds Array of role IDs
 * @returns Promise resolving to array of permission strings
 */
export async function getPermissionsFromRoles(roleIds: string[]): Promise<string[]> {
  const roles = await getRoleDefinitionsById(roleIds);
  
  // Extract all permissions from the roles
  const permissions: string[] = [];
  roles.forEach(role => {
    if (role.permissions && role.permissions.length > 0) {
      permissions.push(...role.permissions);
    }
  });
  
  return permissions;
}

/**
 * Get effective permissions for a user, combining roles and exceptions
 * @param userId User ID
 * @param resourceType Resource type
 * @param resourceId Resource ID
 * @returns Promise resolving to array of effective permission strings
 */
export async function getUserEffectivePermissions(
  userId: string,
  resourceType: 'workspace' | 'project',
  resourceId: string
): Promise<string[]> {
  // 1. Get assigned roles for this user+resource
  const assignedRoles = await getUserRolesForResource(userId, resourceType, resourceId);
  
  // 2. Extract role IDs
  const roleIds = assignedRoles.flatMap(ar => ar.roles || []);
  
  // 3. Get permissions from those roles
  const rolePermissions = await getPermissionsFromRoles(roleIds);
  
  // 4. Get exceptions for this user
  const exceptions = await getUserExceptions(userId);
  const exceptionPermissions = exceptions.flatMap(ex => ex.permissions || []);
  
  // 5. Combine and expand permissions
  const allPermissions = [...rolePermissions, ...exceptionPermissions];
  return expandPermissions(allPermissions);
}

/**
 * Check if a user has specific permission for a resource
 * @param userId User ID
 * @param resourceType Resource type
 * @param resourceId Resource ID
 * @param permission Permission to check
 * @returns Promise resolving to boolean indicating if permission is granted
 */
export async function checkUserResourcePermission(
  userId: string,
  resourceType: 'workspace' | 'project',
  resourceId: string,
  permission: string
): Promise<boolean> {
  // Get effective permissions
  const effectivePermissions = await getUserEffectivePermissions(userId, resourceType, resourceId);
  
  // Compile permissions for efficient checking
  const compiled = compilePermissions(effectivePermissions);
  
  // Parse permission to check
  const parts = permission.split(':');
  
  // If permission doesn't have proper format, deny
  if (parts.length !== 5) {
    return false;
  }
  
  // Create permission token to check
  const [permResourceType, permResourceId, permScope, permAction, permEffect] = parts;
  
  // First check denies (they take precedence)
  for (const denyPerm of compiled.denies) {
    if (
      (denyPerm.resource_type === '*' || denyPerm.resource_type === permResourceType) &&
      (denyPerm.resource_id === '*' || denyPerm.resource_id === permResourceId) &&
      (denyPerm.scope === '*' || denyPerm.scope === permScope) &&
      (denyPerm.action === '*' || denyPerm.action === permAction)
    ) {
      return false;
    }
  }
  
  // Then check allows
  for (const allowPerm of compiled.allows) {
    if (
      (allowPerm.resource_type === '*' || allowPerm.resource_type === permResourceType) &&
      (allowPerm.resource_id === '*' || allowPerm.resource_id === permResourceId) &&
      (allowPerm.scope === '*' || allowPerm.scope === permScope) &&
      (allowPerm.action === '*' || allowPerm.action === permAction)
    ) {
      return true;
    }
  }
  
  // Default to deny
  return false;
}

/**
 * Create a permission checker for a specific user and resource
 * @param userId User ID
 * @param resourceType Resource type
 * @param resourceId Resource ID
 * @returns Object with permission checking methods
 */
export async function createUserResourcePermissionChecker(
  userId: string,
  resourceType: 'workspace' | 'project',
  resourceId: string
) {
  // Get and cache effective permissions
  const permissions = await getUserEffectivePermissions(userId, resourceType, resourceId);
  
  return {
    /**
     * Check if the user can perform the specified action on the specified scope
     * @param scope Permission scope
     * @param action Permission action
     * @returns Boolean indicating if permission is granted
     */
    can: (scope: string, action: string): boolean => {
      const permToCheck = `${resourceType}:${resourceId}:${scope}:${action}:allow`;
      return compilePermissions(permissions).allows.some(allowPerm => 
        (allowPerm.resource_type === '*' || allowPerm.resource_type === resourceType) &&
        (allowPerm.resource_id === '*' || allowPerm.resource_id === resourceId) &&
        (allowPerm.scope === '*' || allowPerm.scope === scope) &&
        (allowPerm.action === '*' || allowPerm.action === action)
      );
    },
    
    /**
     * Get all effective permissions for the user
     * @returns Array of permission strings
     */
    getPermissions: () => permissions,
    
    /**
     * Check if the user can read the specified scope
     * @param scope Permission scope
     * @returns Boolean indicating if permission is granted
     */
    canRead: (scope: string): boolean => {
      return permissions.some(p => {
        const parts = p.split(':');
        return (parts[0] === '*' || parts[0] === resourceType) &&
               (parts[1] === '*' || parts[1] === resourceId) &&
               (parts[2] === '*' || parts[2] === scope) &&
               (parts[3] === '*' || parts[3] === 'read') &&
               parts[4] === 'allow';
      });
    },
    
    /**
     * Check if the user can create in the specified scope
     * @param scope Permission scope
     * @returns Boolean indicating if permission is granted
     */
    canCreate: (scope: string): boolean => {
      return permissions.some(p => {
        const parts = p.split(':');
        return (parts[0] === '*' || parts[0] === resourceType) &&
               (parts[1] === '*' || parts[1] === resourceId) &&
               (parts[2] === '*' || parts[2] === scope) &&
               (parts[3] === '*' || parts[3] === 'create') &&
               parts[4] === 'allow';
      });
    },
    
    /**
     * Check if the user can update in the specified scope
     * @param scope Permission scope
     * @returns Boolean indicating if permission is granted
     */
    canUpdate: (scope: string): boolean => {
      return permissions.some(p => {
        const parts = p.split(':');
        return (parts[0] === '*' || parts[0] === resourceType) &&
               (parts[1] === '*' || parts[1] === resourceId) &&
               (parts[2] === '*' || parts[2] === scope) &&
               (parts[3] === '*' || parts[3] === 'update') &&
               parts[4] === 'allow';
      });
    },
    
    /**
     * Check if the user can delete in the specified scope
     * @param scope Permission scope
     * @returns Boolean indicating if permission is granted
     */
    canDelete: (scope: string): boolean => {
      return permissions.some(p => {
        const parts = p.split(':');
        return (parts[0] === '*' || parts[0] === resourceType) &&
               (parts[1] === '*' || parts[1] === resourceId) &&
               (parts[2] === '*' || parts[2] === scope) &&
               (parts[3] === '*' || parts[3] === 'delete') &&
               parts[4] === 'allow';
      });
    },
    
    /**
     * Check if the user has admin rights in the specified scope
     * @param scope Permission scope
     * @returns Boolean indicating if permission is granted
     */
    isAdmin: (scope: string): boolean => {
      return permissions.some(p => {
        const parts = p.split(':');
        return (parts[0] === '*' || parts[0] === resourceType) &&
               (parts[1] === '*' || parts[1] === resourceId) &&
               (parts[2] === '*' || parts[2] === scope) &&
               (parts[3] === '*' || parts[3] === 'admin') &&
               parts[4] === 'allow';
      });
    }
  };
}