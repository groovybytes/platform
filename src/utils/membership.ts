import type { AssignedRole, Membership, RoleDefinition, RoleException } from '~/types/operational.ts';
import type { PatchOperation } from '@azure/cosmos';

import { isPermissionAllowed } from './permissions';
import { nanoid } from 'nanoid';
import { 
  queryItems, 
  readItem, 
  createItem,  
  patchItem, 
  deleteItem 
} from './cosmos/utils';


// Constants for database and containers
export const OPERATIONAL_DATABASE = 'operational';
export const MEMBERSHIP_CONTAINER = 'membership';
export const USERS_CONTAINER = 'users';
export const WORKSPACES_CONTAINER = 'workspaces';

/**
 * Get a user's membership for a specific resource
 * @param userId The user's ID
 * @param resourceType Type of resource (workspace or project)
 * @param resourceId ID of the resource
 */
export async function getMembership(
  userId: string,
  resourceType: "workspace" | "project",
  resourceId: string
): Promise<Membership | null> {
  try {
    // For hierarchical partition keys, we need to query by all relevant fields
    const query = `
      SELECT * FROM c 
      WHERE c.userId = @userId 
      AND c.resourceType = @resourceType 
      AND c.resourceId = @resourceId
    `;
    
    const parameters = [
      { name: "@userId", value: userId },
      { name: "@resourceType", value: resourceType },
      { name: "@resourceId", value: resourceId }
    ];
    
    const results = await queryItems<Membership>(
      MEMBERSHIP_CONTAINER, 
      query, 
      parameters
    );
    
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error(`Error getting membership: ${error}`);
    return null;
  }
}

/**
 * Get all memberships for a user
 * @param userId The user's ID
 * @param status Optional status filter
 */
export async function getUserMemberships(
  userId: string,
  status?: "active" | "inactive" | "pending" | "canceled" | "suspended"
): Promise<Membership[]> {
  try {
    let query = `
      SELECT * FROM c 
      WHERE c.userId = @userId
    `;
    
    const parameters = [
      { name: "@userId", value: userId }
    ];
    
    if (status) {
      query += " AND c.status = @status";
      parameters.push({ name: "@status", value: status });
    }
    
    return await queryItems<Membership>(
      MEMBERSHIP_CONTAINER, 
      query, 
      parameters
    );
  } catch (error) {
    console.error(`Error getting user memberships: ${error}`);
    return [];
  }
}

/**
 * Get all members of a resource
 * @param resourceType Type of resource (workspace or project)
 * @param resourceId ID of the resource
 * @param membershipType Optional filter for member type
 * @param status Optional filter for membership status
 */
export async function getResourceMembers(
  resourceType: "workspace" | "project",
  resourceId: string,
  membershipType?: "member" | "guest",
  status: "active" | "inactive" | "pending" | "canceled" | "suspended" = "active"
): Promise<Membership[]> {
  try {
    let query = `
      SELECT * FROM c 
      WHERE c.resourceType = @resourceType 
      AND c.resourceId = @resourceId 
      AND c.status = @status
    `;
    
    const parameters = [
      { name: "@resourceType", value: resourceType },
      { name: "@resourceId", value: resourceId },
      { name: "@status", value: status }
    ];
    
    if (membershipType) {
      query += " AND c.membershipType = @membershipType";
      parameters.push({ name: "@membershipType", value: membershipType });
    }
    
    return await queryItems<Membership>(
      MEMBERSHIP_CONTAINER, 
      query, 
      parameters
    );
  } catch (error) {
    console.error(`Error getting resource members: ${error}`);
    return [];
  }
}

/**
 * Create a new membership
 * @param membership Membership data without ID
 * @param creatorId ID of the user creating the membership
 */
export async function createMembership(
  membership: Omit<Membership, "id" | "invitedAt" | "invitedBy">,
  creatorId: string
): Promise<Membership> {
  const newMembership: Membership = {
    ...membership,
    id: nanoid(),
    invitedAt: new Date().toISOString(),
    invitedBy: creatorId
  };
  
  return await createItem<Membership>(
    MEMBERSHIP_CONTAINER,
    newMembership
  );
}

