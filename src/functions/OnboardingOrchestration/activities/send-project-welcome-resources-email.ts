// @filename: onboarding/activities/send-project-welcome-resources.ts
import type { ActivityHandler } from 'durable-functions';
import type { User, Project } from '~/types/operational';
import { BASE_URL } from '~/utils/config';

import { readItem } from '~/utils/cosmos';
import { sendEmail } from '~/utils/email';

interface SendProjectWelcomeResourcesEmailInput {
  userId: string;
  projectId: string;
  workspaceId: string;
}

/**
 * Sends welcome resources specific to a project to help the user get started
 */
const SendProjectWelcomeResourcesEmailHandler: ActivityHandler = async (
  input: SendProjectWelcomeResourcesEmailInput, 
  context
) => {
  const { userId, projectId, workspaceId } = input;
  
  // Get user and project information
  const user = await readItem<User>('users', userId);
  const project = await readItem<Project>('projects', projectId);
  
  if (!user || !project) {
    throw new Error(`User or project not found: userId=${userId}, projectId=${projectId}`);
  }
  
  // Build links specific to this project
  const appBaseUrl = BASE_URL as string;
  const projectUrl = `${appBaseUrl}/workspaces/${workspaceId}/projects/${projectId}`;
  const documentsUrl = `${projectUrl}/documents`;
  const tasksUrl = `${projectUrl}/tasks`;
  const settingsUrl = `${projectUrl}/settings`;
  
  // Send welcome resources email
  await sendEmail({
    to: user.emails.primary,
    content: {
      subject: `Getting started with ${project.name}`,
      htmlBody: `
        <p>Hello ${user.name},</p>
        
        <p>Welcome to your new project <strong>${project.name}</strong>! Here are some resources to help you get started:</p>
        
        <h3>Project Quick Links</h3>
        <ul>
          <li><a href="${projectUrl}/dashboard">Project Dashboard</a> - Your project overview</li>
          <li><a href="${documentsUrl}">Documents</a> - Create and manage project documents</li>
          <li><a href="${tasksUrl}">Tasks</a> - Track and manage project tasks</li>
          <li><a href="${projectUrl}/team">Team</a> - See who's on your project team</li>
          <li><a href="${settingsUrl}">Settings</a> - Configure your project settings</li>
        </ul>
        
        <h3>Project Resources</h3>
        <ul>
          <li><a href="${appBaseUrl}/help/projects/getting-started">Project Getting Started Guide</a></li>
          <li><a href="${appBaseUrl}/help/projects/best-practices">Project Best Practices</a></li>
          <li><a href="${appBaseUrl}/help/projects/tutorials">Project Tutorials</a></li>
        </ul>
        
        <p>We've added some sample content to help you get familiar with the platform. Feel free to explore!</p>
        
        <p>If you need any assistance, our support team is ready to help.</p>
        
        <p>Best regards,<br>The Platform Team</p>
      `,
      textBody: `
        Hello ${user.name},
        
        Welcome to your new project "${project.name}"! Here are some resources to help you get started:
        
        PROJECT QUICK LINKS
        - Project Dashboard: ${projectUrl}/dashboard
        - Documents: ${documentsUrl}
        - Tasks: ${tasksUrl}
        - Team: ${projectUrl}/team
        - Settings: ${settingsUrl}
        
        PROJECT RESOURCES
        - Project Getting Started Guide: ${appBaseUrl}/help/projects/getting-started
        - Project Best Practices: ${appBaseUrl}/help/projects/best-practices
        - Project Tutorials: ${appBaseUrl}/help/projects/tutorials
        
        We've added some sample content to help you get familiar with the platform. Feel free to explore!
        
        If you need any assistance, our support team is ready to help.
        
        Best regards,
        The Platform Team
      `
    }
  });
  
  return {
    userId,
    projectId,
    workspaceId,
    resourcesSent: true,
    timestamp: new Date().toISOString(),
    recipient: user.emails.primary,
    resourceType: 'project'
  };
};

// Export the activity definition
export default {
  Name: 'SendProjectWelcomeResourcesEmail',
  Handler: SendProjectWelcomeResourcesEmailHandler,
  Input: {} as SendProjectWelcomeResourcesEmailInput,
  Output: {} as { 
    userId: string;
    projectId: string;
    workspaceId: string;
    resourcesSent: boolean;
    timestamp: string;
    recipient: string;
    resourceType: string;
  }
};