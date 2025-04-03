// @filename: onboarding/activities/setup-initial-project-content.ts
import type { ActivityHandler } from 'durable-functions';
import type { Project } from '~/types/operational';

import { readItem, createItem } from '~/utils/cosmos';
import { nanoid } from 'nanoid';

interface SetupInitialProjectContentInput {
  userId: string;
  projectId: string;
  workspaceId: string;
}

/**
 * Sets up initial content for a new project to help users get started
 */
const SetupInitialProjectContentHandler: ActivityHandler = async (
  input: SetupInitialProjectContentInput, 
  context
) => {
  const { userId, projectId, workspaceId } = input;
  
  // Get the project
  const project = await readItem<Project>('projects', projectId);
  
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  
  // Create sample content based on the project type and settings
  // This is a simplified example - in a real implementation, you'd have 
  // more complex logic to create appropriate starter content
  
  // Example: Create a sample document
  const sampleDocument = {
    id: nanoid(),
    projectId,
    workspaceId,
    name: 'Getting Started Guide',
    contentType: 'document',
    content: `# Welcome to Your New Project\n\nThis document will help you get started with your project "${project.name}".\n\n## Next Steps\n\n1. Invite team members\n2. Set up your project structure\n3. Define your goals and milestones\n`,
    status: 'published',
    createdAt: new Date().toISOString(),
    createdBy: userId,
    modifiedAt: new Date().toISOString(),
    modifiedBy: userId
  };
  
  // Example: Create a sample task list
  const sampleTaskList = {
    id: nanoid(),
    projectId,
    workspaceId,
    name: 'Project Setup Tasks',
    contentType: 'task-list',
    tasks: [
      {
        id: nanoid(),
        title: 'Review project settings',
        description: 'Make sure the project settings align with your needs',
        status: 'pending',
        priority: 'high',
        assignedTo: userId,
        dueDate: null
      },
      {
        id: nanoid(),
        title: 'Invite team members',
        description: 'Add your colleagues to this project',
        status: 'pending',
        priority: 'high',
        assignedTo: userId,
        dueDate: null
      },
      {
        id: nanoid(),
        title: 'Set up project milestones',
        description: 'Define key milestones and timelines',
        status: 'pending',
        priority: 'medium',
        assignedTo: userId,
        dueDate: null
      }
    ],
    createdAt: new Date().toISOString(),
    createdBy: userId,
    modifiedAt: new Date().toISOString(),
    modifiedBy: userId
  };
  
  // Create the content in the database
  // In a real implementation, you'd use the appropriate collection names
  // for your different content types
  await createItem('documents', sampleDocument);
  await createItem('task-lists', sampleTaskList);
  
  // Return information about the created content
  return {
    projectId,
    workspaceId,
    setupComplete: true,
    timestamp: new Date().toISOString(),
    initialContent: {
      documents: [sampleDocument.id],
      taskLists: [sampleTaskList.id]
    }
  };
};

// Export the activity definition
export default {
  Name: 'SetupInitialProjectContent',
  Handler: SetupInitialProjectContentHandler,
  Input: {} as SetupInitialProjectContentInput,
  Output: {} as { 
    projectId: string;
    workspaceId: string;
    setupComplete: boolean;
    timestamp: string;
    initialContent: {
      documents: string[];
      taskLists: string[];
      [key: string]: any;
    };
  }
};