/**
 * Update a membership status
 * @param membershipId ID of the membership to update
 * @param status New status
 * @param lastActiveAt Optional timestamp of last activity
 */
export async function updateMembershipStatus(
  membershipId: string,
  status: "active" | "inactive" | "pending" | "canceled" | "suspended",
  lastActiveAt?: string
): Promise<Membership> {
  const operations: PatchOperation[] = [
    { op: "replace", path: "/status", value: status }
  ];
  
  if (status === "active" && !lastActiveAt) {
    operations.push({
      op: "replace",
      path: "/lastActiveAt",
      value: new Date().toISOString()
    });
  } else if (lastActiveAt) {
    operations.push({
      op: "replace",
      path: "/lastActiveAt",
      value: lastActiveAt
    });
  }
  
  return await patchItem<Membership>(
    MEMBERSHIP_CONTAINER,
    membershipId,
    operations,
    membershipId // partition key is the membership ID
  );
}

/**
 * Check if a user is a member of a resource
 * @param userId The user's ID
 * @param resourceType Type of resource
 * @param resourceId ID of the resource
 * @param requireActive Whether to only count active memberships
 */
export async function isUserMember(
  userId: string,
  resourceType: "workspace" | "project",
  resourceId: string,
  requireActive = true
): Promise<boolean> {
  const membership = await getMembership(userId, resourceType, resourceId);
  
  if (!membership) {
    return false;
  }
  
  if (requireActive && membership.status !== "active") {
    return false;
  }
  
  return membership.membershipType === "member";
}

/**
 * Check if a user is a guest of a resource
 * @param userId The user's ID
 * @param resourceType Type of resource
 * @param resourceId ID of the resource
 * @param requireActive Whether to only count active memberships
 */
export async function isUserGuest(
  userId: string,
  resourceType: "workspace" | "project",
  resourceId: string,
  requireActive = true
): Promise<boolean> {
  const membership = await getMembership(userId, resourceType, resourceId);
  
  if (!membership) {
    return false;
  }
  
  if (requireActive && membership.status !== "active") {
    return false;
  }
  
  return membership.membershipType === "guest";
}

/**
 * Get all role definitions for a resource
 * @param resourceType Type of resource
 * @param resourceId ID of the resource
 */
export async function getResourceRoles(
  resourceType: "workspace" | "project" | "system",
  resourceId: string
): Promise<RoleDefinition[]> {
  try {
    const query = `
      SELECT * FROM c 
      WHERE c.type = 'role'
      AND c.resourceType = @resourceType 
      AND c.resourceId = @resourceId
    `;
    
    const parameters = [
      { name: "@resourceType", value: resourceType },
      { name: "@resourceId", value: resourceId }
    ];
    
    return await queryItems<RoleDefinition>(
      MEMBERSHIP_CONTAINER, 
      query, 
      parameters
    );
  } catch (error) {
    console.error(`Error getting resource roles: ${error}`);
    return [];
  }
}

/**
 * Get a specific role definition by ID
 * @param roleId ID of the role
 */
export async function getRoleDefinition(roleId: string): Promise<RoleDefinition | null> {
  try {
    return await readItem<RoleDefinition>(
      MEMBERSHIP_CONTAINER,
      roleId,
      roleId // partition key is the role ID
    );
  } catch (error) {
    console.error(`Error getting role definition: ${error}`);
    return null;
  }
}

/**
 * Create a new role definition
 * @param role Role data without ID
 * @param creatorId ID of the user creating the role
 */
export async function createRoleDefinition(
  role: Omit<RoleDefinition, "id" | "type" | "created_at" | "updated_at" | "created_by">,
  creatorId: string
): Promise<RoleDefinition> {
  const timestamp = new Date().toISOString();
  
  const newRole: RoleDefinition = {
    ...role,
    id: nanoid(),
    type: "role",
    created_at: timestamp,
    updated_at: timestamp,
    created_by: creatorId
  };
  
  return await createItem<RoleDefinition>(
    MEMBERSHIP_CONTAINER,
    newRole
  );
}

/**
 * Update a role definition
 * @param roleId ID of the role to update
 * @param updates Fields to update
 */
