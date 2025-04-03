// @filename: onboarding/activities/setup-user-project.ts
import type { ActivityHandler } from 'durable-functions';
import type { User, Membership, Project } from '~/types/operational';

import { readItem, queryItems, patchItem } from '~/utils/cosmos';

interface SetupUserForProjectInput {
  userId: string;
  projectId: string;
}

/**
 * Sets up user access and initial configuration when they join a project
 */
const SetupUserForProjectHandler: ActivityHandler = async (
  input: SetupUserForProjectInput, 
  context
) => {
  const { userId, projectId } = input;
  
  // Get user and project information
  const user = await readItem<User>('users', userId);
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
      { name: '@resourceId', value: projectId }
    ]
  );
  
  const membership = memberships.find(m => m.status === 'active');
  
  if (!membership) {
    throw new Error(`Active membership not found for user ${userId} in project ${projectId}`);
  }
  
  // Check if user also has workspace access
  const workspaceId = project.workspaceId;
  const workspaceMemberships = await queryItems<Membership>(
    'membership',
    'SELECT * FROM c WHERE c.userId = @userId AND c.resourceType = "workspace" AND c.resourceId = @resourceId',
    [
      { name: '@userId', value: userId },
      { name: '@resourceId', value: workspaceId }
    ]
  );
  
  const workspaceMembership = workspaceMemberships.find(m => m.status === 'active');
  
  if (!workspaceMembership) {
    context.warn(`User ${userId} has project access but no workspace access for workspace ${workspaceId}`);
  }
  
  // Set user's lastActiveAt for this project
  const now = new Date().toISOString();
  await patchItem<Membership>(
    'membership',
    membership.id,
    [{ op: 'replace', path: '/lastActiveAt', value: now }]
  );
  
  // If there are project-specific settings that should be initialized for the user,
  // they would be set up here.
  
  return {
    userId,
    projectId,
    workspaceId,
    setupComplete: true,
    timestamp: now,
    membershipId: membership.id,
    hasWorkspaceAccess: !!workspaceMembership
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
    hasWorkspaceAccess: boolean;
  }
};