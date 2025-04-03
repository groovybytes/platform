// @filename: onboarding/activities/handle-abandoned-project.ts
import type { ActivityHandler } from 'durable-functions';
import type { User, Workspace } from '~/types/operational';

import { readItem, createItem } from '~/utils/cosmos';
import { sendEmail } from '~/utils/email';
import { nanoid } from 'nanoid';

/**
 * Handles the case when a user abandons the project creation process
 * Sets up a default project and notifies the user
 */
const HandleAbandonedProjectHandler: ActivityHandler = async (
  input: HandleAbandonedProjectInput, 
  context
) => {
  const { userId, workspaceId } = input;
  
  // Get user and workspace information
  const user = await readItem<User>('users', userId);
  const workspace = await readItem<Workspace>('workspaces', workspaceId);
  
  if (!user || !workspace) {
    throw new Error(`User or workspace not found: userId=${userId}, workspaceId=${workspaceId}`);
  }
  
  // Create a default project for the user since they didn't create one
  const defaultProjectName = 'My First Project';
  const defaultProject = {
    id: nanoid(),
    workspaceId,
    name: defaultProjectName,
    slug: 'my-first-project',
    description: 'Your default project to help you get started',
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
  
  // Create the project in the database
  await createItem('projects', defaultProject);
  
  // Add a note to the project explaining it was auto-created
  const welcomeNote = {
    id: nanoid(),
    projectId: defaultProject.id,
    workspaceId,
    contentType: 'note',
    title: 'Welcome to your default project',
    content: `This project was automatically created for you to help you get started. You can rename it, customize it, or create additional projects as needed.`,
    status: 'active',
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    modifiedAt: new Date().toISOString(),
    modifiedBy: 'system'
  };
  
  await createItem('notes', welcomeNote);
  
  // Send notification email
  const appBaseUrl = process.env.APP_BASE_URL as string;
  const projectUrl = `${appBaseUrl}/workspaces/${workspaceId}/projects/${defaultProject.id}`;
  
  await sendEmail({
    to: user.emails.primary,
    content: {
      subject: `We've created a default project for you in ${workspace.name}`,
      htmlBody: `
        <p>Hello ${user.name},</p>
        
        <p>We noticed you haven't created a project in your workspace <strong>${workspace.name}</strong>, so we've created a default project to help you get started.</p>
        
        <p>Your new project "<strong>${defaultProjectName}</strong>" is ready for you to use. You can customize it or create additional projects at any time.</p>
        
        <p><a href="${projectUrl}" style="padding: 10px 15px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 4px;">View Your Project</a></p>
        
        <p>If you need any help getting started, our support team is ready to assist you.</p>
        
        <p>Best regards,<br>The Platform Team</p>
      `,
      textBody: `
        Hello ${user.name},
        
        We noticed you haven't created a project in your workspace "${workspace.name}", so we've created a default project to help you get started.
        
        Your new project "${defaultProjectName}" is ready for you to use. You can customize it or create additional projects at any time.
        
        View your project here:
        ${projectUrl}
        
        If you need any help getting started, our support team is ready to assist you.
        
        Best regards,
        The Platform Team
      `
    }
  });
  
  return {
    userId,
    workspaceId,
    projectId: defaultProject.id,
    projectName: defaultProjectName,
    handled: true,
    timestamp: new Date().toISOString(),
    emailSent: true,
    recipient: user.emails.primary
  };
};

interface HandleAbandonedProjectInput {
  userId: string;
  workspaceId: string;
}

// Export the activity definition
export default {
  Name: 'HandleAbandonedProject',
  Handler: HandleAbandonedProjectHandler,
  Input: {} as HandleAbandonedProjectInput,
  Output: {} as { 
    userId: string;
    workspaceId: string;
    projectId: string;
    projectName: string;
    handled: boolean;
    timestamp: string;
    emailSent: boolean;
    recipient: string;
  }
};