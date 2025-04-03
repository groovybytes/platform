// @filename: onboarding/activities/send-workspace-reminder-email.ts
import type { ActivityHandler } from 'durable-functions';
import { sendWorkspaceReminderEmail } from '~/utils/email';

interface SendWorkspaceReminderEmailInput {
  userId: string;
  email: string;
  name: string;
  attempt: number;
  maxAttempts: number;
}

/**
 * Send reminder email for workspace creation
 */
const SendWorkspaceReminderEmailHandler: ActivityHandler = async (
  input: SendWorkspaceReminderEmailInput, 
  context
) => {
  const { email, name, attempt, maxAttempts } = input;
  
  await sendWorkspaceReminderEmail(email, name, attempt, maxAttempts);
  
  return {
    emailSent: true,
    timestamp: new Date().toISOString(),
    recipient: email,
    reminderNumber: attempt,
    maxReminders: maxAttempts
  };
};

// Export the activity definition
export default {
  Name: 'SendWorkspaceReminderEmail',
  Handler: SendWorkspaceReminderEmailHandler,
  Input: {} as SendWorkspaceReminderEmailInput,
  Output: {} as { 
    emailSent: boolean;
    timestamp: string;
    recipient: string;
    reminderNumber: number;
    maxReminders: number;
  }
};