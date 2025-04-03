// @filename: onboarding/activities/setup-user-workspace.ts
import type { PatchOperation } from '@azure/cosmos';
import type { ActivityHandler } from 'durable-functions';
import type { User, Membership, Workspace } from '~/types/operational';

import { readItem, queryItems, patchItem } from '~/utils/cosmos';

interface SetupUserForWorkspaceInput {
  userId: string;
  workspaceId: string;
}

/**
 * Sets up user preferences and configurations after they join a workspace
 */
const SetupUserForWorkspaceHandler: ActivityHandler = async (
  input: SetupUserForWorkspaceInput, 
  context
) => {
  const { userId, workspaceId } = input;
  
  // Get user, workspace and membership information
  const user = await readItem<User>('users', userId);
  const workspace = await readItem<Workspace>('workspaces', workspaceId);
  
  if (!user || !workspace) {
    throw new Error(`User or workspace not found: userId=${userId}, workspaceId=${workspaceId}`);
  }
  
  // Find the membership to ensure it exists and is active
  const memberships = await queryItems<Membership>(
    'membership',
    'SELECT * FROM c WHERE c.userId = @userId AND c.resourceType = "workspace" AND c.resourceId = @resourceId',
    [
      { name: '@userId', value: userId },
      { name: '@resourceId', value: workspaceId }
    ]
  );
  
  const membership = memberships.find(m => m.status === 'active');
  
  if (!membership) {
    throw new Error(`Active membership not found for user ${userId} in workspace ${workspaceId}`);
  }
  
  // Update user preferences to align with workspace defaults if not already set
  const userUpdates: PatchOperation[] = [];
  
  // Set user's default language to workspace default if not already set
  if (workspace.settings?.defaultLocale && 
      (!user.preferences || user.preferences.language === 'en')) {
    userUpdates.push({
      op: 'replace',
      path: '/preferences/language',
      value: workspace.settings.defaultLocale
    });
  }
  
  // Set user's lastActiveAt for this workspace
  const now = new Date().toISOString();
  await patchItem<Membership>(
    'membership',
    membership.id,
    [{ op: 'replace', path: '/lastActiveAt', value: now }]
  );
  
  // Apply user preference updates if needed
  if (userUpdates.length > 0) {
    userUpdates.push({
      op: 'replace',
      path: '/modifiedAt',
      value: now
    });
    
    await patchItem<User>('users', userId, userUpdates);
  }
  
  return {
    userId,
    workspaceId,
    setupComplete: true,
    timestamp: now,
    membershipId: membership.id,
    preferencesUpdated: userUpdates.length > 0
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
    preferencesUpdated: boolean;
  }
};