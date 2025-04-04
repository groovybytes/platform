// @filename: onboarding-orchestration/activities/setup-user-for-workspace.ts
import type { User, Membership, Workspace, RoleDefinition, AssignedRole } from '~/types/operational';
import type { ActivityHandler } from 'durable-functions';
import { assignUserToWorkspaceRole } from '~/functions/workspace-management/_settings';

import { readItem, queryItems, patchItem } from '~/utils/cosmos/utils';
import { createUserResourcePermissionChecker } from '~/utils/permissions/user';

interface SetupUserForWorkspaceInput {
  userId: string;
  workspaceId: string;
}

/**
 * Sets up user access, roles, and initial configuration when they join a workspace
 */
const SetupUserForWorkspaceHandler: ActivityHandler = async (
  input: SetupUserForWorkspaceInput, 
  context
) => {
  const { userId, workspaceId } = input;
  
  // Get user, workspace and membership information
  const user = await readItem<User>('users', userId, userId);
  const workspace = await readItem<Workspace>('workspaces', workspaceId, workspaceId);
  
  if (!user || !workspace) {
    throw new Error(`User or workspace not found: userId=${userId}, workspaceId=${workspaceId}`);
  }
  
  // Find the membership to ensure it exists and is active
  const memberships = await queryItems<Membership>(
    'membership',
    'SELECT * FROM c WHERE c.userId = @userId AND c.resourceType = "workspace" AND c.resourceId = @resourceId',
    [
      { name: '@userId', value: userId },
      { name: '@resourceType', value: 'workspace' },
      { name: '@resourceId', value: workspaceId }
    ]
  );
  
  const membership = memberships.find(m => m.status === 'active');
  
  if (!membership) {
    throw new Error(`Active membership not found for user ${userId} in workspace ${workspaceId}`);
  }
  
  // Check if the user already has an assigned role
  const assignedRoles = await queryItems<AssignedRole>(
    'membership',
    'SELECT * FROM c WHERE c.type = "assigned-roles" AND c.userId = @userId AND c.resourceType = "workspace" AND c.resourceId = @resourceId',
    [
      { name: '@userId', value: userId },
      { name: '@resourceType', value: 'workspace' },
      { name: '@resourceId', value: workspaceId }
    ]
  );
  
  let userRole: AssignedRole | null = null;
  
  // If the user doesn't have a role yet, assign them the default workspace member role
  if (assignedRoles.length === 0) {
    // Find the workspace member role
    const workspaceMemberRoles = await queryItems<RoleDefinition>(
      'membership',
      'SELECT * FROM c WHERE c.type = "role" AND c.resourceType = "workspace" AND c.resourceId = @resourceId AND c.name = @roleName',
      [
        { name: '@resourceId', value: workspaceId },
        { name: '@roleName', value: 'Workspace Member' }
      ]
    );
    
    if (workspaceMemberRoles.length === 0) {
      context.warn(`No workspace member role found for workspace ${workspaceId}`);
    } else {
      // Assign the workspace member role to the user
      const memberRole = workspaceMemberRoles[0];
      const isGuest = membership.membershipType === 'guest';
      
      userRole = await assignUserToWorkspaceRole(
        userId,
        workspaceId,
        memberRole.id,
        userId, // Assigning on behalf of the user themselves
        isGuest
      );
      
      context.log(`Assigned ${isGuest ? 'guest' : 'member'} role ${memberRole.id} to user ${userId} for workspace ${workspaceId}`);
    }
  } else {
    userRole = assignedRoles[0];
    context.log(`User ${userId} already has role assignment for workspace ${workspaceId}`);
  }
  
  // Update user preferences to align with workspace defaults if not already set
  const userUpdates: any[] = [];
  
  // Set user's default language to workspace default if not already set
  if (workspace.settings?.defaultLocale && 
      (!user.preferences || user.preferences.language === 'en-US')) {
    if (!user.preferences) {
      // Create preferences object if it doesn't exist
      userUpdates.push({ 
        op: 'add', 
        path: '/preferences', 
        value: { 
          language: workspace.settings.defaultLocale,
          timezone: 'UTC'
        }
      });
    } else {
      // Just update the language
      userUpdates.push({
        op: 'replace',
        path: '/preferences/language',
        value: workspace.settings.defaultLocale
      });
    }
  }
  
  // Set user's lastActiveAt for this workspace
  const now = new Date().toISOString();
  await patchItem<Membership>(
    'membership',
    membership.id,
    [{ op: 'replace', path: '/lastActiveAt', value: now }],
    [membership.resourceType, membership.resourceId]
  );
  
  // Apply user preference updates if needed
  if (userUpdates.length > 0) {
    userUpdates.push({
      op: 'replace',
      path: '/modifiedAt',
      value: now
    });
    
    await patchItem<User>('users', userId, userUpdates, userId);
  }
  
  // Get the user's effective permissions for this workspace
  let permissions: string[] = [];
  try {
    const permissionChecker = await createUserResourcePermissionChecker(userId, 'workspace', workspaceId);
    permissions = permissionChecker.getPermissions();
  } catch (error) {
    context.warn(`Failed to get permissions for user ${userId} in workspace ${workspaceId}: ${error}`);
  }
  
  return {
    userId,
    workspaceId,
    setupComplete: true,
    timestamp: now,
    membershipId: membership.id,
    roleId: userRole?.id,
    preferencesUpdated: userUpdates.length > 0,
    permissionCount: permissions.length
  };
};

// Export the activity definition
export default {
  Name: 'SetupUserForWorkspace',
  Handler: SetupUserForWorkspaceHandler,
  Input: {} as SetupUserForWorkspaceInput,
  Output: {} as { 
    userId: string;
    workspaceId: string;
    setupComplete: boolean;
    timestamp: string;
    membershipId: string;
    roleId?: string;
    preferencesUpdated: boolean;
    permissionCount: number;
  }
};