export async function updateRoleDefinition(
  roleId: string,
  updates: Partial<Pick<RoleDefinition, "name" | "description" | "permissions">>
): Promise<RoleDefinition> {
  const operations: any[] = [
    { op: "replace", path: "/updated_at", value: new Date().toISOString() }
  ];
  
  if (updates.name) {
    operations.push({ op: "replace", path: "/name", value: updates.name });
  }
  
  if (updates.description) {
    operations.push({ op: "replace", path: "/description", value: updates.description });
  }
  
  if (updates.permissions) {
    operations.push({ op: "replace", path: "/permissions", value: updates.permissions });
  }
  
  return await patchItem<RoleDefinition>(
    MEMBERSHIP_CONTAINER,
    roleId,
    operations,
    roleId // partition key is the role ID
  );
}

/**
 * Get assigned roles for a user in a specific resource
 * @param userId The user's ID
 * @param resourceType Type of resource
 * @param resourceId ID of the resource
 */
export async function getUserAssignedRoles(
  userId: string,
  resourceType: "workspace" | "project",
  resourceId: string
): Promise<AssignedRole | null> {
  try {
    const query = `
      SELECT * FROM c 
      WHERE c.type = 'assigned-roles'
      AND c.userId = @userId 
      AND c.resourceType = @resourceType 
      AND c.resourceId = @resourceId
    `;
    
    const parameters = [
      { name: "@userId", value: userId },
      { name: "@resourceType", value: resourceType },
      { name: "@resourceId", value: resourceId }
    ];
    
    const results = await queryItems<AssignedRole>(
      MEMBERSHIP_CONTAINER, 
      query, 
      parameters
    );
    
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error(`Error getting user assigned roles: ${error}`);
    return null;
  }
}

/**
 * Assign roles to a user for a specific resource
 * @param userId The user's ID
 * @param resourceType Type of resource
 * @param resourceId ID of the resource
 * @param roleIds Array of role IDs to assign
 * @param assignerId ID of the user making the assignment
 * @param isGuest Whether this is a guest assignment
 * @param expiresAt Optional expiration date
 */
export async function assignRolesToUser(
  userId: string,
  resourceType: "workspace" | "project",
  resourceId: string,
  roleIds: string[],
  assignerId: string,
  isGuest = false,
  expiresAt?: string
): Promise<AssignedRole> {
  try {
    // Check if user already has assigned roles for this resource
    const existingAssignment = await getUserAssignedRoles(userId, resourceType, resourceId);
    
    if (existingAssignment) {
      // Update existing assignment
      const uniqueRoles = Array.from(new Set([...existingAssignment.roles, ...roleIds]));
      
      const operations: PatchOperation[] = [
        { op: "replace", path: "/roles", value: uniqueRoles },
        { op: "replace", path: "/assigned_by", value: assignerId },
        { op: "replace", path: "/assigned_at", value: new Date().toISOString() }
      ];
      
      if (isGuest) {
        operations.push({ op: "replace", path: "/assignment_type", value: "guest" });
      }
      
      if (expiresAt) {
        operations.push({ op: "replace", path: "/expires_at", value: expiresAt });
      }
      
      return await patchItem<AssignedRole>(
        MEMBERSHIP_CONTAINER,
        existingAssignment.id,
        operations,
        existingAssignment.id // partition key is the assignment ID
      );
    } else {
      // Create new assignment
      const newAssignment: AssignedRole = {
        id: nanoid(),
        type: "assigned-roles",
        userId,
        roles: roleIds,
        resourceId,
        resourceType,
        assignment_type: isGuest ? "guest" : "guest", // This seems odd in your model but keeping as is
        assigned_by: assignerId,
        assigned_at: new Date().toISOString(),
        expires_at: expiresAt
      };
      
      return await createItem<AssignedRole>(
        MEMBERSHIP_CONTAINER,
        newAssignment
      );
    }
  } catch (error) {
    console.error(`Error assigning roles to user: ${error}`);
    throw error;
  }
}

/**
 * Remove roles from a user for a specific resource
 * @param userId The user's ID
 * @param resourceType Type of resource
 * @param resourceId ID of the resource
 * @param roleIds Array of role IDs to remove
 */
