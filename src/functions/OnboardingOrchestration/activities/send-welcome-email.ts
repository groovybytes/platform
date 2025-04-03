// @filename: onboarding/activities/send-welcome-email.ts
import type { ActivityHandler } from 'durable-functions';
import { sendWelcomeEmail } from '~/utils/email';

export interface SendWelcomeEmailInput {
  userId: string;
  email: string;
  name: string;
}

/**
 * Send welcome email to newly onboarded user
 */
const SendWelcomeEmailHandler: ActivityHandler = async (
  input: SendWelcomeEmailInput, 
  context
) => {
  const { email, name } = input;
  
  await sendWelcomeEmail(email, name);
  
  return {
    emailSent: true,
    timestamp: new Date().toISOString(),
    recipient: email
  };
};

// Export the activity definition
export default {
  Name: 'SendWelcomeEmail',
  Handler: SendWelcomeEmailHandler,
  Input: {} as SendWelcomeEmailInput,
  Output: {} as { emailSent: boolean; timestamp: string; recipient: string }
};