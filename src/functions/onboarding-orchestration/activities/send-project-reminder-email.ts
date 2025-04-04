// @filename: onboarding/activities/send-project-reminder-email.ts
import type { ActivityHandler } from 'durable-functions';
import type { User, Workspace } from '~/types/operational';
import { FRONTEND_BASE_URL } from '~/utils/config';

import { readItem } from '~/utils/cosmos/utils';
import { sendEmail } from '~/utils/email';

/**
 * Sends a reminder email to create a project during onboarding
 */
const SendProjectReminderEmailHandler: ActivityHandler = async (
  input: SendProjectReminderEmailInput, 
  context
) => {
  const { userId, workspaceId, attempt, maxAttempts } = input;
  
  // Get user and workspace information
  const user = await readItem<User>('users', userId);
  const workspace = await readItem<Workspace>('workspaces', workspaceId);
  
  if (!user || !workspace) {
    throw new Error(`User or workspace not found: userId=${userId}, workspaceId=${workspaceId}`);
  }
  
  // Build the reminder email content based on the attempt number
  const newProjectUrl = `${FRONTEND_BASE_URL}/projects/new?workspaceId=${workspaceId}`;
  const remainingAttempts = maxAttempts - attempt;
  
  // Create subject and message based on urgency level
  let subject: string;
  let message: string;
  
  if (attempt === 1) {
    // First reminder - gentle nudge
    subject = `Create your first project in ${workspace.name}`;
    message = `
      <p>Hello ${user.name},</p>
      
      <p>We noticed you haven't created any projects in your workspace <strong>${workspace.name}</strong> yet.</p>
      
      <p>Projects help you organize your work and collaborate with your team more effectively. Creating your first project only takes a minute!</p>
    `;
  } else if (attempt === maxAttempts - 1) {
    // Second-to-last reminder - more urgency
    subject = `Reminder: Create a project in ${workspace.name} soon`;
    message = `
      <p>Hello ${user.name},</p>
      
      <p>This is a friendly reminder that your workspace <strong>${workspace.name}</strong> doesn't have any projects yet.</p>
      
      <p>Projects are essential for organizing your work and collaborating with your team. Without a project, you won't be able to take full advantage of the platform's features.</p>
      
      <p>Please take a moment to create your first project:</p>
    `;
  } else {
    // Final reminder - very urgent
    subject = `Final reminder: Project creation needed in ${workspace.name}`;
    message = `
      <p>Hello ${user.name},</p>
      
      <p><strong>Important notice:</strong> This is your final reminder to create a project in your workspace <strong>${workspace.name}</strong>.</p>
      
      <p>Without a project, you won't be able to access many of the platform's key features. Creating a project is quick and easy:</p>
    `;
  }
  
  // Send the reminder email
  await sendEmail({
    to: user.emails.primary,
    content: {
      subject,
      htmlBody: `
        ${message}
        <p><a href="${newProjectUrl}" style="padding: 10px 15px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 4px;">Create Project Now</a></p>
        
        <p>If you need help creating a project or have any questions, our support team is ready to assist you.</p>
        
        <p>Best regards,<br>The Platform Team</p>
      `,
      textBody: `
        Hello ${user.name},
        
        ${subject}
        
        To create a project, please visit:
        ${newProjectUrl}
        
        If you need help creating a project or have any questions, our support team is ready to assist you.
        
        Best regards,
        The Platform Team
      `
    }
  });
  
  return {
    userId,
    workspaceId,
    emailSent: true,
    timestamp: new Date().toISOString(),
    recipient: user.emails.primary,
    reminderNumber: attempt,
    maxReminders: maxAttempts,
    workspaceName: workspace.name
  };
};

interface SendProjectReminderEmailInput {
  userId: string;
  workspaceId: string;
  attempt: number;
  maxAttempts: number;
}

// Export the activity definition
export default {
  Name: 'SendProjectReminderEmail',
  Handler: SendProjectReminderEmailHandler,
  Input: {} as SendProjectReminderEmailInput,
  Output: {} as { 
    userId: string;
    workspaceId: string;
    emailSent: boolean;
    timestamp: string;
    recipient: string;
    reminderNumber: number;
    maxReminders: number;
    workspaceName: string;
  }
};