export async function removeRolesFromUser(
  userId: string,
  resourceType: "workspace" | "project",
  resourceId: string,
  roleIds: string[]
): Promise<AssignedRole | null> {
  try {
    const existingAssignment = await getUserAssignedRoles(userId, resourceType, resourceId);
    
    if (!existingAssignment) {
      return null;
    }
    
    // Filter out the roles to remove
    const updatedRoles = existingAssignment.roles.filter(id => !roleIds.includes(id));
    
    if (updatedRoles.length === 0) {
      // If no roles left, delete the assignment
      await deleteItem(
        MEMBERSHIP_CONTAINER,
        existingAssignment.id,
        existingAssignment.id // partition key is the assignment ID
      );
      return null;
    } else {
      // Update with remaining roles
      const operations: PatchOperation[] = [
        { op: "replace", path: "/roles", value: updatedRoles },
        { op: "replace", path: "/assigned_at", value: new Date().toISOString() }
      ];
      
      return await patchItem<AssignedRole>(
        MEMBERSHIP_CONTAINER,
        existingAssignment.id,
        operations,
        existingAssignment.id // partition key is the assignment ID
      );
    }
  } catch (error) {
    console.error(`Error removing roles from user: ${error}`);
    return null;
  }
}

/**
 * Get all role exceptions for a user
 * @param userId The user's ID
 */
export async function getUserExceptions(userId: string): Promise<RoleException | null> {
  try {
    const query = `
      SELECT * FROM c 
      WHERE c.type = 'role-exceptions'
      AND c.resourceType = 'user'
      AND c.resourceId = @userId
    `;
    
    const parameters = [
      { name: "@userId", value: userId }
    ];
    
    const results = await queryItems<RoleException>(
      MEMBERSHIP_CONTAINER, 
      query, 
      parameters
    );
    
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error(`Error getting user exceptions: ${error}`);
    return null;
  }
}

/**
 * Create or update exceptions for a user
 * @param userId The user's ID
 * @param permissions Array of permission strings
 * @param reason Reason for the exceptions
 * @param creatorId ID of the user creating the exceptions
 * @param expiresAt Optional expiration date
 */
export async function setUserExceptions(
  userId: string,
  permissions: string[],
  reason: string,
  creatorId: string,
  expiresAt?: string
): Promise<RoleException> {
  try {
    const existingExceptions = await getUserExceptions(userId);
    
    if (existingExceptions) {
      // Update existing exceptions
      const operations: PatchOperation[] = [
        { op: "replace", path: "/permissions", value: permissions },
        { op: "replace", path: "/reason", value: reason },
        { op: "replace", path: "/created_by", value: creatorId },
        { op: "replace", path: "/created_at", value: new Date().toISOString() }
      ];
      
      if (expiresAt) {
        operations.push({ op: "replace", path: "/expires_at", value: expiresAt });
      } else if (existingExceptions.expires_at) {
        operations.push({ op: "remove", path: "/expires_at" });
      }
      
      return await patchItem<RoleException>(
        MEMBERSHIP_CONTAINER,
        existingExceptions.id,
        operations,
        existingExceptions.id // partition key is the exception ID
      );
    } else {
      // Create new exceptions
      const newExceptions: RoleException = {
        id: nanoid(),
        type: "role-exceptions",
        resourceId: userId,
        resourceType: "user",
        permissions,
        reason,
        created_by: creatorId,
        created_at: new Date().toISOString(),
        expires_at: expiresAt
      };
      
      return await createItem<RoleException>(
        MEMBERSHIP_CONTAINER,
        newExceptions
      );
    }
  } catch (error) {
    console.error(`Error setting user exceptions: ${error}`);
    throw error;
  }
}

/**
 * Clear all exceptions for a user
 * @param userId The user's ID
 */
export async function clearUserExceptions(userId: string): Promise<void> {
  try {
    const existingExceptions = await getUserExceptions(userId);
    
    if (existingExceptions) {
      await deleteItem(
        MEMBERSHIP_CONTAINER,
        existingExceptions.id,
        existingExceptions.id // partition key is the exception ID
      );
    }
  } catch (error) {
    console.error(`Error clearing user exceptions: ${error}`);
    throw error;
  }
}

