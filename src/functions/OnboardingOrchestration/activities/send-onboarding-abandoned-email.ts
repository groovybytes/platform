// @filename: onboarding/activities/send-onboarding-abandoned-email.ts
import type { ActivityHandler } from 'durable-functions';
import { sendOnboardingAbandonedEmail } from '~/utils/email';

interface SendOnboardingAbandonedEmailInput {
  userId: string;
  email: string;
  name: string;
  type: 'workspace' | 'project' | 'invite';
}

/**
 * Send email notification that onboarding has been abandoned
 */
const SendOnboardingAbandonedEmailHandler: ActivityHandler = async (
  input: SendOnboardingAbandonedEmailInput, 
  context
) => {
  const { email, name, type } = input;
  
  await sendOnboardingAbandonedEmail(email, name, type);
  
  return {
    emailSent: true,
    timestamp: new Date().toISOString(),
    recipient: email,
    type
  };
};

// Export the activity definition
export default {
  Name: 'SendOnboardingAbandonedEmail',
  Handler: SendOnboardingAbandonedEmailHandler,
  Input: {} as SendOnboardingAbandonedEmailInput,
  Output: {} as { 
    emailSent: boolean;
    timestamp: string;
    recipient: string;
    type: 'workspace' | 'project' | 'invite';
  }
};