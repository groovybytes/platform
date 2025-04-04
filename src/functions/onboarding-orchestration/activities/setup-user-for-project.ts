// @filename: onboarding-orchestration/activities/setup-user-for-project.ts
import type { ActivityHandler } from 'durable-functions';
import type { User, Membership, Project, RoleDefinition, AssignedRole } from '~/types/operational';

import { readItem, queryItems, patchItem } from '~/utils/cosmos/utils';
import { assignUserToProjectRole } from '~/functions/project-management/_settings';
import { createUserResourcePermissionChecker } from '~/utils/permissions/user';

interface SetupUserForProjectInput {
  userId: string;
  projectId: string;
}

/**
 * Sets up user access, roles, and initial configuration when they join a project
 */
const SetupUserForProjectHandler: ActivityHandler = async (
  input: SetupUserForProjectInput, 
  context
) => {
  const { userId, projectId } = input;
  
  // Get user and project information
  const user = await readItem<User>('users', userId, userId);
  const project = await readItem<Project>('projects', projectId);
  
  if (!user || !project) {
    throw new Error(`User or project not found: userId=${userId}, projectId=${projectId}`);
  }
  
  // Find the project membership to ensure it exists and is active
  const memberships = await queryItems<Membership>(
    'membership',
    'SELECT * FROM c WHERE c.userId = @userId AND c.resourceType = "project" AND c.resourceId = @resourceId',
    [
      { name: '@userId', value: userId },
      { name: '@resourceType', value: 'project' },
      { name: '@resourceId', value: projectId }
    ]
  );
  
  const membership = memberships.find(m => m.status === 'active');
  
  if (!membership) {
    throw new Error(`Active membership not found for user ${userId} in project ${projectId}`);
  }
  
  // Check if the user already has an assigned role
  const assignedRoles = await queryItems<AssignedRole>(
    'membership',
    'SELECT * FROM c WHERE c.type = "assigned-roles" AND c.userId = @userId AND c.resourceType = "project" AND c.resourceId = @resourceId',
    [
      { name: '@userId', value: userId },
      { name: '@resourceType', value: 'project' },
      { name: '@resourceId', value: projectId }
    ]
  );
  
  let userRole: AssignedRole | null = null;
  
  // If the user doesn't have a role yet, assign them the default project role
  if (assignedRoles.length === 0) {
    // Find the appropriate role for the user
    // For new users, start with Report Viewer role (most restricted)
    const roleToFind = membership.membershipType === 'guest' ? 'Report Viewer' : 'Data Analyst';
    
    const projectRoles = await queryItems<RoleDefinition>(
      'membership',
      'SELECT * FROM c WHERE c.type = "role" AND c.resourceType = "project" AND c.resourceId = @resourceId AND c.name = @roleName',
      [
        { name: '@resourceId', value: projectId },
        { name: '@roleName', value: roleToFind }
      ]
    );
    
    if (projectRoles.length === 0) {
      context.warn(`No ${roleToFind} role found for project ${projectId}`);
    } else {
      // Assign the role to the user
      const role = projectRoles[0];
      const isGuest = membership.membershipType === 'guest';
      
      userRole = await assignUserToProjectRole(
        userId,
        projectId,
        role.id,
        userId, // Assigning on behalf of the user themselves
        isGuest
      );
      
      context.log(`Assigned ${roleToFind} role ${role.id} to user ${userId} for project ${projectId}`);
    }
  } else {
    userRole = assignedRoles[0];
    context.log(`User ${userId} already has role assignment for project ${projectId}`);
  }
  
  // Check if user also has workspace access
  const workspaceId = project.workspaceId;
  const workspaceMemberships = await queryItems<Membership>(
    'membership',
    'SELECT * FROM c WHERE c.userId = @userId AND c.resourceType = "workspace" AND c.resourceId = @resourceId',
    [
      { name: '@userId', value: userId },
      { name: '@resourceType', value: 'workspace' },
      { name: '@resourceId', value: workspaceId }
    ]
  );
  
  const workspaceMembership = workspaceMemberships.find(m => m.status === 'active');
  
  // Set user's lastActiveAt for this project
  const now = new Date().toISOString();
  await patchItem<Membership>(
    'membership',
    membership.id,
    [{ op: 'replace', path: '/lastActiveAt', value: now }],
    [membership.resourceType, membership.resourceId]
  );
  
  // Get the user's effective permissions for this project
  let permissions: string[] = [];
  try {
    const permissionChecker = await createUserResourcePermissionChecker(userId, 'project', projectId);
    permissions = permissionChecker.getPermissions();
  } catch (error) {
    context.warn(`Failed to get permissions for user ${userId} in project ${projectId}: ${error}`);
  }
  
  return {
    userId,
    projectId,
    workspaceId,
    setupComplete: true,
    timestamp: now,
    membershipId: membership.id,
    roleId: userRole?.id,
    hasWorkspaceAccess: !!workspaceMembership,
    permissionCount: permissions.length
  };
};

// Export the activity definition
export default {
  Name: 'SetupUserForProject',
  Handler: SetupUserForProjectHandler,
  Input: {} as SetupUserForProjectInput,
  Output: {} as { 
    userId: string;
    projectId: string;
    workspaceId: string;
    setupComplete: boolean;
    timestamp: string;
    membershipId: string;
    roleId?: string;
    hasWorkspaceAccess: boolean;
    permissionCount: number;
  }
};