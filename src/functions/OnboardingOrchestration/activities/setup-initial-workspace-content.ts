// @filename: onboarding/activities/setup-initial-workspace-content.ts
import type { ActivityHandler } from 'durable-functions';
import type { Workspace } from '~/types/operational';

import { readItem, createItem } from '~/utils/cosmos/utils';
import { nanoid } from 'nanoid';

interface SetupInitialWorkspaceContentInput {
  userId: string;
  workspaceId: string;
}

/**
 * Set up initial content for a new workspace
 */
const SetupInitialWorkspaceContentHandler: ActivityHandler = async (
  input: SetupInitialWorkspaceContentInput, 
  context
) => {
  const { userId, workspaceId } = input;
  
  // Get the workspace
  const workspace = await readItem<Workspace>('workspaces', workspaceId);
  
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }
  
  // Create sample content based on workspace type
  // This would be expanded based on business requirements
  
  // Example: Create a default project
  const defaultProject = {
    id: nanoid(),
    workspaceId,
    name: 'Getting Started',
    slug: 'getting-started',
    description: 'Your first project to help you get familiar with the platform',
    status: 'active',
    settings: {
      defaultLocale: workspace.settings.defaultLocale,
      supportedLocales: workspace.settings.supportedLocales,
      security: {
        ipAllowlist: [],
        allowedOrigins: ['*']
      },
      features: {
        experimentationEnabled: false,
        advancedAnalytics: false,
        aiAssistant: true
      }
    },
    createdAt: new Date().toISOString(),
    createdBy: userId,
    modifiedAt: new Date().toISOString(),
    modifiedBy: userId
  };
  
  await createItem('projects', defaultProject);
  
  // Create other initial content as needed
  
  return {
    workspaceId,
    setupComplete: true,
    timestamp: new Date().toISOString(),
    initialContent: {
      defaultProjectId: defaultProject.id
    }
  };
};

// Export the activity definition
export default {
  Name: 'SetupInitialWorkspaceContent',
  Handler: SetupInitialWorkspaceContentHandler,
  Input: {} as SetupInitialWorkspaceContentInput,
  Output: {} as { 
    workspaceId: string;
    setupComplete: boolean;
    timestamp: string;
    initialContent: Record<string, any>;
  }
};