/**
 * Get all permissions for a user in a specific resource
 * @param userId The user's ID
 * @param resourceType Type of resource
 * @param resourceId ID of the resource
 */
export async function getUserPermissions(
  userId: string,
  resourceType: "workspace" | "project",
  resourceId: string
): Promise<string[]> {
  try {
    // 1. Get user's assigned roles for this resource
    const assignedRoles = await getUserAssignedRoles(userId, resourceType, resourceId);
    
    if (!assignedRoles) {
      return [];
    }
    
    // 2. Get role definitions for each assigned role
    const rolePermissions: string[] = [];
    
    for (const roleId of assignedRoles.roles) {
      const role = await getRoleDefinition(roleId);
      if (role) {
        rolePermissions.push(...role.permissions);
      }
    }
    
    // 3. Get any exceptions for this user
    const exceptions = await getUserExceptions(userId);
    const exceptionPermissions = exceptions ? exceptions.permissions : [];
    
    // 4. Combine permissions, with exceptions taking precedence
    return [...rolePermissions, ...exceptionPermissions];
  } catch (error) {
    console.error(`Error getting user permissions: ${error}`);
    return [];
  }
}

/**
 * Check if a user has a specific permission
 * @param userId The user's ID
 * @param resourceType Type of resource the permission applies to
 * @param resourceId ID of the resource the permission applies to
 * @param scope Permission scope
 * @param action Permission action
 */
export async function userHasPermission(
  userId: string,
  resourceType: string,
  resourceId: string,
  scope: string,
  action: string
): Promise<boolean> {
  // First check if user has active membership
  const membership = await getMembership(
    userId, 
    resourceType as "workspace" | "project", 
    resourceId
  );
  
  if (!membership || membership.status !== "active") {
    return false;
  }
  
  // Get all permissions
  const permissions = await getUserPermissions(
    userId, 
    resourceType as "workspace" | "project", 
    resourceId
  );
  
  // Construct the permission string to check
  const permissionToCheck = `${resourceType}:${resourceId}:${scope}:${action}:allow`;
  
  // Check if permission is allowed
  return isPermissionAllowed(permissions, permissionToCheck);
}

/**
 * Check if a user can perform common actions on a resource
 */
export async function userCanRead(
  userId: string,
  resourceType: string,
  resourceId: string,
  scope: string
): Promise<boolean> {
  return userHasPermission(userId, resourceType, resourceId, scope, "read");
}

export async function userCanWrite(
  userId: string,
  resourceType: string,
  resourceId: string,
  scope: string
): Promise<boolean> {
  return userHasPermission(userId, resourceType, resourceId, scope, "write");
}

export async function userCanCreate(
  userId: string,
  resourceType: string,
  resourceId: string,
  scope: string
): Promise<boolean> {
  return userHasPermission(userId, resourceType, resourceId, scope, "create");
}

export async function userCanDelete(
  userId: string,
  resourceType: string,
  resourceId: string,
  scope: string
): Promise<boolean> {
  return userHasPermission(userId, resourceType, resourceId, scope, "delete");
}

export async function userCanAdmin(
  userId: string,
  resourceType: string,
  resourceId: string,
  scope: string
): Promise<boolean> {
  return userHasPermission(userId, resourceType, resourceId, scope, "admin");
}

/**
 * Get all permissions a user has in the system
 * This is an expensive operation and should be used sparingly
 * @param userId The user's ID
 */
export async function getAllUserPermissions(userId: string): Promise<Record<string, string[]>> {
  try {
    // 1. Get all user memberships
    const memberships = await getUserMemberships(userId, "active");
    
    // 2. Get permissions for each resource
    const permissionsByResource: Record<string, string[]> = {};
    
    for (const membership of memberships) {
      const { resourceType, resourceId } = membership;
      const key = `${resourceType}:${resourceId}`;
      
      const permissions = await getUserPermissions(userId, resourceType, resourceId);
      permissionsByResource[key] = permissions;
    }
    
    return permissionsByResource;
  } catch (error) {
    console.error(`Error getting all user permissions: ${error}`);
    return {};
  }
}