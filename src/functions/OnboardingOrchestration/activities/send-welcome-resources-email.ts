// @filename: onboarding/activities/send-welcome-resources.ts
import type { ActivityHandler } from 'durable-functions';
import { readItem } from '~/utils/cosmos';
import { sendEmail } from '~/utils/email';

interface SendWelcomeResourcesEmailInput {
  userId: string;
  resourceType: 'workspace' | 'project';
  resourceId: string;
}

/**
 * Send welcome resources based on the resource type
 */
const SendWelcomeResourcesEmailHandler: ActivityHandler = async (
  input: SendWelcomeResourcesEmailInput, 
  context
) => {
  const { userId, resourceType, resourceId } = input;
  
  // Get user information
  const user = await readItem('users', userId);
  
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }
  
  // Get resource information
  let resourceName = '';
  
  if (resourceType === 'workspace') {
    const workspace = await readItem('workspaces', resourceId);
    resourceName = workspace ? workspace.name : 'your workspace';
  } else if (resourceType === 'project') {
    const project = await readItem('projects', resourceId);
    resourceName = project ? project.name : 'your project';
  }
  
  // Send welcome resources email
  await sendEmail({
    to: user.emails.primary,
    content: {
      subject: `Resources to get started with ${resourceName}`,
      htmlBody: `
        <p>Hello ${user.name},</p>
        
        <p>Here are some resources to help you get started with ${resourceName}:</p>
        
        <ul>
          <li><a href="https://docs.example.com/getting-started">Getting Started Guide</a></li>
          <li><a href="https://docs.example.com/tutorials">Video Tutorials</a></li>
          <li><a href="https://docs.example.com/faq">Frequently Asked Questions</a></li>
        </ul>
        
        <p>If you have any questions, our support team is ready to help!</p>
        
        <p>Best regards,<br>The Platform Team</p>
      `,
      textBody: `
        Hello ${user.name},
        
        Here are some resources to help you get started with ${resourceName}:
        
        - Getting Started Guide: https://docs.example.com/getting-started
        - Video Tutorials: https://docs.example.com/tutorials
        - FAQ: https://docs.example.com/faq
        
        If you have any questions, our support team is ready to help!
        
        Best regards,
        The Platform Team
      `
    }
  });
  
  return {
    resourceType,
    resourceId,
    resourcesSent: true,
    timestamp: new Date().toISOString(),
    recipient: user.emails.primary
  };
};

// Export the activity definition
export default {
  Name: 'SendWelcomeResourcesEmail',
  Handler: SendWelcomeResourcesEmailHandler,
  Input: {} as SendWelcomeResourcesEmailInput,
  Output: {} as { 
    resourceType: 'workspace' | 'project';
    resourceId: string;
    resourcesSent: boolean;
    timestamp: string;
    recipient: string;
  }
};