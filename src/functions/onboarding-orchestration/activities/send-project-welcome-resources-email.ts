// @filename: onboarding/activities/send-project-welcome-resources.ts
import type { ActivityHandler } from 'durable-functions';
import type { User, Project } from '~/types/operational';
import { FRONTEND_BASE_URL } from '~/utils/config';

import { readItem } from '~/utils/cosmos/utils';
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
  const projectUrl = `${FRONTEND_BASE_URL}/projects/${projectId}?workspaceId=${workspaceId}`;
  const assetsUrl = `${FRONTEND_BASE_URL}/assets?workspaceId=${workspaceId}&projectId=${projectId}`;
  const jobsUrl = `${FRONTEND_BASE_URL}/jobs?workspaceId=${workspaceId}&projectId=${projectId}`;
  const settingsUrl = `${FRONTEND_BASE_URL}/settings?workspaceId=${workspaceId}&projectId=${projectId}`;
  
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
          <li><a href="${assetsUrl}">Documents</a> - Create and manage project documents</li>
          <li><a href="${jobsUrl}">Jobs</a> - Track and manage project jobs</li>
          <li><a href="${projectUrl}/team">Team</a> - See who's on your project team</li>
          <li><a href="${settingsUrl}">Settings</a> - Configure your project settings</li>
        </ul>
        
        <h3>Project Resources</h3>
        <ul>
          <li><a href="${FRONTEND_BASE_URL}/help/projects/getting-started">Project Getting Started Guide</a></li>
          <li><a href="${FRONTEND_BASE_URL}/help/projects/best-practices">Project Best Practices</a></li>
          <li><a href="${FRONTEND_BASE_URL}/help/projects/tutorials">Project Tutorials</a></li>
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
        - Documents: ${assetsUrl}
        - Jobs: ${jobsUrl}
        - Team: ${projectUrl}/team
        - Settings: ${settingsUrl}
        
        PROJECT RESOURCES
        - Project Getting Started Guide: ${FRONTEND_BASE_URL}/help/projects/getting-started
        - Project Best Practices: ${FRONTEND_BASE_URL}/help/projects/best-practices
        - Project Tutorials: ${FRONTEND_BASE_URL}/help/projects/tutorials
        
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